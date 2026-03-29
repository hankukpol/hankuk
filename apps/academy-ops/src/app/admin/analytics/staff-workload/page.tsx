import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

type WorkloadRow = {
  id: string;
  name: string;
  role: string;
  enrollments: number;
  paymentCount: number;
  totalPaymentAmount: number;
  counselingCount: number;
  activityIndex: number;
  tier: "top" | "mid" | "low";
  tierColor: string;
  tierBg: string;
  tierLabel: string;
};

function computeTier(
  index: number,
  sorted: number[]
): WorkloadRow["tier"] {
  if (sorted.length === 0) return "mid";
  const rank = sorted.filter((v) => v >= index).length; // how many >= current
  const total = sorted.length;
  const percentile = rank / total;
  if (percentile <= 0.3) return "top"; // top 30%
  if (percentile >= 0.7) return "low"; // bottom 30%
  return "mid";
}

function tierStyle(tier: WorkloadRow["tier"]): { color: string; bg: string; label: string } {
  switch (tier) {
    case "top":
      return { color: "text-green-700", bg: "bg-green-50 border-green-200", label: "활발" };
    case "mid":
      return { color: "text-sky-700", bg: "bg-sky-50 border-sky-200", label: "정상" };
    case "low":
      return {
        color: "text-amber-700",
        bg: "bg-amber-50 border-amber-200",
        label: "저활동",
      };
  }
}

