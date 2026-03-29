import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  ForecastClient,
  type MonthlyRevenue,
  type ForecastKpis,
} from "./forecast-client";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1 + n, 1);
  return toYearMonth(date);
}

/**
 * Simple linear regression on y values (indices 0, 1, 2, ...).
 * Returns a function that predicts y for a given x.
 */
function linearRegression(ys: number[]): (x: number) => number {
  const n = ys.length;
  if (n === 0) return () => 0;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return (x: number) => Math.max(0, Math.round(slope * x + intercept));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RevenueForecastPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const prisma = getPrisma();

  const now = new Date();
  const currentYearMonth = toYearMonth(now);

  // Compute 12-month window: from 11 months ago to current month
  const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Fetch payments for last 12 months (approved, not fully refunded)
  const payments = await prisma.payment.findMany({
    where: {
      processedAt: { gte: startDate },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    select: {
      processedAt: true,
      netAmount: true,
      grossAmount: true,
      enrollmentId: true,
    },
  });

  // Fetch refunds completed in the same window
  const refunds = await prisma.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: { gte: startDate },
    },
    select: {
      processedAt: true,
      amount: true,
    },
  });

  // Count enrollments per month (CourseEnrollment created)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      createdAt: { gte: startDate },
    },
    select: {
      createdAt: true,
    },
  });

  // Build a map of yearMonth -> aggregated data
  const monthMap: Record<
    string,
    { totalRevenue: number; refundTotal: number; enrollmentCount: number }
  > = {};

  // Initialize all 12 months
  for (let i = 11; i >= 0; i--) {
    const ym = toYearMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
    monthMap[ym] = { totalRevenue: 0, refundTotal: 0, enrollmentCount: 0 };
  }

  // Aggregate payments
  for (const p of payments) {
    const ym = toYearMonth(p.processedAt);
    if (monthMap[ym]) {
      monthMap[ym]!.totalRevenue += p.netAmount;
    }
  }

  // Aggregate refunds
  for (const r of refunds) {
    const ym = toYearMonth(r.processedAt);
    if (monthMap[ym]) {
      monthMap[ym]!.refundTotal += r.amount;
    }
  }

  // Aggregate enrollments
  for (const e of enrollments) {
    const ym = toYearMonth(e.createdAt);
    if (monthMap[ym]) {
      monthMap[ym]!.enrollmentCount += 1;
    }
  }

  // Build sorted actual months array
  const sortedMonths = Object.keys(monthMap).sort();

  // Compute net revenue and MoM growth
  const actualMonths: MonthlyRevenue[] = sortedMonths.map((ym, idx) => {
    const data = monthMap[ym]!;
    const netRevenue = Math.max(0, data.totalRevenue - data.refundTotal);
    const prevYm = idx > 0 ? sortedMonths[idx - 1] : null;
    const prevNet = prevYm
      ? Math.max(0, (monthMap[prevYm]?.totalRevenue ?? 0) - (monthMap[prevYm]?.refundTotal ?? 0))
      : null;

    const momGrowthRate =
      prevNet !== null && prevNet > 0
        ? Math.round(((netRevenue - prevNet) / prevNet) * 1000) / 10
        : null;

    return {
      yearMonth: ym,
      totalRevenue: data.totalRevenue,
      refundTotal: data.refundTotal,
      netRevenue,
      enrollmentCount: data.enrollmentCount,
      momGrowthRate,
      isProjected: false,
    };
  });

  // ── Linear projection for next 3 months ───────────────────────────────────
  // Use last 6 months of actual data for the trend
  const trendMonths = actualMonths.slice(-6);
  const netValues = trendMonths.map((m) => m.netRevenue);
  const grossValues = trendMonths.map((m) => m.totalRevenue);
  const predictNet = linearRegression(netValues);
  const predictGross = linearRegression(grossValues);
  const baseIdx = netValues.length; // next index after the window

  const projectedMonths: MonthlyRevenue[] = [1, 2, 3].map((offset) => {
    const ym = addMonths(currentYearMonth, offset);
    const projectedNet = predictNet(baseIdx + offset - 1);
    const projectedGross = predictGross(baseIdx + offset - 1);

    // Use previous month's net to compute MoM
    const prevYm = addMonths(currentYearMonth, offset - 1);
    const prevActual = actualMonths.find((m) => m.yearMonth === prevYm);
    const prevProjected = offset > 1 ? projectedMonths[offset - 2] : null;
    const prevNet = prevActual?.netRevenue ?? prevProjected?.netRevenue ?? null;

    const momGrowthRate =
      prevNet !== null && prevNet > 0
        ? Math.round(((projectedNet - prevNet) / prevNet) * 1000) / 10
        : null;

    return {
      yearMonth: ym,
      totalRevenue: projectedGross,
      refundTotal: Math.max(0, projectedGross - projectedNet),
      netRevenue: projectedNet,
      enrollmentCount: 0,
      momGrowthRate,
      isProjected: true,
    };
  });

  const allMonths = [...actualMonths, ...projectedMonths];

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const thisMonth = actualMonths.find((m) => m.yearMonth === currentYearMonth);
  const thisMonthNet = thisMonth?.netRevenue ?? 0;

  const ytdYear = now.getFullYear();
  const ytdTotal = actualMonths
    .filter((m) => m.yearMonth.startsWith(String(ytdYear)))
    .reduce((s, m) => s + m.netRevenue, 0);

  const nonZeroMonths = actualMonths.filter((m) => m.netRevenue > 0);
  const avgMonthly =
    nonZeroMonths.length > 0
      ? Math.round(nonZeroMonths.reduce((s, m) => s + m.netRevenue, 0) / nonZeroMonths.length)
      : 0;

  const growthRate = thisMonth?.momGrowthRate ?? null;

  const kpis: ForecastKpis = {
    thisMonthNet,
    ytdTotal,
    avgMonthly,
    growthRate,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 분석
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수입 예측 대시보드</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            최근 12개월 실적 기반 월별 수납 추이와 향후 3개월 선형 예측을 제공합니다.
          </p>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/analytics/revenue"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            수납 분석 →
          </Link>
          <Link
            href="/admin/settlements/monthly"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            월계표 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/analytics" className="hover:text-ember hover:underline">
          분석
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">수입 예측 대시보드</span>
      </nav>

      {/* Client component */}
      <div className="mt-8">
        <ForecastClient months={allMonths} kpis={kpis} />
      </div>
    </div>
  );
}
