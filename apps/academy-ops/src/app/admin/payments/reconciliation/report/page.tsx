import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatKRWFull(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function formatPercent(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((part / total) * 100).toFixed(1) + "%";
}

function prevMonth(year: number, month: number): string {
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

export default async function ReconciliationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; format?: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;
  const { year, month } = parseMonthParam(sp.month);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const isPrint = sp.format === "print";

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // Fetch all approved payments for the month
  const allPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      id: true,
      netAmount: true,
      grossAmount: true,
      method: true,
      processedAt: true,
    },
  });

  // Fetch all completed refunds for the month
  const allRefunds = await prisma.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      amount: true,
      processedAt: true,
    },
  });

  // Fetch DailySettlement records for the month
  const settlements = await prisma.dailySettlement.findMany({
    where: {
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      date: true,
      netTotal: true,
      closedAt: true,
    },
    orderBy: { date: "asc" },
  });

  // Build settlement map: dateStr -> settlementTotal
  const settlementMap = new Map<string, { total: number; isClosed: boolean }>();
  for (const s of settlements) {
    const d = new Date(s.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    settlementMap.set(key, { total: s.netTotal, isClosed: !!s.closedAt });
  }

  // Aggregate totals
  const totalPaymentCount = allPayments.length;
  const totalPayments = allPayments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunds = allRefunds.reduce((s, r) => s + r.amount, 0);
  const totalNet = totalPayments - totalRefunds;
  const totalSettlement = settlements.reduce((s, r) => s + r.netTotal, 0);
  const totalDiscrepancy = totalNet - totalSettlement;

  // Method breakdown
  const methodTotals: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!methodTotals[p.method]) {
      methodTotals[p.method] = { count: 0, amount: 0 };
    }
    methodTotals[p.method].count += 1;
    methodTotals[p.method].amount += p.netAmount;
  }
  const methodRows = Object.entries(methodTotals).sort((a, b) => b[1].amount - a[1].amount);

  // Days with discrepancies (settlement exists but doesn't match)
  type DiscrepancyRow = {
    date: string;
    dateLabel: string;
    paymentAmount: number;
    refundAmount: number;
    netActual: number;
    settlementAmount: number;
    discrepancy: number;
    isClosed: boolean;
  };

  const discrepancyRows: DiscrepancyRow[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const settlement = settlementMap.get(dateStr);
    if (!settlement) continue; // Only rows with settlement records can show discrepancy

    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    const dayRefunds = allRefunds.filter((r) => {
      const t = new Date(r.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    const paymentAmount = dayPayments.reduce((s, p) => s + p.netAmount, 0);
    const refundAmount = dayRefunds.reduce((s, r) => s + r.amount, 0);
    const netActual = paymentAmount - refundAmount;
    const discrepancy = netActual - settlement.total;

    if (Math.abs(discrepancy) > 0) {
      const jsDate = new Date(year, month - 1, day);
      const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][jsDate.getDay()];
      discrepancyRows.push({
        date: dateStr,
        dateLabel: `${month}월 ${day}일 (${dayOfWeek})`,
        paymentAmount,
        refundAmount,
        netActual,
        settlementAmount: settlement.total,
        discrepancy,
        isClosed: settlement.isClosed,
      });
    }
  }

  const totalDiscrepancyFromRows = discrepancyRows.reduce((s, r) => s + r.discrepancy, 0);

  const printHref = `/admin/payments/reconciliation/report?month=${monthStr}&format=print`;
  const reportHref = `/admin/payments/reconciliation/report?month=${monthStr}`;

  return (
    <div className={`p-8 sm:p-10 ${isPrint ? "print:p-4" : ""}`}>
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 대사
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수납 대사 종합 보고서</h1>
          <p className="mt-2 text-sm text-slate">
            {year}년 {month}월 — 수납 내역, 결제 수단별 현황, 불일치 항목을 종합한 월간 보고서입니다.
          </p>
        </div>
        {!isPrint && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link
              prefetch={false}
              href={`/admin/payments/reconciliation?month=${monthStr}`}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              ← 일별 대사
            </Link>
            <a
              href={printHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
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
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              인쇄
            </a>
          </div>
        )}
        {isPrint && (
          <div className="print:hidden">
            <Link
              prefetch={false}
              href={reportHref}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              ← 보고서로 돌아가기
            </Link>
          </div>
        )}
      </div>

      {/* Month navigation */}
      {!isPrint && (
        <nav className="mt-6 flex items-center gap-3 print:hidden">
          <Link
            prefetch={false}
            href={`/admin/payments/reconciliation/report?month=${prevMonth(year, month)}`}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
          >
            ← 이전 달
          </Link>
          <span className="rounded-full border border-ember/20 bg-ember/10 px-5 py-2 text-sm font-bold text-ember">
            {year}년 {month}월
          </span>
          <Link
            prefetch={false}
            href={`/admin/payments/reconciliation/report?month=${nextMonth(year, month)}`}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
          >
            다음 달 →
          </Link>
        </nav>
      )}

      {/* Summary KPIs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">총 수납 건수</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {totalPaymentCount.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">환불 {allRefunds.length}건 포함</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">총 수납액 (순액)</p>
          <p className="mt-3 text-2xl font-semibold text-ink">{formatKRWFull(totalNet)}</p>
          <p className="mt-2 text-xs text-slate">
            수납 {formatKRWFull(totalPayments)} − 환불 {formatKRWFull(totalRefunds)}
          </p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/10 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">정산 확정액</p>
          <p className="mt-3 text-2xl font-semibold text-forest">{formatKRWFull(totalSettlement)}</p>
          <p className="mt-2 text-xs text-slate">{settlements.length}일 정산 기록</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 shadow-sm ${
            Math.abs(totalDiscrepancy) > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm font-medium text-slate">미대사 차액</p>
          <p
            className={`mt-3 text-2xl font-semibold ${
              Math.abs(totalDiscrepancy) > 0 ? "text-amber-700" : "text-forest"
            }`}
          >
            {totalDiscrepancy >= 0 ? "+" : ""}
            {formatKRWFull(totalDiscrepancy)}
          </p>
          <p className="mt-2 text-xs text-slate">
            {Math.abs(totalDiscrepancy) === 0
              ? "정산 금액과 완전히 일치"
              : `불일치 ${discrepancyRows.length}건`}
          </p>
        </article>
      </section>

      {/* Payment method breakdown */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">결제 수단별 현황</h2>
        {methodRows.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            {year}년 {month}월 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-6 py-4 font-semibold">결제 수단</th>
                  <th className="px-6 py-4 text-right font-semibold">건수</th>
                  <th className="px-6 py-4 text-right font-semibold">금액</th>
                  <th className="px-6 py-4 text-right font-semibold">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {methodRows.map(([method, { count, amount }]) => (
                  <tr key={method} className="hover:bg-mist/40">
                    <td className="px-6 py-4 font-medium text-ink">
                      {METHOD_LABEL[method] ?? method}
                    </td>
                    <td className="px-6 py-4 text-right text-slate">
                      {count.toLocaleString("ko-KR")}건
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-ink">
                      {formatKRWFull(amount)}
                    </td>
                    <td className="px-6 py-4 text-right text-slate">
                      {formatPercent(amount, totalPayments)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink/10 bg-mist/60">
                <tr>
                  <td className="px-6 py-4 font-semibold">합계</td>
                  <td className="px-6 py-4 text-right font-semibold">
                    {totalPaymentCount.toLocaleString("ko-KR")}건
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-ink">
                    {formatKRWFull(totalPayments)}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-ink">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Discrepancy items */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            불일치 항목
            {discrepancyRows.length > 0 && (
              <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-700">
                {discrepancyRows.length}건
              </span>
            )}
          </h2>
          <p className="text-sm text-slate">수납 합계와 정산 금액이 다른 날짜</p>
        </div>

        {discrepancyRows.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-forest/20 bg-forest/10 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-forest">불일치 항목이 없습니다</p>
            <p className="mt-1 text-xs text-slate">
              {settlements.length > 0
                ? "모든 정산 기록이 수납 내역과 일치합니다."
                : "이번 달 정산 기록이 없습니다."}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-6 py-4 font-semibold">날짜</th>
                  <th className="px-6 py-4 text-right font-semibold">수납액</th>
                  <th className="px-6 py-4 text-right font-semibold">정산액</th>
                  <th className="px-6 py-4 text-right font-semibold">차이</th>
                  <th className="px-6 py-4 font-semibold">상태</th>
                  <th className="px-6 py-4 font-semibold print:hidden">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {discrepancyRows.map((row) => (
                  <tr key={row.date} className="bg-amber-50/40 hover:bg-amber-50/70">
                    <td className="px-6 py-4 font-medium text-ink">{row.dateLabel}</td>
                    <td className="px-6 py-4 text-right text-ink">
                      {formatKRWFull(row.netActual)}
                    </td>
                    <td className="px-6 py-4 text-right text-forest">
                      {formatKRWFull(row.settlementAmount)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-semibold ${
                          row.discrepancy > 0 ? "text-amber-700" : "text-sky-700"
                        }`}
                      >
                        {row.discrepancy > 0 ? "+" : ""}
                        {formatKRWFull(row.discrepancy)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {row.isClosed ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          마감 후 차이
                        </span>
                      ) : (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          미마감
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 print:hidden">
                      <Link
                        prefetch={false}
                        href={`/admin/payments/reconciliation/${row.date}`}
                        className="rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink/10 bg-mist/60">
                <tr>
                  <td className="px-6 py-4 font-semibold">합계 차액</td>
                  <td colSpan={2} />
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`font-bold ${
                        Math.abs(totalDiscrepancyFromRows) > 0 ? "text-amber-700" : "text-forest"
                      }`}
                    >
                      {totalDiscrepancyFromRows >= 0 ? "+" : ""}
                      {formatKRWFull(totalDiscrepancyFromRows)}
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Print note */}
      {isPrint && (
        <section className="mt-8 border-t border-ink/10 pt-6 text-xs text-slate">
          <p>
            보고서 생성일: {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
            &nbsp;/&nbsp;학원 수납 대사 종합 보고서
          </p>
        </section>
      )}
    </div>
  );
}
