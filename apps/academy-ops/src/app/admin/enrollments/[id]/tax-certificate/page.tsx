import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { getPrisma } from "@/lib/prisma";
import { TaxCertPrintButton } from "./tax-cert-print-button";

export const dynamic = "force-dynamic";

function formatKorFullDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatKorDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatBirthDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")}`;
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
};

export default async function TaxCertificatePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;
  const context = await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const targetYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const yearStart = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${targetYear + 1}-01-01T00:00:00.000Z`);

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          birthDate: true,
          examNumber: true,
        },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  if (!enrollment) notFound();

  const academySettings = await getAcademySettingsByAcademyId(
    enrollment.academyId ?? context.activeAcademyId ?? context.academyId,
  );

  // 해당 연도에 해당되는 수납 내역 조회
  const payments = await prisma.payment.findMany({
    where: {
      enrollmentId: id,
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
    orderBy: { processedAt: "asc" },
    take: 20,
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);

  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌 미지정";

  const courseStart = formatKorDate(enrollment.startDate);
  const courseEnd = enrollment.endDate ? formatKorDate(enrollment.endDate) : "미정";

  const issuedAt = formatKorFullDate(new Date());
  const certNo = `TAX-${targetYear}-${id.slice(-8).toUpperCase()}`;

  const academyName = academySettings?.name || "학원명 미설정";
  const directorName = academySettings?.directorName || "";
  const academyAddress = academySettings?.address || "학원 주소는 관리자 설정을 확인하세요";
  const academyPhone = academySettings?.phone || "연락처는 관리자 설정을 확인하세요";
  const businessRegNo = academySettings?.businessRegNo || "";

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          .doc-wrapper {
            padding: 0 !important;
            background: white !important;
          }
          .doc-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            margin: 0 !important;
            min-height: auto !important;
          }
        }
      `}</style>

      {/* 상단 툴바 — 인쇄 시 숨김 */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <a
          href={`/admin/enrollments/${id}/documents`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 서류 발급
        </a>
        <div className="flex items-center gap-3">
          {/* 연도 선택 */}
          <div className="flex items-center gap-2 text-sm text-[#4B5563]">
            <span>과세연도:</span>
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(
              (y) => (
                <a
                  key={y}
                  href={`/admin/enrollments/${id}/tax-certificate?year=${y}`}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    y === targetYear
                      ? "bg-[#1F4D3A] text-white"
                      : "border border-[#111827]/10 hover:border-[#111827]/30"
                  }`}
                >
                  {y}년
                </a>
              )
            )}
          </div>
          <span className="text-sm text-[#4B5563]">
            {enrollment.student.name}의 교육비 납입증명서
          </span>
          <TaxCertPrintButton />
        </div>
      </div>

      {/* 문서 미리보기 */}
      <div className="doc-wrapper flex justify-center px-8 py-10">
        <div
          className="doc-paper w-full max-w-[680px] rounded-2xl border border-[#111827]/15 bg-white shadow-lg"
          style={{ minHeight: "250mm" }}
        >
          <div className="px-16 py-14">
            {/* 발급번호 / 발급일 */}
            <div className="mb-2 flex items-center justify-between text-xs text-[#4B5563]">
              <span>발급번호: {certNo}</span>
              <span>발급일: {issuedAt}</span>
            </div>

            {/* 제목 */}
            <h1
              className="mb-10 mt-4 text-center text-[28px] font-bold text-[#111827]"
              style={{ letterSpacing: "0.5em" }}
            >
              교육비 납입증명서
            </h1>

            {/* 학원 정보 헤드라인 */}
            <div className="mb-8 border-b-2 border-[#1F4D3A] pb-4">
              <p className="text-lg font-bold text-[#1F4D3A]">{academyName}</p>
              <p className="mt-0.5 text-sm text-[#4B5563]">
                {academyAddress}&nbsp;|&nbsp;TEL {academyPhone}
                {businessRegNo && (
                  <>&nbsp;|&nbsp;사업자등록번호: {businessRegNo}</>
                )}
              </p>
            </div>

            {/* 학생 정보 테이블 */}
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                학생 정보
              </p>
              <table className="w-full border-collapse border border-[#111827]/20 text-sm">
                <tbody>
                  <tr className="border-b border-[#111827]/10">
                    <th className="w-28 border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명
                    </th>
                    <td className="px-4 py-3 font-medium text-[#111827]">
                      {enrollment.student.name}
                    </td>
                    <th className="w-28 border-l border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      수 험 번 호
                    </th>
                    <td className="px-4 py-3 font-medium text-[#111827]">
                      {enrollment.examNumber}
                    </td>
                  </tr>
                  <tr>
                    <th className="border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      생 년 월 일
                    </th>
                    <td className="px-4 py-3 text-[#111827]" colSpan={3}>
                      {formatBirthDate(enrollment.student.birthDate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 납입 내역 테이블 */}
            <div className="mb-4">
              <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                교육비 납입 내역 ({targetYear}년)
              </p>
              <table className="w-full border-collapse border border-[#111827]/20 text-sm">
                <thead>
                  <tr className="bg-[#F7F4EF] text-center text-xs font-semibold text-[#111827]">
                    <th className="border-b border-r border-[#111827]/10 px-4 py-3 text-left">
                      과&nbsp;&nbsp;정&nbsp;&nbsp;명
                    </th>
                    <th className="border-b border-r border-[#111827]/10 px-4 py-3">
                      교육 기간
                    </th>
                    <th className="border-b border-[#111827]/10 px-4 py-3 text-right">
                      납입금액
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#111827]/10">
                    <td className="border-r border-[#111827]/10 px-4 py-4 font-medium text-[#111827]">
                      {courseName}
                    </td>
                    <td className="border-r border-[#111827]/10 px-4 py-4 text-center text-[#111827]">
                      {courseStart}
                      <br />
                      ~ {courseEnd}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-[#111827]">
                      {totalPaid.toLocaleString("ko-KR")}원
                    </td>
                  </tr>
                  {/* 합계 행 */}
                  <tr className="bg-[#F7F4EF] font-semibold text-[#111827]">
                    <td
                      className="border-r border-[#111827]/10 px-4 py-3 text-center"
                      colSpan={2}
                    >
                      합&nbsp;&nbsp;&nbsp;&nbsp;계
                    </td>
                    <td className="px-4 py-3 text-right text-[#1F4D3A]">
                      {totalPaid.toLocaleString("ko-KR")}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 납입금액이 없는 경우 안내 */}
            {totalPaid === 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {targetYear}년에 해당하는 납입 내역이 없습니다. 연도를 변경하거나 수납 내역을 확인해 주세요.
              </div>
            )}

            {/* 용도 */}
            <div className="mb-10 mt-6 border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-6 py-4 text-center">
              <p className="text-sm text-[#111827]">
                용 도:&nbsp;&nbsp;
                <span className="font-semibold">연말정산 소득공제용 (교육비)</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#111827]">
                위와 같이 교육비를 납입하였음을 증명합니다.
              </p>
            </div>

            {/* 발급일 */}
            <p className="mb-10 text-center text-base text-[#111827]">{issuedAt}</p>

            {/* 학원 직인 및 서명 */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-base font-bold text-[#111827]">{academyName}</p>
                  <p className="mt-1 text-sm font-semibold text-[#111827]">
                    원&nbsp;&nbsp;&nbsp;&nbsp;장
                    {directorName && (
                      <span className="ml-2 font-normal">{directorName}</span>
                    )}
                  </p>
                </div>
                {/* 직인 원형 */}
                <div
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 text-center"
                  style={{ borderColor: "#C55A11", color: "#C55A11" }}
                >
                  <span className="text-[11px] font-semibold leading-tight">한국경찰</span>
                  <span className="text-[11px] font-semibold leading-tight">학원</span>
                  <span className="mt-0.5 text-[10px]">(인)</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#4B5563]">{academyAddress}</p>
              <p className="text-xs text-[#4B5563]">TEL {academyPhone}</p>
              {businessRegNo && (
                <p className="text-xs text-[#4B5563]">사업자등록번호: {businessRegNo}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 안내 문구 — 화면 전용 */}
      <p className="no-print mb-10 mt-2 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A4로 선택하세요. 여백은 20mm 이상을 권장합니다.
      </p>
    </div>
  );
}
