import { AdminRole, EnrollmentStatus, CourseType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LedgerClient, type LedgerEnrollment } from "./ledger-client";

export const dynamic = "force-dynamic";

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
function formatKorDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "신청",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강 단과",
};

// ─── Page ──────────────────────────────────────────────────────────────────────
export default async function EnrollmentLedgerPage({
  searchParams,
}: {
  searchParams: {
    cohortId?: string;
    status?: string;
    from?: string;
    to?: string;
    courseType?: string;
  };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // 기수 목록 (필터 드롭다운용)
  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    take: 30,
    select: { id: true, name: true },
  });

  // 필터 파싱
  const cohortId = searchParams.cohortId || "";
  const statusParam = (searchParams.status as EnrollmentStatus | "") || "";
  const fromParam = searchParams.from || "";
  const toParam = searchParams.to || "";
  const courseTypeParam = (searchParams.courseType as CourseType | "") || "";

  const fromDate = fromParam ? new Date(fromParam + "T00:00:00") : undefined;
  const toDate = toParam ? new Date(toParam + "T23:59:59") : undefined;

  // 수강 등록 조회
  const enrollmentsRaw = await prisma.courseEnrollment.findMany({
    where: {
      ...(cohortId ? { cohortId } : {}),
      ...(statusParam ? { status: statusParam } : {}),
      ...(courseTypeParam ? { courseType: courseTypeParam } : {}),
      ...((fromDate || toDate)
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    include: {
      student: { select: { name: true, phone: true, examNumber: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { student: { examNumber: "asc" } },
    take: 1000,
  });

  // Date 직렬화 (클라이언트 컴포넌트 전달용)
  const enrollments: LedgerEnrollment[] = enrollmentsRaw.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    courseType: e.courseType,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    regularFee: e.regularFee,
    discountAmount: e.discountAmount,
    finalFee: e.finalFee,
    status: e.status,
    isRe: e.isRe,
    createdAt: e.createdAt.toISOString(),
    student: {
      name: e.student.name,
      examNumber: e.student.examNumber,
      phone: e.student.phone ?? null,
    },
    cohort: e.cohort
      ? {
          name: e.cohort.name,
          startDate: e.cohort.startDate.toISOString(),
          endDate: e.cohort.endDate.toISOString(),
        }
      : null,
    product: e.product ? { name: e.product.name } : null,
    specialLecture: e.specialLecture ? { name: e.specialLecture.name } : null,
    staff: e.staff ? { name: e.staff.name } : null,
  }));

  // 필터 설명문 (인쇄용)
  const selectedCohort = cohorts.find((c) => c.id === cohortId);
  const filterDesc = [
    selectedCohort ? `기수: ${selectedCohort.name}` : "",
    courseTypeParam ? `유형: ${COURSE_TYPE_LABEL[courseTypeParam]}` : "",
    statusParam ? `상태: ${STATUS_LABEL[statusParam]}` : "",
    fromParam || toParam
      ? `기간: ${fromParam || "~"} ~ ${toParam || "현재"}`
      : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const today = new Date();
  const printDate = formatKorDate(today);

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* ── 인쇄 CSS ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .ledger-page {
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .ledger-table th,
          .ledger-table td {
            font-size: 9pt !important;
            padding: 3px 5px !important;
          }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      {/* ── 상단 네비 (화면 전용) ── */}
      <div className="no-print border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a
            href="/admin/enrollments"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-400"
          >
            ← 수강 목록
          </a>
          <span className="text-base font-semibold text-gray-800">수강대장</span>
          <div className="w-24" />
        </div>
      </div>

      {/* ── 클라이언트 컴포넌트 (필터 바 + KPI + 테이블 + 버튼) ── */}
      <LedgerClient
        enrollments={enrollments}
        cohorts={cohorts}
        initialFilters={{
          cohortId,
          status: statusParam,
          from: fromParam,
          to: toParam,
          courseType: courseTypeParam,
        }}
      />

      {/* ── 인쇄 전용 영역 ── */}
      <div
        className="ledger-page mx-auto hidden max-w-7xl px-6 pb-16 print:block"
        style={{
          fontFamily:
            "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        }}
      >
        {/* 인쇄 헤더 */}
        <div className="mb-6 text-center">
          <div className="text-sm text-gray-500">학원명 미설정</div>
          <div className="mt-1 border-y border-gray-900 py-3 text-2xl font-bold tracking-[0.4em]">
            수 강 대 장
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
            <span>{filterDesc || "전체 수강 등록 현황"}</span>
            <span>총 {enrollments.length}건</span>
            <span>출력일: {printDate}</span>
          </div>
        </div>

        {/* 인쇄용 테이블 */}
        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
            조회된 수강 등록 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="ledger-table w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1F4D3A] text-white">
                  {["번호", "학번", "성명", "연락처", "강좌명", "유형", "수강시작", "수강종료", "수강료", "상태", "담당자", "비고"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enr, idx) => {
                  const courseName =
                    enr.cohort?.name ??
                    enr.specialLecture?.name ??
                    enr.product?.name ??
                    "-";
                  const isEven = idx % 2 === 0;

                  function formatDate(d: string | null | undefined): string {
                    if (!d) return "-";
                    const dt = new Date(d);
                    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
                  }

                  return (
                    <tr key={enr.id} className={isEven ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono">
                        {enr.student.examNumber}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-semibold">
                        {enr.student.name}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono text-gray-600">
                        {enr.student.phone ?? "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-gray-800">
                        {courseName}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-xs text-gray-600">
                        {COURSE_TYPE_LABEL[enr.courseType]}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {formatDate(enr.startDate)}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {enr.endDate ? formatDate(enr.endDate) : "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right text-gray-800">
                        {enr.finalFee.toLocaleString("ko-KR")}원
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold">
                          {STATUS_LABEL[enr.status]}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                        {enr.staff?.name ?? "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">
                        {enr.isRe ? "재수강" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 서명란 */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <p className="text-center text-sm text-gray-600">
            위 내용이 사실임을 확인합니다.
          </p>
          <p className="mt-1 text-center text-sm text-gray-500">{printDate}</p>
          <div className="mt-8 flex items-end justify-center gap-16">
            <div className="flex flex-col items-center gap-1">
              <div className="h-14 w-28 border-b border-gray-400" />
              <span className="text-sm text-gray-500">학원장 (인)</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-14 w-28 border-b border-gray-400" />
              <span className="text-sm text-gray-500">담당자 (인)</span>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            학원 정보는 관리자 설정을 확인하세요
          </p>
        </div>
      </div>
    </div>
  );
}
