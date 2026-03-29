import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

type PageProps = {
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

function addMonths(year: number, month: number, delta: number) {
  const total = (year - 1) * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12) + 1, month: (total % 12) + 1 };
}

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

function deltaLabel(current: number, prev: number): { text: string; positive: boolean } {
  if (prev === 0 && current === 0) return { text: "-", positive: true };
  if (prev === 0) return { text: `+${current.toLocaleString("ko-KR")}`, positive: true };
  const diff = current - prev;
  const pct = ((diff / prev) * 100).toFixed(1);
  const sign = diff >= 0 ? "+" : "";
  return { text: `${sign}${pct}%`, positive: diff >= 0 };
}

type StaffPerformanceRow = {
  staffId: string;
  staffName: string;
  staffRole: string;
  adminUserId: string;
  enrollmentCount: number;
  totalRevenue: number;
  counselingCount: number;
  prevEnrollmentCount: number;
  prevTotalRevenue: number;
  prevCounselingCount: number;
};

export default async function StaffAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  const prev = prevMonth(year, month);
  const prevFirstDay = new Date(prev.year, prev.month - 1, 1);
  const prevLastDay = new Date(prev.year, prev.month, 0, 23, 59, 59, 999);

  const db = getPrisma();

  // ── Staff list ───────────────────────────────────────────────────────────────
  const staffList = await db.staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: { id: true, name: true, role: true, adminUserId: true },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // ── Single-month aggregations ────────────────────────────────────────────────
  const [
    currEnrollAggs,
    prevEnrollAggs,
    currPaymentAggs,
    prevPaymentAggs,
  ] = await Promise.all([
    adminUserIds.length > 0
      ? db.courseEnrollment.groupBy({
          by: ["staffId"],
          where: { staffId: { in: adminUserIds }, createdAt: { gte: firstDay, lte: lastDay } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    adminUserIds.length > 0
      ? db.courseEnrollment.groupBy({
          by: ["staffId"],
          where: { staffId: { in: adminUserIds }, createdAt: { gte: prevFirstDay, lte: prevLastDay } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    adminUserIds.length > 0
      ? db.payment.groupBy({
          by: ["processedBy"],
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: firstDay, lte: lastDay },
            status: { notIn: ["CANCELLED"] },
          },
          _count: { id: true },
          _sum: { netAmount: true },
        })
      : Promise.resolve([]),
    adminUserIds.length > 0
      ? db.payment.groupBy({
          by: ["processedBy"],
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: prevFirstDay, lte: prevLastDay },
            status: { notIn: ["CANCELLED"] },
          },
          _count: { id: true },
          _sum: { netAmount: true },
        })
      : Promise.resolve([]),
  ]);

  // ── Counseling aggregation ───────────────────────────────────────────────────
  const staffNames = staffList.map((s) => s.name);
  const [currCounselingRaw, prevCounselingRaw] = await Promise.all([
    staffNames.length > 0
      ? db.counselingRecord.groupBy({
          by: ["counselorName"],
          where: {
            counselorName: { in: staffNames },
            counseledAt: { gte: firstDay, lte: lastDay },
          },
          _count: { id: true },
        })
      : Promise.resolve([]),
    staffNames.length > 0
      ? db.counselingRecord.groupBy({
          by: ["counselorName"],
          where: {
            counselorName: { in: staffNames },
            counseledAt: { gte: prevFirstDay, lte: prevLastDay },
          },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const currEnrollMap = new Map(currEnrollAggs.map((a) => [a.staffId, a._count.id]));
  const prevEnrollMap = new Map(prevEnrollAggs.map((a) => [a.staffId, a._count.id]));
  const currPayMap = new Map(
    currPaymentAggs.map((a) => [a.processedBy, { count: a._count.id, total: a._sum.netAmount ?? 0 }])
  );
  const prevPayMap = new Map(
    prevPaymentAggs.map((a) => [a.processedBy, { count: a._count.id, total: a._sum.netAmount ?? 0 }])
  );
  const currCounselMap = new Map(currCounselingRaw.map((a) => [a.counselorName, a._count.id]));
  const prevCounselMap = new Map(prevCounselingRaw.map((a) => [a.counselorName, a._count.id]));

  // ── Build rows ───────────────────────────────────────────────────────────────
  const rows: StaffPerformanceRow[] = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? "";
    const currPay = currPayMap.get(adminId);
    const prevPay = prevPayMap.get(adminId);
    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role as string,
      adminUserId: adminId,
      enrollmentCount: currEnrollMap.get(adminId) ?? 0,
      totalRevenue: currPay?.total ?? 0,
      counselingCount: currCounselMap.get(staff.name) ?? 0,
      prevEnrollmentCount: prevEnrollMap.get(adminId) ?? 0,
      prevTotalRevenue: prevPay?.total ?? 0,
      prevCounselingCount: prevCounselMap.get(staff.name) ?? 0,
    };
  });

  // ── Top performers & totals ──────────────────────────────────────────────────
  const topByRevenue = rows.reduce<StaffPerformanceRow | null>(
    (best, row) => (best === null || row.totalRevenue > best.totalRevenue ? row : best),
    null
  );
  const topByCounseling = rows.reduce<StaffPerformanceRow | null>(
    (best, row) => (best === null || row.counselingCount > best.counselingCount ? row : best),
    null
  );
  const topByEnrollment = rows.reduce<StaffPerformanceRow | null>(
    (best, row) => (best === null || row.enrollmentCount > best.enrollmentCount ? row : best),
    null
  );

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalEnrollments = rows.reduce((s, r) => s + r.enrollmentCount, 0);
  const totalCounseling = rows.reduce((s, r) => s + r.counselingCount, 0);
  const prevTotalRevenue = rows.reduce((s, r) => s + r.prevTotalRevenue, 0);
  const prevTotalEnrollments = rows.reduce((s, r) => s + r.prevEnrollmentCount, 0);
  const prevTotalCounseling = rows.reduce((s, r) => s + r.prevCounselingCount, 0);

  const currentMonthStr = formatYearMonth(year, month);
  const prevMonthData = prevMonth(year, month);
  const nextMonthData = nextMonth(year, month);
  const today = new Date();
  const isNextFuture =
    nextMonthData.year > today.getFullYear() ||
    (nextMonthData.year === today.getFullYear() && nextMonthData.month > today.getMonth() + 1);

  const revenueDelta = deltaLabel(totalRevenue, prevTotalRevenue);
  const enrollDelta = deltaLabel(totalEnrollments, prevTotalEnrollments);
  const counselDelta = deltaLabel(totalCounseling, prevTotalCounseling);

  // Default 6-month range for client component
  const sixMonthsAgo = addMonths(
    today.getFullYear(),
    today.getMonth() + 1,
    -5
  );
  const defaultFrom = formatYearMonth(sixMonthsAgo.year, sixMonthsAgo.month);
  const defaultTo = formatYearMonth(today.getFullYear(), today.getMonth() + 1);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "직원 정산", href: "/admin/staff-settlements" },
          { label: "성과 분석" },
        ]}
      />

      {/* Page header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">직원 성과 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            직원별 수강 처리 건수, 수납 총액, 상담 건수를 월별로 비교하고,
            6개월 추이와 특강 강사 정산 현황을 확인합니다.
          </p>
        </div>

        {/* Month navigation for single-month section */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/staff-settlements/analytics?month=${formatYearMonth(prevMonthData.year, prevMonthData.month)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 달"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="min-w-[80px] text-center text-sm font-medium text-ink">
            {year}년 {month}월
          </span>
          {isNextFuture ? (
            <span className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/admin/staff-settlements/analytics?month=${formatYearMonth(nextMonthData.year, nextMonthData.month)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 달"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Period badge */}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        {year}년 {month}월 vs {prev.year}년 {prev.month}월 비교
      </div>

      {/* ── Section 1: Single-month KPI cards ── */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">총 수납액</p>
          <p className="mt-3 text-3xl font-bold text-ember">{formatKRW(totalRevenue)}</p>
          <p className={`mt-1 text-sm font-medium ${revenueDelta.positive ? "text-green-600" : "text-red-500"}`}>
            전월 대비 {revenueDelta.text}
          </p>
          <p className="mt-0.5 text-xs text-slate">전월: {formatKRW(prevTotalRevenue)}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">총 수강 등록</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {totalEnrollments.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className={`mt-1 text-sm font-medium ${enrollDelta.positive ? "text-green-600" : "text-red-500"}`}>
            전월 대비 {enrollDelta.text}
          </p>
          <p className="mt-0.5 text-xs text-slate">전월: {prevTotalEnrollments.toLocaleString("ko-KR")}건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">총 상담 건수</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {totalCounseling.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className={`mt-1 text-sm font-medium ${counselDelta.positive ? "text-green-600" : "text-red-500"}`}>
            전월 대비 {counselDelta.text}
          </p>
          <p className="mt-0.5 text-xs text-slate">전월: {prevTotalCounseling.toLocaleString("ko-KR")}건</p>
        </div>
      </div>

      {/* ── Top performers ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ember text-white text-xs font-bold">1</span>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">수납 최고</p>
          </div>
          {topByRevenue && topByRevenue.totalRevenue > 0 ? (
            <>
              <p className="mt-3 text-lg font-bold text-ink">{topByRevenue.staffName}</p>
              <p className="text-sm text-slate">{STAFF_ROLE_LABEL[topByRevenue.staffRole] ?? topByRevenue.staffRole}</p>
              <p className="mt-2 text-xl font-bold text-ember">{formatKRW(topByRevenue.totalRevenue)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          )}
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest text-white text-xs font-bold">1</span>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">등록 최다</p>
          </div>
          {topByEnrollment && topByEnrollment.enrollmentCount > 0 ? (
            <>
              <p className="mt-3 text-lg font-bold text-ink">{topByEnrollment.staffName}</p>
              <p className="text-sm text-slate">{STAFF_ROLE_LABEL[topByEnrollment.staffRole] ?? topByEnrollment.staffRole}</p>
              <p className="mt-2 text-xl font-bold text-forest">{topByEnrollment.enrollmentCount.toLocaleString("ko-KR")}건</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          )}
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white text-xs font-bold">1</span>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">상담 최다</p>
          </div>
          {topByCounseling && topByCounseling.counselingCount > 0 ? (
            <>
              <p className="mt-3 text-lg font-bold text-ink">{topByCounseling.staffName}</p>
              <p className="text-sm text-slate">{STAFF_ROLE_LABEL[topByCounseling.staffRole] ?? topByCounseling.staffRole}</p>
              <p className="mt-2 text-xl font-bold text-sky-600">{topByCounseling.counselingCount.toLocaleString("ko-KR")}건</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          )}
        </div>
      </div>

      {/* ── Section 2: Per-staff comparison table (single month) ── */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-ink">직원별 성과 비교</h2>
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-4 py-3 text-left font-semibold text-forest">직원명</th>
                <th className="px-4 py-3 text-left font-semibold text-forest">역할</th>
                <th className="px-4 py-3 text-right font-semibold text-forest" colSpan={2}>수납 총액</th>
                <th className="px-4 py-3 text-right font-semibold text-forest" colSpan={2}>수강 등록</th>
                <th className="px-4 py-3 text-right font-semibold text-forest" colSpan={2}>상담 건수</th>
                <th className="px-4 py-3 text-center font-semibold text-forest">상세</th>
              </tr>
              <tr className="border-b border-ink/5 bg-mist/30 text-xs text-slate">
                <th className="px-4 py-1.5" />
                <th className="px-4 py-1.5" />
                <th className="px-4 py-1.5 text-right">이번 달</th>
                <th className="px-4 py-1.5 text-right">전월 대비</th>
                <th className="px-4 py-1.5 text-right">이번 달</th>
                <th className="px-4 py-1.5 text-right">전월 대비</th>
                <th className="px-4 py-1.5 text-right">이번 달</th>
                <th className="px-4 py-1.5 text-right">전월 대비</th>
                <th className="px-4 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate">
                    활성 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const revDelta = deltaLabel(row.totalRevenue, row.prevTotalRevenue);
                  const enrDelta = deltaLabel(row.enrollmentCount, row.prevEnrollmentCount);
                  const couDelta = deltaLabel(row.counselingCount, row.prevCounselingCount);
                  return (
                    <tr key={row.staffId} className="transition-colors hover:bg-mist/50">
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                          className="underline-offset-2 transition-colors hover:text-forest hover:underline"
                        >
                          {row.staffName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {STAFF_ROLE_LABEL[row.staffRole] ?? row.staffRole}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink">
                        {formatKRW(row.totalRevenue)}
                      </td>
                      <td className={`px-4 py-3 text-right text-xs font-medium ${revDelta.positive ? "text-green-600" : "text-red-500"}`}>
                        {revDelta.text}
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        {row.enrollmentCount.toLocaleString("ko-KR")}건
                      </td>
                      <td className={`px-4 py-3 text-right text-xs font-medium ${enrDelta.positive ? "text-green-600" : "text-red-500"}`}>
                        {enrDelta.text}
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        {row.counselingCount.toLocaleString("ko-KR")}건
                      </td>
                      <td className={`px-4 py-3 text-right text-xs font-medium ${couDelta.positive ? "text-green-600" : "text-red-500"}`}>
                        {couDelta.text}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                          className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
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
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={2} className="px-4 py-3 font-bold text-forest">합계</td>
                  <td className="px-4 py-3 text-right font-bold text-forest">{formatKRW(totalRevenue)}</td>
                  <td className={`px-4 py-3 text-right text-xs font-bold ${revenueDelta.positive ? "text-green-600" : "text-red-500"}`}>
                    {revenueDelta.text}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-forest">
                    {totalEnrollments.toLocaleString("ko-KR")}건
                  </td>
                  <td className={`px-4 py-3 text-right text-xs font-bold ${enrollDelta.positive ? "text-green-600" : "text-red-500"}`}>
                    {enrollDelta.text}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-forest">
                    {totalCounseling.toLocaleString("ko-KR")}건
                  </td>
                  <td className={`px-4 py-3 text-right text-xs font-bold ${counselDelta.positive ? "text-green-600" : "text-red-500"}`}>
                    {counselDelta.text}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-slate">
          * 수납 총액은 취소 제외 건 기준. 수강 등록은 해당 월에 생성된 CourseEnrollment 기준.
          상담 건수는 CounselingRecord.counselorName이 직원명과 일치하는 건 기준.
        </p>
      </div>

      {/* ── Section 3: 6-month trend + bar chart + special lecture (client-side) ── */}
      <div className="mt-14">
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-ink">강사 정산 분석 대시보드</h2>
          <span className="inline-flex items-center rounded-full border border-ember/20 bg-ember/10 px-3 py-0.5 text-xs font-semibold text-ember">
            6개월 추이
          </span>
        </div>
        <AnalyticsClient initialFrom={defaultFrom} initialTo={defaultTo} />
      </div>
    </div>
  );
}
