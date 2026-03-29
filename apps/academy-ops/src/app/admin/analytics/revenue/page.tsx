import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RevenueAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = searchParams ? await searchParams : {};
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // All approved payments this year
  const payments = await getPrisma().payment.findMany({
    where: {
      status: "APPROVED",
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    select: {
      category: true,
      method: true,
      netAmount: true,
      grossAmount: true,
      discountAmount: true,
      createdAt: true,
    },
  }).catch(() => []);

  // Refunds completed this year
  const refunds = await getPrisma().refund.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    select: { amount: true, createdAt: true },
  }).catch(() => []);

  // Monthly aggregation
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthPayments = payments.filter(
      (p) => new Date(p.createdAt).getMonth() + 1 === month
    );
    const monthRefunds = refunds.filter(
      (r) => new Date(r.createdAt).getMonth() + 1 === month
    );
    const gross = monthPayments.reduce((s, p) => s + p.netAmount, 0);
    const refunded = monthRefunds.reduce((s, r) => s + r.amount, 0);
    return {
      month,
      gross,
      refunded,
      net: gross - refunded,
      count: monthPayments.length,
    };
  });

  // Category breakdown
  const categoryMap = new Map<string, number>();
  for (const p of payments) {
    categoryMap.set(p.category, (categoryMap.get(p.category) ?? 0) + p.netAmount);
  }

  // Method breakdown
  const methodMap = new Map<string, number>();
  for (const p of payments) {
    methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + p.netAmount);
  }

  // Totals
  const totalGross = payments.reduce((s, p) => s + p.netAmount, 0);
  const totalDiscount = payments.reduce((s, p) => s + (p.discountAmount ?? 0), 0);
  const totalRefunds = refunds.reduce((s, r) => s + r.amount, 0);
  const totalNet = totalGross - totalRefunds;

  function formatKRW(n: number) {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
    if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
    return `${n.toLocaleString()}원`;
  }

  const CATEGORY_LABEL: Record<string, string> = {
    TUITION: "수강료",
    FACILITY: "시설비",
    TEXTBOOK: "교재",
    MATERIAL: "교구·소모품",
    SINGLE_COURSE: "단과 POS",
    PENALTY: "위약금",
    ETC: "기타",
  };

  const METHOD_LABEL: Record<string, string> = {
    CASH: "현금",
    CARD: "카드",
    TRANSFER: "계좌이체",
    POINT: "포인트",
    MIXED: "혼합",
  };

  const prevYear = year - 1;
  const nextYear = year + 1;
  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 분석
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{year}년 수납 분석</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`?year=${prevYear}`}
            className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            ← {prevYear}
          </Link>
          {year !== currentYear && (
            <Link
              href={`?year=${currentYear}`}
              className="rounded-lg border border-ember/20 bg-ember/5 px-3 py-1.5 text-sm text-ember hover:bg-ember/10"
            >
              올해
            </Link>
          )}
          {year < currentYear && (
            <Link
              href={`?year=${nextYear}`}
              className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
            >
              {nextYear} →
            </Link>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "연간 수납 총계",
            value: formatKRW(totalGross),
            sub: `${payments.length}건`,
            highlight: false,
          },
          {
            label: "할인 총계",
            value: formatKRW(totalDiscount),
            sub: "할인 적용 금액",
            highlight: false,
          },
          {
            label: "환불 총계",
            value: formatKRW(totalRefunds),
            sub: `${refunds.length}건`,
            highlight: false,
          },
          {
            label: "순 수납",
            value: formatKRW(totalNet),
            sub: "수납 - 환불",
            highlight: true,
          },
        ].map(({ label, value, sub, highlight }) => (
          <div
            key={label}
            className={`rounded-[24px] border p-5 shadow-panel ${
              highlight
                ? "border-ember/30 bg-ember/5"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-slate">
              {label}
            </p>
            <p
              className={`mt-2 text-2xl font-bold ${
                highlight ? "text-ember" : "text-ink"
              }`}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-slate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">월별 수납 현황</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">월</th>
                <th className="pb-2 pr-4 text-right">건수</th>
                <th className="pb-2 pr-4 text-right">수납</th>
                <th className="pb-2 pr-4 text-right">환불</th>
                <th className="pb-2 text-right">순수납</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthlyData.map((row) => (
                <tr
                  key={row.month}
                  className={row.gross === 0 ? "text-slate/50" : ""}
                >
                  <td className="py-2 pr-4 font-medium">{row.month}월</td>
                  <td className="py-2 pr-4 text-right">{row.count}건</td>
                  <td className="py-2 pr-4 text-right">
                    {row.gross > 0 ? formatKRW(row.gross) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right text-red-600">
                    {row.refunded > 0 ? `-${formatKRW(row.refunded)}` : "—"}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {row.gross > 0 ? formatKRW(row.net) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink/20 font-semibold">
                <td className="pt-2 pr-4">합계</td>
                <td className="pt-2 pr-4 text-right">{payments.length}건</td>
                <td className="pt-2 pr-4 text-right text-ember">
                  {formatKRW(totalGross)}
                </td>
                <td className="pt-2 pr-4 text-right text-red-600">
                  -{formatKRW(totalRefunds)}
                </td>
                <td className="pt-2 text-right text-ember">
                  {formatKRW(totalNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Category + Method side by side */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Category */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">항목별 수납</h2>
          <div className="mt-4 space-y-3">
            {Array.from(categoryMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-sm text-slate">
                    {CATEGORY_LABEL[cat] ?? cat}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {formatKRW(amt)}
                  </span>
                </div>
              ))}
            {categoryMap.size === 0 && (
              <p className="text-sm text-slate">데이터 없음</p>
            )}
          </div>
        </div>

        {/* Method */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">결제 수단별</h2>
          <div className="mt-4 space-y-3">
            {Array.from(methodMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([method, amt]) => (
                <div key={method} className="flex items-center justify-between">
                  <span className="text-sm text-slate">
                    {METHOD_LABEL[method] ?? method}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {formatKRW(amt)}
                  </span>
                </div>
              ))}
            {methodMap.size === 0 && (
              <p className="text-sm text-slate">데이터 없음</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/reports/monthly"
            className="text-sm text-ember hover:underline"
          >
            월간 보고서 →
          </Link>
          <Link
            href="/admin/reports/annual"
            className="text-sm text-ember hover:underline"
          >
            연간 보고서 →
          </Link>
          <Link
            href="/admin/payments"
            className="text-sm text-slate hover:underline"
          >
            수납 내역 →
          </Link>
          <Link
            href="/admin/payments/refunds"
            className="text-sm text-slate hover:underline"
          >
            환불 내역 →
          </Link>
          <Link
            href="/admin/analytics/special-lecture-revenue"
            className="text-sm text-ember hover:underline"
          >
            특강 매출 분석 →
          </Link>
        </div>
      </div>
    </div>
  );
}
