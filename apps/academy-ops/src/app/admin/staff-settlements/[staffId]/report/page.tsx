import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ReportPrintButton } from "./report-print-button";

export const dynamic = "force-dynamic";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "수강중",
  PENDING: "대기",
  WAITING: "대기자",
  COMPLETED: "수강완료",
  WITHDRAWN: "퇴원",
  LEAVE: "휴원",
  CANCELLED: "취소",
};

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

type PageProps = {
  params: Promise<{ staffId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(
  monthParam: string | string[] | undefined
): { year: number; month: number } {
  const raw = Array.isArray(monthParam) ? monthParam[0] : monthParam;
  const today = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function StaffCommissionReportPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { staffId } = await params;
  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const db = getPrisma();

  // Load staff info
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, adminUserId: true, mobile: true },
  });

  if (!staff) notFound();

  const adminUserId = staff.adminUserId;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Fetch enrollments handled by this staff for the given month
  const enrollmentDetails = await db.courseEnrollment.findMany({
    where: {
      staffId: adminUserId ?? "__none__",
      createdAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      student: {
        select: { examNumber: true, name: true, phone: true },
      },
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch payments processed by this staff for the month
  const payments = adminUserId
    ? await db.payment.findMany({
        where: {
          processedBy: adminUserId,
          processedAt: { gte: firstDay, lte: lastDay },
          status: { notIn: ["CANCELLED"] },
        },
        select: {
          id: true,
          processedAt: true,
          category: true,
          netAmount: true,
          method: true,
          student: { select: { examNumber: true, name: true } },
        },
        orderBy: { processedAt: "desc" },
      })
    : [];

  const totalEnrollmentFee = enrollmentDetails.reduce((s, e) => s + e.finalFee, 0);
  const totalPaymentAmount = payments.reduce((s, p) => s + p.netAmount, 0);

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const today = new Date();
  const isNextFuture =
    next.year > today.getFullYear() ||
    (next.year === today.getFullYear() && next.month > today.getMonth() + 1);

  const currentMonthStr = formatYearMonth(year, month);
  const prevMonthStr = formatYearMonth(prev.year, prev.month);
  const nextMonthStr = formatYearMonth(next.year, next.month);

  // Serialize enrollment rows
  const enrollmentRows = enrollmentDetails.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    courseType: e.courseType as string,
    courseTypeLabel: COURSE_TYPE_LABEL[e.courseType as string] ?? (e.courseType as string),
    statusLabel: ENROLLMENT_STATUS_LABEL[e.status as string] ?? (e.status as string),
    courseName:
      e.cohort?.name ??
      e.specialLecture?.name ??
      e.product?.name ??
      "-",
    regularFee: e.regularFee,
    discountAmount: e.discountAmount,
    finalFee: e.finalFee,
    isRe: e.isRe,
    studentName: e.student.name,
    examNumber: e.student.examNumber,
    studentPhone: e.student.phone ?? null,
  }));

  // Serialize payment rows
  const paymentRows = payments.map((p) => ({
    id: p.id,
    processedAt: p.processedAt.toISOString(),
    category: p.category as string,
    method: p.method as string,
    netAmount: p.netAmount,
    studentName: p.student?.name ?? null,
    examNumber: p.student?.examNumber ?? null,
  }));

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "직원 정산", href: "/admin/staff-settlements" },
          {
            label: staff.name,
            href: `/admin/staff-settlements/${staffId}?month=${currentMonthStr}`,
          },
          { label: "실적 보고서" },
        ]}
      />

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {staff.name}
            <span className="ml-2 text-xl font-normal text-slate">
              ({STAFF_ROLE_LABEL[staff.role as string] ?? staff.role}) 실적 보고서
            </span>
          </h1>
          {staff.mobile && (
            <p className="mt-1 text-sm text-slate">{staff.mobile}</p>
          )}
        </div>

        <div className="flex items-center gap-2 print:hidden">
          {/* Month navigation */}
          <Link
            href={`/admin/staff-settlements/${staffId}/report?month=${prevMonthStr}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 달"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="min-w-[80px] text-center text-sm font-medium text-ink">
            {year}년 {month}월
          </span>
          {isNextFuture ? (
            <span className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/admin/staff-settlements/${staffId}/report?month=${nextMonthStr}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 달"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          <Link
            href={`/admin/staff-settlements/${staffId}/${currentMonthStr}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-medium text-ember shadow-sm transition hover:bg-ember/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            정산서 출력
          </Link>
          <ReportPrintButton />
        </div>
      </div>

      {/* Period badge */}
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        {year}년 {month}월 실적 보고서
      </div>

      {/* Staff info card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">직원 정보</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate">이름</p>
            <p className="mt-1 font-semibold text-ink">{staff.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate">역할</p>
            <p className="mt-1 font-semibold text-ink">
              {STAFF_ROLE_LABEL[staff.role as string] ?? staff.role}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate">연락처</p>
            <p className="mt-1 font-semibold text-ink">{staff.mobile ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate">보고 기간</p>
            <p className="mt-1 font-semibold text-ink">
              {year}년 {month}월 ({firstDay.toLocaleDateString("ko-KR")} ~ {lastDay.toLocaleDateString("ko-KR")})
            </p>
          </div>
        </div>
      </div>

      {/* KPI summary */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            신규 등록 건수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {enrollmentDetails.length.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            등록 수강료 합계
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {formatKRW(totalEnrollmentFee)}
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            수납 처리 건수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {payments.length.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            수납 처리 총액
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {formatKRW(totalPaymentAmount)}
          </p>
        </div>
      </div>

      {/* Enrollment referrals section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            신규 등록 실적
            <span className="ml-2 text-sm font-normal text-slate">
              ({enrollmentRows.length}건)
            </span>
          </h2>
        </div>

        {enrollmentRows.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center text-slate shadow-sm">
            이 기간에 담당한 수강 등록 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-forest/5">
                  <th className="px-4 py-3 text-left font-semibold text-forest">등록일</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">학생</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">수강 과정</th>
                  <th className="px-4 py-3 text-center font-semibold text-forest">유형</th>
                  <th className="px-4 py-3 text-center font-semibold text-forest">상태</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">정상 수강료</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">할인</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">최종 금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {enrollmentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 text-slate">
                      {formatDate(new Date(row.createdAt))}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {row.studentName}
                      </Link>
                      <span className="ml-1 text-xs text-slate">{row.examNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {row.courseName}
                      {row.isRe && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          재수강
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">
                        {row.courseTypeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.statusLabel === "수강중"
                            ? "bg-forest/10 text-forest"
                            : row.statusLabel === "퇴원" || row.statusLabel === "취소"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-ink">
                      {formatKRW(row.regularFee)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      {row.discountAmount > 0 ? `-${formatKRW(row.discountAmount)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {formatKRW(row.finalFee)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={5} className="px-4 py-3 font-bold text-forest">
                    합계
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink">
                    {formatKRW(
                      enrollmentRows.reduce((s, r) => s + r.regularFee, 0)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-500">
                    {enrollmentRows.reduce((s, r) => s + r.discountAmount, 0) > 0
                      ? `-${formatKRW(enrollmentRows.reduce((s, r) => s + r.discountAmount, 0))}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ember">
                    {formatKRW(totalEnrollmentFee)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payment processing section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            수납 처리 내역
            <span className="ml-2 text-sm font-normal text-slate">
              ({paymentRows.length}건)
            </span>
          </h2>
        </div>

        {paymentRows.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center text-slate shadow-sm">
            이 기간에 처리한 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-forest/5">
                  <th className="px-4 py-3 text-left font-semibold text-forest">처리일시</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">학생</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">유형</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">결제방법</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {paymentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 text-slate">
                      {formatDate(new Date(row.processedAt))}
                    </td>
                    <td className="px-4 py-3">
                      {row.examNumber ? (
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-medium text-ink hover:text-forest transition-colors"
                        >
                          {row.studentName}
                        </Link>
                      ) : (
                        <span className="text-slate">{row.studentName ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.category}</td>
                    <td className="px-4 py-3 text-slate">{row.method}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      {formatKRW(row.netAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={4} className="px-4 py-3 font-bold text-forest">
                    합계
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-forest">
                    {formatKRW(totalPaymentAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* No admin link warning */}
      {!adminUserId && (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이 직원은 관리자 계정과 연동되어 있지 않아 수납 처리 내역을 조회할 수 없습니다.
          수강 등록 실적만 표시됩니다.
        </div>
      )}

      {/* Back links */}
      <div className="mt-8 flex flex-wrap items-center gap-4 print:hidden">
        <Link
          href={`/admin/staff-settlements/${staffId}?month=${currentMonthStr}`}
          className="text-sm text-forest hover:underline"
        >
          ← 직원 상세 페이지로
        </Link>
        <Link
          href="/admin/staff-settlements"
          className="text-sm text-slate hover:underline"
        >
          직원 정산 목록
        </Link>
      </div>
    </div>
  );
}
