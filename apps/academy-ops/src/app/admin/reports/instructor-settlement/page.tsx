import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

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

const TAX_RATE = 0.033; // 3.3% 사업소득세

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  const today = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorSettlementReportPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;
  const rawMonth = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const { year, month } = parseMonthParam(rawMonth);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  const today = new Date();
  const currentMonthStr = formatYearMonth(year, month);
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const isNextFuture =
    next.year > today.getFullYear() ||
    (next.year === today.getFullYear() && next.month > today.getMonth() + 1);

  // Fetch all active staff
  const staffList = await getPrisma().staff.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Aggregate payment counts and totals by processedBy (adminUserId)
  const paymentAggregates =
    adminUserIds.length > 0
      ? await getPrisma().payment.groupBy({
          by: ["processedBy"],
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: firstDay, lte: lastDay },
            status: { notIn: ["CANCELLED"] },
          },
          _count: { id: true },
          _sum: { netAmount: true },
        })
      : [];

  const aggregateMap = new Map(
    paymentAggregates.map((agg) => [
      agg.processedBy,
      {
        count: agg._count.id,
        total: agg._sum.netAmount ?? 0,
      },
    ])
  );

  // Build per-staff settlement rows
  const rows = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? null;
    const agg = adminId ? aggregateMap.get(adminId) : undefined;
    const paymentCount = agg?.count ?? 0;
    const totalRevenue = agg?.total ?? 0;
    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role as string,
      adminUserId: adminId,
      paymentCount,
      totalRevenue,
      hasData: paymentCount > 0,
    };
  });

  // Summary calculations
  const totalStaff = rows.length;
  const settledStaff = rows.filter((r) => r.hasData).length;
  const unsettledStaff = totalStaff - settledStaff;
  const grandTotalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const grandTaxDeduction = Math.floor(grandTotalRevenue * TAX_RATE);
  const grandNetPayout = grandTotalRevenue - grandTaxDeduction;
  const grandPaymentCount = rows.reduce((s, r) => s + r.paymentCount, 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Page header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        보고서
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">강사 정산 보고서</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월별 강사·직원의 수납 처리 기준 정산 현황입니다. 세금(3.3%)은 참고용이며
            실제 계약 조건에 따라 달라질 수 있습니다.
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/reports/instructor-settlement?month=${formatYearMonth(prev.year, prev.month)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-ember/30 hover:text-ember"
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

          <span className="min-w-[90px] text-center text-sm font-semibold text-ink">
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
              href={`/admin/reports/instructor-settlement?month=${formatYearMonth(next.year, next.month)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-ember/30 hover:text-ember"
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
        </div>
      </div>

      {/* Period badge */}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        {year}년 {month}월 정산 보고서
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 강사 수</p>
          <p className="mt-3 text-2xl font-bold text-ink">{totalStaff}명</p>
          <p className="mt-1 text-xs text-slate">활성 직원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">정산 대상</p>
          <p className="mt-3 text-2xl font-bold text-forest">{settledStaff}명</p>
          <p className="mt-1 text-xs text-slate">수납 처리 있음</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">미정산</p>
          <p className="mt-3 text-2xl font-bold text-slate">{unsettledStaff}명</p>
          <p className="mt-1 text-xs text-slate">이번 달 처리 없음</p>
        </div>
        <div className="col-span-2 rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel sm:col-span-1">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 수납금액</p>
          <p className="mt-3 text-2xl font-bold text-ink">{formatKRW(grandTotalRevenue)}</p>
          <p className="mt-1 text-xs text-slate">{grandPaymentCount}건 처리</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">세금(3.3%)</p>
          <p className="mt-3 text-2xl font-bold text-red-700">{formatKRW(grandTaxDeduction)}</p>
          <p className="mt-1 text-xs text-red-500">사업소득세 참고</p>
        </div>
        <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-ember">실지급 예정</p>
          <p className="mt-3 text-2xl font-bold text-ember">{formatKRW(grandNetPayout)}</p>
          <p className="mt-1 text-xs text-ember/70">세후 기준</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="mt-8 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">직원별 정산 내역</h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/staff-settlements?month=${currentMonthStr}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              정산 관리로 이동
            </Link>
            <button
              type="button"
              onClick={undefined}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ember/30 hover:text-ember print:hidden"
              aria-label="인쇄"
              // Use window.print() via onclick in a client wrapper if needed
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              인쇄
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-forest/5">
              <th className="px-5 py-3 text-left font-semibold text-forest">이름</th>
              <th className="px-5 py-3 text-left font-semibold text-forest">직책</th>
              <th className="px-5 py-3 text-right font-semibold text-forest">담당 수납건</th>
              <th className="px-5 py-3 text-right font-semibold text-forest">정산금액</th>
              <th className="px-5 py-3 text-right font-semibold text-forest">세금 (3.3%)</th>
              <th className="px-5 py-3 text-right font-semibold text-forest">실수령액</th>
              <th className="px-5 py-3 text-center font-semibold text-forest">정산상태</th>
              <th className="px-5 py-3 text-center font-semibold text-forest">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate">
                  등록된 직원이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const taxDeduction = Math.floor(row.totalRevenue * TAX_RATE);
                const netPayout = row.totalRevenue - taxDeduction;
                return (
                  <tr
                    key={row.staffId}
                    className={`transition-colors hover:bg-mist/50 ${!row.hasData ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                        className="transition-colors hover:text-forest hover:underline underline-offset-2"
                      >
                        {row.staffName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate">
                      {STAFF_ROLE_LABEL[row.staffRole] ?? row.staffRole}
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {row.hasData ? `${row.paymentCount.toLocaleString("ko-KR")}건` : "-"}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-ink">
                      {row.hasData ? formatKRW(row.totalRevenue) : "-"}
                    </td>
                    <td className="px-5 py-3 text-right text-red-600">
                      {row.hasData ? formatKRW(taxDeduction) : "-"}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ember">
                      {row.hasData ? formatKRW(netPayout) : "-"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {row.hasData ? (
                        <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                          정산 대상
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-slate">
                          미해당
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Link
                        href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                        className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-ink/20 bg-forest/5">
                <td colSpan={2} className="px-5 py-3 font-bold text-forest">
                  합계
                </td>
                <td className="px-5 py-3 text-right font-bold text-forest">
                  {grandPaymentCount.toLocaleString("ko-KR")}건
                </td>
                <td className="px-5 py-3 text-right font-bold text-forest">
                  {formatKRW(grandTotalRevenue)}
                </td>
                <td className="px-5 py-3 text-right font-bold text-red-600">
                  {formatKRW(grandTaxDeduction)}
                </td>
                <td className="px-5 py-3 text-right font-bold text-ember">
                  {formatKRW(grandNetPayout)}
                </td>
                <td colSpan={2} className="px-5 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footnotes */}
      <div className="mt-4 space-y-1 text-xs text-slate">
        <p>* 정산금액은 해당 월에 처리된 수납 중 취소 제외 건의 netAmount 기준입니다.</p>
        <p>* 세금(3.3%)은 사업소득세(소득세 3% + 지방소득세 0.3%)로 참고용 수치이며, 실제 계약에 따라 다를 수 있습니다.</p>
        <p>* AdminUser와 연동된 Staff만 정산 집계에 포함됩니다. 미연동 직원은 0건으로 표시됩니다.</p>
      </div>

      {/* Quick links */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">관련 페이지</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/admin/staff-settlements?month=${currentMonthStr}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:bg-mist"
          >
            강사 정산 관리
          </Link>
          <Link
            href={`/admin/staff-settlements/analytics?month=${currentMonthStr}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:bg-mist"
          >
            성과 분석
          </Link>
          <Link
            href={`/admin/staff-settlements/daily?month=${currentMonthStr}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:bg-mist"
          >
            일별 상세
          </Link>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:bg-mist"
          >
            보고서 센터
          </Link>
          <Link
            href={`/admin/reports/monthly?month=${currentMonthStr}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:bg-mist"
          >
            월간 보고서
          </Link>
        </div>
      </div>
    </div>
  );
}
