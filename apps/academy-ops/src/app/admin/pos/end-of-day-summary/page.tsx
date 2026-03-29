import { AdminRole, PaymentCategory, PaymentMethod } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildDateRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(dateStr + "T23:59:59.999");
  return { start, end };
}

function dateOffsetString(base: string, offsetDays: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtAmt(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function formatKrDateTime(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ── aggregation types ─────────────────────────────────────────────────────────

type MethodSummary = {
  method: PaymentMethod;
  count: number;
  amount: number;
};

type CategorySummary = {
  category: PaymentCategory;
  count: number;
  amount: number;
};

type RefundSummary = {
  count: number;
  amount: number;
};

type DaySummary = {
  totalCount: number;
  totalAmount: number;
  refundSummary: RefundSummary;
  netRevenue: number;
  byMethod: MethodSummary[];
  byCategory: CategorySummary[];
};

async function fetchDaySummary(dateStr: string): Promise<DaySummary> {
  const { start, end } = buildDateRange(dateStr);
  const prisma = getPrisma();

  const payments = await prisma.payment.findMany({
    where: {
      category: "SINGLE_COURSE",
      processedAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      netAmount: true,
      method: true,
      category: true,
      status: true,
      refunds: {
        where: { status: { in: ["COMPLETED", "APPROVED"] } },
        select: { amount: true },
      },
    },
  });

  const totalCount = payments.length;
  const totalAmount = payments.reduce((s, p) => s + p.netAmount, 0);

  // Refund totals
  const allRefundAmounts = payments.flatMap((p) => p.refunds.map((r) => r.amount));
  const refundCount = payments.filter(
    (p) => p.status === "FULLY_REFUNDED" || p.status === "PARTIAL_REFUNDED",
  ).length;
  const refundAmount = allRefundAmounts.reduce((s, a) => s + a, 0);

  const netRevenue = totalAmount - refundAmount;

  // By method
  const methodMap = new Map<PaymentMethod, MethodSummary>();
  for (const p of payments) {
    const existing = methodMap.get(p.method);
    if (existing) {
      existing.count += 1;
      existing.amount += p.netAmount;
    } else {
      methodMap.set(p.method, { method: p.method, count: 1, amount: p.netAmount });
    }
  }
  const byMethod = Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount);

  // By category
  const catMap = new Map<PaymentCategory, CategorySummary>();
  for (const p of payments) {
    const existing = catMap.get(p.category);
    if (existing) {
      existing.count += 1;
      existing.amount += p.netAmount;
    } else {
      catMap.set(p.category, { category: p.category, count: 1, amount: p.netAmount });
    }
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount);

  return {
    totalCount,
    totalAmount,
    refundSummary: { count: refundCount, amount: refundAmount },
    netRevenue,
    byMethod,
    byCategory,
  };
}

// ── component ─────────────────────────────────────────────────────────────────

export default async function PosEndOfDaySummaryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const resolvedParams = searchParams ? await searchParams : {};
  const today = new Date().toISOString().slice(0, 10);
  const dateStr =
    typeof resolvedParams.date === "string" ? resolvedParams.date : today;

  const yesterdayStr = dateOffsetString(dateStr, -1);
  const lastWeekStr = dateOffsetString(dateStr, -7);

  const [summary, yesterdaySummary, lastWeekSummary] = await Promise.all([
    fetchDaySummary(dateStr),
    fetchDaySummary(yesterdayStr),
    fetchDaySummary(lastWeekStr),
  ]);

  const allMethods: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "POINT", "MIXED"];
  const allCategories: PaymentCategory[] = [
    "TUITION",
    "TEXTBOOK",
    "MATERIAL",
    "FACILITY",
    "SINGLE_COURSE",
    "PENALTY",
    "ETC",
  ];

  function getMethodAmount(method: PaymentMethod, s: DaySummary): number {
    return s.byMethod.find((m) => m.method === method)?.amount ?? 0;
  }
  function getMethodCount(method: PaymentMethod, s: DaySummary): number {
    return s.byMethod.find((m) => m.method === method)?.count ?? 0;
  }
  function getCategoryAmount(cat: PaymentCategory, s: DaySummary): number {
    return s.byCategory.find((c) => c.category === cat)?.amount ?? 0;
  }
  function getCategoryCount(cat: PaymentCategory, s: DaySummary): number {
    return s.byCategory.find((c) => c.category === cat)?.count ?? 0;
  }

  function diffBadge(current: number, compare: number) {
    if (compare === 0 && current === 0) return null;
    if (compare === 0)
      return <span className="ml-1 text-xs text-forest">신규</span>;
    const diff = current - compare;
    const pct = Math.round((diff / compare) * 100);
    if (diff === 0) return <span className="ml-1 text-xs text-slate">±0%</span>;
    return (
      <span className={`ml-1 text-xs ${diff > 0 ? "text-forest" : "text-red-600"}`}>
        {diff > 0 ? "+" : ""}
        {pct}%
      </span>
    );
  }

  const isToday = dateStr === today;
  const prevDateStr = dateOffsetString(dateStr, -1);
  const nextDateStr = dateOffsetString(dateStr, 1);
  const canGoNext = nextDateStr <= today;

  return (
    <div className="p-8 sm:p-10">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      {/* Badge */}
      <div className="no-print inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        단과 POS
      </div>

      {/* Header */}
      <div className="no-print mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">일마감 보고서</h1>
          <p className="mt-2 text-sm leading-7 text-slate">
            단과 POS 일별 결제 합계 및 Z-Report
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/pos"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← POS 홈
          </Link>
          <Link
            href="/admin/pos/refund-management"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40"
          >
            환불 관리
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            인쇄 / PDF
          </button>
        </div>
      </div>

      {/* Date navigator */}
      <div className="no-print mt-6 flex items-center gap-3">
        <form method="GET">
          <div className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white p-2 shadow-sm">
            <Link
              href={`?date=${prevDateStr}`}
              className="rounded-xl px-3 py-1.5 text-sm text-slate transition hover:bg-mist hover:text-ink"
            >
              ‹
            </Link>
            <input
              name="date"
              type="date"
              defaultValue={dateStr}
              max={today}
              className="rounded-xl border-0 bg-transparent px-2 py-1 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-ember/20"
              onChange={(e) => {
                window.location.href = `?date=${e.target.value}`;
              }}
            />
            {canGoNext && (
              <Link
                href={`?date=${nextDateStr}`}
                className="rounded-xl px-3 py-1.5 text-sm text-slate transition hover:bg-mist hover:text-ink"
              >
                ›
              </Link>
            )}
            {!isToday && (
              <Link
                href="?"
                className="rounded-xl bg-ember/10 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
              >
                오늘
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Report container */}
      <div className="mt-8 space-y-6">
        {/* ── Z-Report header ── */}
        <div
          className="rounded-[28px] border border-ink/10 bg-white p-8"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}
        >
          {/* Top band */}
          <div className="rounded-2xl px-6 py-4" style={{ backgroundColor: "#1F4D3A" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                  Z-Report · ACADEMY OPS
                </p>
                <p className="mt-1 text-2xl font-bold text-white">일마감 보고서</p>
              </div>
              <div className="text-right text-white">
                <p className="text-[11px] text-white/60">보고 일자</p>
                <p className="mt-0.5 text-lg font-bold">{formatKrDateTime(dateStr)}</p>
              </div>
            </div>
          </div>

          {/* Academy info band */}
          <div
            className="rounded-b-none px-6 py-2 text-[11px] font-semibold text-white"
            style={{ backgroundColor: "#C55A11" }}
          >
            학원명 미설정 · 대구광역시 중구 중앙대로 390 · 연락처는 관리자 설정을 확인하세요
          </div>

          {/* KPI Summary */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-ink/10 bg-mist/40 p-4 text-center">
              <p className="text-[11px] font-medium text-slate">총 결제 건수</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">
                {summary.totalCount}
              </p>
              <p className="mt-0.5 text-xs text-slate">건</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist/40 p-4 text-center">
              <p className="text-[11px] font-medium text-slate">총 결제 합계</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-ember">
                {summary.totalAmount.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-slate">원</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 text-center">
              <p className="text-[11px] font-medium text-red-600">취소/환불</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-red-600">
                {summary.refundSummary.count}건 /{" "}
                {summary.refundSummary.amount.toLocaleString()}원
              </p>
              <p className="mt-0.5 text-xs text-red-400">건 / 금액</p>
            </div>
            <div className="rounded-2xl border border-forest/20 bg-forest/5 p-4 text-center">
              <p className="text-[11px] font-medium text-forest">순 매출</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-forest">
                {summary.netRevenue.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-forest/70">원</p>
            </div>
          </div>
        </div>

        {/* ── 결제 수단별 합계 ── */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">결제 수단별 합계</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50">
                  {["결제 수단", "건수", "금액", "전일 대비", "전주 동요일 대비"].map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-slate ${h === "금액" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {allMethods
                  .filter(
                    (m) =>
                      getMethodAmount(m, summary) > 0 ||
                      getMethodAmount(m, yesterdaySummary) > 0 ||
                      getMethodAmount(m, lastWeekSummary) > 0,
                  )
                  .map((method) => {
                    const amt = getMethodAmount(method, summary);
                    const cnt = getMethodCount(method, summary);
                    const ydAmt = getMethodAmount(method, yesterdaySummary);
                    const lwAmt = getMethodAmount(method, lastWeekSummary);
                    return (
                      <tr key={method} className="hover:bg-mist/20">
                        <td className="px-4 py-3 font-medium text-ink">
                          {PAYMENT_METHOD_LABEL[method]}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">{cnt}건</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                          {fmtAmt(amt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="tabular-nums text-slate">{fmtAmt(ydAmt)}</span>
                          {diffBadge(amt, ydAmt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="tabular-nums text-slate">{fmtAmt(lwAmt)}</span>
                          {diffBadge(amt, lwAmt)}
                        </td>
                      </tr>
                    );
                  })}
                {/* Total row */}
                <tr className="border-t border-ink/10 bg-mist/40 font-bold">
                  <td className="px-4 py-3 text-ink">합계</td>
                  <td className="px-4 py-3 tabular-nums text-ink">{summary.totalCount}건</td>
                  <td className="px-4 py-3 text-right tabular-nums text-forest">
                    {fmtAmt(summary.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-slate">
                      {fmtAmt(yesterdaySummary.totalAmount)}
                    </span>
                    {diffBadge(summary.totalAmount, yesterdaySummary.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-slate">
                      {fmtAmt(lastWeekSummary.totalAmount)}
                    </span>
                    {diffBadge(summary.totalAmount, lastWeekSummary.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 항목별 합계 ── */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">항목별 합계</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50">
                  {["항목", "건수", "금액", "전일 대비", "전주 동요일 대비"].map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-slate ${h === "금액" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {allCategories
                  .filter(
                    (c) =>
                      getCategoryAmount(c, summary) > 0 ||
                      getCategoryAmount(c, yesterdaySummary) > 0 ||
                      getCategoryAmount(c, lastWeekSummary) > 0,
                  )
                  .map((cat) => {
                    const amt = getCategoryAmount(cat, summary);
                    const cnt = getCategoryCount(cat, summary);
                    const ydAmt = getCategoryAmount(cat, yesterdaySummary);
                    const lwAmt = getCategoryAmount(cat, lastWeekSummary);
                    return (
                      <tr key={cat} className="hover:bg-mist/20">
                        <td className="px-4 py-3 font-medium text-ink">
                          {PAYMENT_CATEGORY_LABEL[cat]}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">{cnt}건</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                          {fmtAmt(amt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="tabular-nums text-slate">{fmtAmt(ydAmt)}</span>
                          {diffBadge(amt, ydAmt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="tabular-nums text-slate">{fmtAmt(lwAmt)}</span>
                          {diffBadge(amt, lwAmt)}
                        </td>
                      </tr>
                    );
                  })}
                {allCategories.every(
                  (c) =>
                    getCategoryAmount(c, summary) === 0 &&
                    getCategoryAmount(c, yesterdaySummary) === 0 &&
                    getCategoryAmount(c, lastWeekSummary) === 0,
                ) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate">
                      해당 날짜의 결제 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 취소/환불 내역 ── */}
        <div className="rounded-[28px] border border-red-100 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-red-700">취소 / 환불 요약</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
              <p className="text-xs font-medium text-red-600">취소 건수</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-red-700">
                {summary.refundSummary.count}
              </p>
              <p className="mt-0.5 text-xs text-red-400">건</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
              <p className="text-xs font-medium text-red-600">취소 금액</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-red-700">
                {summary.refundSummary.amount.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-red-400">원</p>
            </div>
            <div className="rounded-2xl border border-forest/20 bg-forest/5 p-4">
              <p className="text-xs font-medium text-forest">순 매출</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
                {summary.netRevenue.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-forest/60">원 (총 결제 - 환불)</p>
            </div>
          </div>

          {/* Comparison row */}
          <div className="mt-4 rounded-2xl border border-ink/10 bg-mist/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate">
              비교
            </p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate">전일 ({yesterdayStr})</p>
                <p className="mt-1 font-semibold tabular-nums text-ink">
                  {fmtAmt(yesterdaySummary.netRevenue)}
                </p>
                {diffBadge(summary.netRevenue, yesterdaySummary.netRevenue)}
              </div>
              <div>
                <p className="text-xs text-slate">전주 동요일 ({lastWeekStr})</p>
                <p className="mt-1 font-semibold tabular-nums text-ink">
                  {fmtAmt(lastWeekSummary.netRevenue)}
                </p>
                {diffBadge(summary.netRevenue, lastWeekSummary.netRevenue)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Report footer ── */}
        <div className="rounded-[28px] border border-ink/10 bg-mist/40 p-6 text-center">
          <p className="text-sm font-semibold text-ink">{formatKrDateTime(dateStr)} 일마감 보고서</p>
          <p className="mt-1 text-xs text-slate">학원명 미설정</p>
          <div className="mx-auto mt-4 max-w-sm border-t border-ink/10 pt-4 text-xs text-slate">
            <p>총 결제: {fmtAmt(summary.totalAmount)} ({summary.totalCount}건)</p>
            <p className="text-red-600">
              취소: -{fmtAmt(summary.refundSummary.amount)} ({summary.refundSummary.count}건)
            </p>
            <p className="mt-1 font-bold text-forest">
              순 매출: {fmtAmt(summary.netRevenue)}
            </p>
          </div>
          <div className="no-print mt-4 flex justify-center gap-3">
            <Link
              href={`/admin/settlements/daily?date=${dateStr}`}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              일계표로 이동 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