export default async function StaffWorkloadPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const resolvedParams = await searchParams;
  const yearParam = sp(resolvedParams.year);
  const monthParam = sp(resolvedParams.month);

  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const periodLabel = `${year}년 ${month}월`;

  // Generate month options: last 18 months
  const monthOptions: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
    });
  }

  const db = getPrisma();

  // Fetch all active admin users
  const staffList = await db.adminUser.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Enrollment counts by staffId in this month
  const enrollmentsByStaff = await db.courseEnrollment.groupBy({
    by: ["staffId"],
    where: {
      createdAt: { gte: monthStart, lt: monthEnd },
      status: { notIn: ["PENDING"] },
    },
    _count: { id: true },
  });

  // Payment stats by processedBy in this month
  const paymentsByStaff = await db.payment.groupBy({
    by: ["processedBy"],
    where: {
      processedAt: { gte: monthStart, lt: monthEnd },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    _count: { id: true },
    _sum: { netAmount: true },
  });

  // Counseling counts by counselorName in this month
  const counselingByName = await db.counselingRecord.groupBy({
    by: ["counselorName"],
    where: { counseledAt: { gte: monthStart, lt: monthEnd } },
    _count: { id: true },
  });

  // Build name → id mapping
  const staffByName = new Map<string, string>();
  for (const s of staffList) {
    staffByName.set(s.name, s.id);
  }

  // Aggregate per-staff
  type StaffData = {
    name: string;
    role: string;
    enrollments: number;
    paymentCount: number;
    totalPaymentAmount: number;
    counselingCount: number;
  };

  const staffMap = new Map<string, StaffData>();
  for (const s of staffList) {
    staffMap.set(s.id, {
      name: s.name,
      role: s.role,
      enrollments: 0,
      paymentCount: 0,
      totalPaymentAmount: 0,
      counselingCount: 0,
    });
  }

  for (const e of enrollmentsByStaff) {
    const entry = staffMap.get(e.staffId);
    if (entry) entry.enrollments = e._count.id;
  }

  for (const p of paymentsByStaff) {
    const entry = staffMap.get(p.processedBy);
    if (entry) {
      entry.paymentCount = p._count.id;
      entry.totalPaymentAmount = p._sum.netAmount ?? 0;
    }
  }

  for (const c of counselingByName) {
    const staffId = staffByName.get(c.counselorName);
    if (staffId) {
      const entry = staffMap.get(staffId);
      if (entry) entry.counselingCount = c._count.id;
    }
  }

  // Compute activity index: enrollments×3 + paymentCount×2 + counselingCount×1
  const rawRows = Array.from(staffMap.entries()).map(([id, v]) => ({
    id,
    ...v,
    activityIndex: v.enrollments * 3 + v.paymentCount * 2 + v.counselingCount * 1,
  }));

  // Filter to only those with any activity
  const activeRows = rawRows.filter(
    (r) => r.enrollments > 0 || r.paymentCount > 0 || r.counselingCount > 0
  );

  // Compute tiers
  const sortedIndices = activeRows
    .map((r) => r.activityIndex)
    .sort((a, b) => b - a);

  const rows: WorkloadRow[] = activeRows
    .map((r) => {
      const tier = computeTier(r.activityIndex, sortedIndices);
      const { color, bg, label } = tierStyle(tier);
      return {
        ...r,
        tier,
        tierColor: color,
        tierBg: bg,
        tierLabel: label,
      };
    })
    .sort((a, b) => b.activityIndex - a.activityIndex);

  // KPI totals
  const totalEnrollments = rows.reduce((s, r) => s + r.enrollments, 0);
  const totalPaymentCount = rows.reduce((s, r) => s + r.paymentCount, 0);
  const totalCounseling = rows.reduce((s, r) => s + r.counselingCount, 0);
  const activeStaffCount = rows.length;

  // Top performers
  const topByEnrollment = [...rows].sort((a, b) => b.enrollments - a.enrollments)[0];
  const topByPayment = [...rows].sort((a, b) => b.totalPaymentAmount - a.totalPaymentAmount)[0];
  const topByCounseling = [...rows].sort((a, b) => b.counselingCount - a.counselingCount)[0];

  // Activity index bar chart data
  const maxActivity = Math.max(...rows.map((r) => r.activityIndex), 1);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/analytics" className="transition hover:text-ember">
          분석 허브
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">직원 업무 부하 분석</span>
      </div>

      <div className="mt-4">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          인사 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">직원 업무 부하 분석</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          월별 직원별 등록 처리, 수납, 상담 건수를 종합하여 업무 부하 분포를 분석합니다.
        </p>
      </div>

      {/* Month selector */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-center gap-3">
          <select
            name="year"
            defaultValue={year}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
          >
            {Array.from(new Set(monthOptions.map((m) => m.year))).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            name="month"
            defaultValue={month}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
          <span className="ml-2 text-sm text-slate">
            현재 기간: <strong className="text-ink">{periodLabel}</strong>
          </span>
        </form>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">월 전체 등록</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {totalEnrollments.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 px-6 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">월 전체 수납</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-forest">
            {totalPaymentCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 px-6 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
            월 전체 상담
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-sky-700">
            {totalCounseling.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 px-6 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-ember">활성 직원</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ember">
            {activeStaffCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>
      </div>

      {/* Top performer highlight */}
      {rows.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {topByEnrollment && (
            <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-forest">
                등록 처리 최다
              </p>
              <p className="mt-3 text-xl font-bold text-ink">{topByEnrollment.name}</p>
              <p className="mt-1 text-sm text-slate">
                {ROLE_LABEL[topByEnrollment.role as AdminRole] ?? topByEnrollment.role}
              </p>
              <p className="mt-3 text-3xl font-bold text-forest">
                {topByEnrollment.enrollments}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
          )}
          {topByPayment && (
            <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ember">
                수납 처리 최다
              </p>
              <p className="mt-3 text-xl font-bold text-ink">{topByPayment.name}</p>
              <p className="mt-1 text-sm text-slate">
                {ROLE_LABEL[topByPayment.role as AdminRole] ?? topByPayment.role}
              </p>
              <p className="mt-3 text-2xl font-bold text-ember">
                {fmtKRW(topByPayment.totalPaymentAmount)}
              </p>
              <p className="mt-0.5 text-xs text-slate">{topByPayment.paymentCount}건 처리</p>
            </div>
          )}
          {topByCounseling && (
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                상담 최다
              </p>
              <p className="mt-3 text-xl font-bold text-ink">{topByCounseling.name}</p>
              <p className="mt-1 text-sm text-slate">
                {ROLE_LABEL[topByCounseling.role as AdminRole] ?? topByCounseling.role}
              </p>
              <p className="mt-3 text-3xl font-bold text-sky-700">
                {topByCounseling.counselingCount}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">직원별 업무 부하 현황</h2>
            <p className="mt-1 text-xs text-slate">
              {periodLabel} 기준 — 활동 지수 순 정렬 (등록×3 + 수납×2 + 상담×1)
            </p>
          </div>
          <Link
            href="/admin/analytics/staff-performance"
            className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:text-ink"
          >
            KPI 성과 →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-ink/10 py-12 text-center text-sm text-slate">
            {periodLabel}에 활동 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-2 w-6 text-center">#</th>
                  <th className="pb-3 pr-4">직원명</th>
                  <th className="pb-3 pr-4">역할</th>
                  <th className="pb-3 pr-4 text-right">등록 처리</th>
                  <th className="pb-3 pr-4 text-right">수납 처리</th>
                  <th className="pb-3 pr-4 text-right">상담</th>
                  <th className="pb-3 pr-4 text-right">총 수납액</th>
                  <th className="pb-3 pr-4">활동 지수</th>
                  <th className="pb-3 text-center">등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`transition ${
                      row.tier === "top"
                        ? "bg-green-50/40"
                        : row.tier === "low"
                          ? "bg-amber-50/30"
                          : "hover:bg-mist/40"
                    }`}
                  >
                    <td className="py-3 pr-2 text-center text-xs text-slate">{i + 1}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/staff-settlements/${row.id}`}
                        className="font-medium text-ink hover:text-ember hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate">
                      {ROLE_LABEL[row.role as AdminRole] ?? row.role}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.enrollments > 0 ? (
                        <span className="font-semibold text-forest">{row.enrollments}건</span>
                      ) : (
                        <span className="text-slate/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.paymentCount > 0 ? (
                        <span className="font-semibold text-ink">{row.paymentCount}건</span>
                      ) : (
                        <span className="text-slate/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.counselingCount > 0 ? (
                        <span className="font-semibold text-sky-700">{row.counselingCount}건</span>
                      ) : (
                        <span className="text-slate/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.totalPaymentAmount > 0 ? (
                        <span className="font-semibold text-ember">
                          {fmtKRW(row.totalPaymentAmount)}
                        </span>
                      ) : (
                        <span className="text-slate/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full bg-mist" style={{ height: 8 }}>
                          <div
                            className={`h-full rounded-full ${
                              row.tier === "top"
                                ? "bg-green-500"
                                : row.tier === "low"
                                  ? "bg-amber-400"
                                  : "bg-sky-400"
                            }`}
                            style={{
                              width: `${Math.round((row.activityIndex / maxActivity) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-xs font-semibold text-ink w-8 text-right">
                          {row.activityIndex}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${row.tierBg} ${row.tierColor}`}
                      >
                        {row.tierLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-mist/40 text-xs font-semibold text-slate">
                  <td className="py-3 pr-2" />
                  <td className="py-3 pr-4 text-ink">합계</td>
                  <td className="py-3 pr-4" />
                  <td className="py-3 pr-4 text-right text-forest">{totalEnrollments}건</td>
                  <td className="py-3 pr-4 text-right text-ink">{totalPaymentCount}건</td>
                  <td className="py-3 pr-4 text-right text-sky-700">{totalCounseling}건</td>
                  <td className="py-3 pr-4 text-right text-ember">
                    {fmtKRW(rows.reduce((s, r) => s + r.totalPaymentAmount, 0))}
                  </td>
                  <td className="py-3 pr-4" />
                  <td className="py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Guide */}
      <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 text-xs leading-6 text-slate">
        <strong className="text-ink">활동 지수:</strong>{" "}
        등록 처리×3 + 수납 처리×2 + 상담×1 의 가중합산 기준.{" "}
        <span className="text-green-700 font-semibold">활발</span> (상위 30%),{" "}
        <span className="text-sky-700 font-semibold">정상</span> (중위),{" "}
        <span className="text-amber-700 font-semibold">저활동</span> (하위 30%).
        <br />
        <strong className="text-ink">상담 집계:</strong>{" "}
        CounselingRecord.counselorName 기준. 이름이 AdminUser.name과 일치해야 집계됩니다.
      </div>

      {/* Nav links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          분석 허브로
        </Link>
        <Link
          href="/admin/analytics/staff-performance"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          직원 KPI 성과
        </Link>
        <Link
          href="/admin/dashboard/staff-workload"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          실시간 업무 현황
        </Link>
      </div>
    </div>
  );
}
