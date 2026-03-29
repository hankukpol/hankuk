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

function formatKRW(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "M";
  }
  if (Math.abs(n) >= 1_000) {
    return (n / 1_000).toFixed(0) + "K";
  }
  return n.toLocaleString("ko-KR");
}

function formatKRWFull(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
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
  TRANSFER: "이체",
  POINT: "포인트",
  MIXED: "혼합",
};

export default async function PaymentReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;
  const { year, month } = parseMonthParam(sp.month);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // Fetch all approved payments in month
  const allPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      netAmount: true,
      grossAmount: true,
      method: true,
      processedAt: true,
    },
  });

  // Fetch all refunds in month
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

  // Fetch DailySettlement records for month
  const settlements = await prisma.dailySettlement.findMany({
    where: {
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      date: true,
      cashAmount: true,
      cardAmount: true,
      transferAmount: true,
      netTotal: true,
      grossTotal: true,
      refundTotal: true,
      closedAt: true,
    },
  });

  // Build settlement map: dateStr -> settlement
  const settlementMap = new Map(
    settlements.map((s) => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return [key, s];
    }),
  );

  // Build per-day payment aggregates
  type DayRow = {
    date: string;
    dayLabel: string;
    cashAmount: number;
    cardAmount: number;
    transferAmount: number;
    otherAmount: number;
    paymentTotal: number;
    refundTotal: number;
    netActual: number;
    settlementTotal: number;
    discrepancy: number;
    paymentCount: number;
    isClosed: boolean;
    hasSettlement: boolean;
  };

  const dayRows: DayRow[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    const dayRefunds = allRefunds.filter((r) => {
      const t = new Date(r.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    const cashAmount = dayPayments
      .filter((p) => p.method === "CASH")
      .reduce((s, p) => s + p.netAmount, 0);
    const cardAmount = dayPayments
      .filter((p) => p.method === "CARD")
      .reduce((s, p) => s + p.netAmount, 0);
    const transferAmount = dayPayments
      .filter((p) => p.method === "TRANSFER")
      .reduce((s, p) => s + p.netAmount, 0);
    const otherAmount = dayPayments
      .filter((p) => !["CASH", "CARD", "TRANSFER"].includes(p.method))
      .reduce((s, p) => s + p.netAmount, 0);
    const paymentTotal = dayPayments.reduce((s, p) => s + p.netAmount, 0);
    const refundTotal = dayRefunds.reduce((s, r) => s + r.amount, 0);
    const netActual = paymentTotal - refundTotal;

    const settlement = settlementMap.get(dateStr);
    const settlementTotal = settlement?.netTotal ?? 0;
    const hasSettlement = !!settlement;
    const isClosed = !!settlement?.closedAt;
    const discrepancy = netActual - settlementTotal;

    // Only include days with activity or settlements
    if (dayPayments.length > 0 || dayRefunds.length > 0 || hasSettlement) {
      const jsDate = new Date(year, month - 1, day);
      const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][jsDate.getDay()];
      dayRows.push({
        date: dateStr,
        dayLabel: `${month}월 ${day}일 (${dayOfWeek})`,
        cashAmount,
        cardAmount,
        transferAmount,
        otherAmount,
        paymentTotal,
        refundTotal,
        netActual,
        settlementTotal,
        discrepancy,
        paymentCount: dayPayments.length,
        isClosed,
        hasSettlement,
      });
    }
  }

  // Summary totals
  const totalPayments = allPayments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunds = allRefunds.reduce((s, r) => s + r.amount, 0);
  const totalNet = totalPayments - totalRefunds;
  const totalSettlement = settlements.reduce((s, r) => s + r.netTotal, 0);
  const totalDiscrepancy = totalNet - totalSettlement;
  const closedDays = settlements.filter((s) => s.closedAt).length;

  // Method breakdown for month
  const methodTotals: Record<string, number> = {};
  for (const p of allPayments) {
    methodTotals[p.method] = (methodTotals[p.method] ?? 0) + p.netAmount;
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 대사
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">일별 수납 대사</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            수납 내역 합산과 일계표 정산 금액을 날짜별로 대조하여 차이를 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            href={`/admin/payments/reconciliation/report?month=${monthStr}`}
            className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/20"
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
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            종합 보고서
          </Link>
          <Link
            prefetch={false}
            href="/admin/settlements/daily"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
          >
            일계표
          </Link>
          <Link
            prefetch={false}
            href="/admin/settlements/reconciliation"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
          >
            수납 대사 (수강료)
          </Link>
        </div>
      </div>

      {/* Month selector */}
      <nav className="mt-6 flex items-center gap-3">
        <Link
          prefetch={false}
          href={`/admin/payments/reconciliation?month=${prevMonth(year, month)}`}
          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          ← 이전 달
        </Link>
        <span className="rounded-full border border-ember/20 bg-ember/10 px-5 py-2 text-sm font-bold text-ember">
          {year}년 {month}월
        </span>
        <Link
          prefetch={false}
          href={`/admin/payments/reconciliation?month=${nextMonth(year, month)}`}
          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          다음 달 →
        </Link>
      </nav>

      {/* Summary KPIs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">총 수납 (순액)</p>
          <p className="mt-3 text-2xl font-semibold text-ink">{formatKRWFull(totalNet)}</p>
          <p className="mt-2 text-xs text-slate">
            수납 {allPayments.length}건 · 환불 {formatKRWFull(totalRefunds)} 차감
          </p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/10 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">정산 확정액</p>
          <p className="mt-3 text-2xl font-semibold text-forest">{formatKRWFull(totalSettlement)}</p>
          <p className="mt-2 text-xs text-slate">마감 완료 {closedDays}일 · 정산 기록 {settlements.length}일</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 shadow-sm ${
            Math.abs(totalDiscrepancy) > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm font-medium text-slate">차이 (수납 − 정산)</p>
          <p
            className={`mt-3 text-2xl font-semibold ${
              Math.abs(totalDiscrepancy) > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {totalDiscrepancy >= 0 ? "+" : ""}
            {formatKRWFull(totalDiscrepancy)}
          </p>
          <p className="mt-2 text-xs text-slate">
            {Math.abs(totalDiscrepancy) === 0
              ? "정산 금액과 일치합니다"
              : totalDiscrepancy > 0
              ? "수납이 정산보다 많습니다"
              : "정산이 수납보다 많습니다"}
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">납부 수단 현황</p>
          <div className="mt-3 space-y-1 text-sm">
            {Object.entries(methodTotals)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([method, amount]) => (
                <div key={method} className="flex justify-between">
                  <span className="text-slate">{METHOD_LABEL[method] ?? method}</span>
                  <span className="font-semibold">{formatKRWFull(amount)}</span>
                </div>
              ))}
            {Object.keys(methodTotals).length === 0 && (
              <p className="text-slate">수납 내역 없음</p>
            )}
          </div>
        </article>
      </section>

      {/* Daily table */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">일별 대사 내역</h2>
          <p className="text-sm text-slate">날짜를 클릭하면 상세 내역을 확인합니다</p>
        </div>

        {dayRows.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
            {monthStr} 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">날짜</th>
                  <th className="px-5 py-4 text-right font-semibold">현금</th>
                  <th className="px-5 py-4 text-right font-semibold">카드</th>
                  <th className="px-5 py-4 text-right font-semibold">이체</th>
                  <th className="px-5 py-4 text-right font-semibold">합계</th>
                  <th className="px-5 py-4 text-right font-semibold">정산금액</th>
                  <th className="px-5 py-4 text-right font-semibold">차이</th>
                  <th className="px-5 py-4 font-semibold">상태</th>
                  <th className="px-5 py-4 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {dayRows.map((row) => {
                  const hasDiscrepancy = Math.abs(row.discrepancy) > 0;
                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-mist/40 ${hasDiscrepancy && row.hasSettlement ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <Link
                          prefetch={false}
                          href={`/admin/payments/reconciliation/${row.date}`}
                          className="font-semibold text-ink hover:text-ember"
                        >
                          {row.dayLabel}
                        </Link>
                        <p className="text-xs text-slate">{row.paymentCount}건</p>
                      </td>
                      <td className="px-5 py-4 text-right text-slate">
                        {row.cashAmount > 0 ? formatKRW(row.cashAmount) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right text-slate">
                        {row.cardAmount > 0 ? formatKRW(row.cardAmount) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right text-slate">
                        {row.transferAmount > 0 ? formatKRW(row.transferAmount) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">
                        {formatKRW(row.netActual)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {row.hasSettlement ? (
                          <span className="font-medium text-forest">
                            {formatKRW(row.settlementTotal)}
                          </span>
                        ) : (
                          <span className="text-slate/60">미정산</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {!row.hasSettlement ? (
                          <span className="text-slate/50">—</span>
                        ) : Math.abs(row.discrepancy) === 0 ? (
                          <span className="text-forest">0</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              row.discrepancy > 0 ? "text-amber-700" : "text-sky-700"
                            }`}
                          >
                            {row.discrepancy > 0 ? "+" : ""}
                            {formatKRW(row.discrepancy)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {!row.hasSettlement ? (
                          <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">
                            미기록
                          </span>
                        ) : row.isClosed ? (
                          Math.abs(row.discrepancy) === 0 ? (
                            <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest">
                              일치
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                              차이
                            </span>
                          )
                        ) : (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                            미마감
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          prefetch={false}
                          href={`/admin/payments/reconciliation/${row.date}`}
                          className="rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                        >
                          상세 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-ink/10 bg-mist/60">
                <tr>
                  <td className="px-5 py-4 font-semibold">합계</td>
                  <td className="px-5 py-4 text-right font-semibold">
                    {formatKRW(dayRows.reduce((s, r) => s + r.cashAmount, 0))}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">
                    {formatKRW(dayRows.reduce((s, r) => s + r.cardAmount, 0))}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">
                    {formatKRW(dayRows.reduce((s, r) => s + r.transferAmount, 0))}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-ink">
                    {formatKRWFull(totalNet)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-forest">
                    {formatKRWFull(totalSettlement)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold">
                    <span className={Math.abs(totalDiscrepancy) > 0 ? "text-amber-700" : "text-forest"}>
                      {totalDiscrepancy >= 0 ? "+" : ""}
                      {formatKRWFull(totalDiscrepancy)}
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="mt-6 flex flex-wrap gap-4 text-xs text-slate">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-forest/20 bg-forest/10" />
          <span>일치: 수납 합계 = 정산 금액</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-amber-200 bg-amber-50" />
          <span>차이: 수납 합계 ≠ 정산 금액</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-sky-200 bg-sky-50" />
          <span>미마감: 정산 기록은 있으나 마감 처리 전</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-ink/10 bg-mist" />
          <span>미기록: DailySettlement 레코드 없음</span>
        </div>
      </section>
    </div>
  );
}
