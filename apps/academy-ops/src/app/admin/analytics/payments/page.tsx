import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·재료",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

function parseMonthParam(raw: string | string[] | undefined): { year: number; month: number } {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    if (year && month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatCompactKRW(amount: number): string {
  if (amount >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(1)}억원`;
  }
  if (amount >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return formatKRW(amount);
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

export default async function PaymentAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(resolvedSearchParams.month);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const previousMonthStart = new Date(year, month - 2, 1);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueSoonEnd = new Date(todayStart);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);

  const sixMonthsStart = new Date(year, month - 6, 1);
  const prisma = getPrisma();

  const [
    payments,
    previousMonthPayments,
    refunds,
    trendPayments,
    trendRefunds,
    unpaidSummary,
    overdueCount,
    dueSoonCount,
    settlements,
  ] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED] },
          processedAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          id: true,
          category: true,
          method: true,
          grossAmount: true,
          netAmount: true,
          discountAmount: true,
          processedAt: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED] },
          processedAt: { gte: previousMonthStart, lt: monthStart },
        },
        select: {
          netAmount: true,
        },
      }),
      prisma.refund.findMany({
        where: {
          status: "COMPLETED",
          processedAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          amount: true,
          payment: { select: { method: true, category: true } },
        },
      }),
      prisma.payment.findMany({
        where: {
          status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED] },
          processedAt: { gte: sixMonthsStart, lt: monthEnd },
        },
        select: {
          processedAt: true,
          netAmount: true,
        },
      }),
      prisma.refund.findMany({
        where: {
          status: "COMPLETED",
          processedAt: { gte: sixMonthsStart, lt: monthEnd },
        },
        select: {
          processedAt: true,
          amount: true,
        },
      }),
      prisma.installment.aggregate({
        where: { paidAt: null },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.installment.count({
        where: {
          paidAt: null,
          dueDate: { lt: todayStart },
        },
      }),
      prisma.installment.count({
        where: {
          paidAt: null,
          dueDate: { gte: todayStart, lt: dueSoonEnd },
        },
      }),
      prisma.dailySettlement.findMany({
        where: {
          date: { gte: monthStart, lt: monthEnd },
        },
        select: {
          date: true,
          netTotal: true,
          refundTotal: true,
          cashDiff: true,
          closedAt: true,
        },
      }),
    ]);

  const totalCount = payments.length;
  const totalGross = payments.reduce((sum, payment) => sum + payment.grossAmount, 0);
  const totalNet = payments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const totalDiscount = payments.reduce((sum, payment) => sum + payment.discountAmount, 0);
  const totalRefund = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const averageTicket = totalCount > 0 ? Math.round(totalNet / totalCount) : 0;
  const previousMonthNet = previousMonthPayments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const monthDelta = totalNet - previousMonthNet;

  const methodStats = new Map<
    PaymentMethod,
    { count: number; gross: number; net: number; refunds: number }
  >();
  for (const payment of payments) {
    const current = methodStats.get(payment.method) ?? { count: 0, gross: 0, net: 0, refunds: 0 };
    current.count += 1;
    current.gross += payment.grossAmount;
    current.net += payment.netAmount;
    methodStats.set(payment.method, current);
  }
  for (const refund of refunds) {
    const current = methodStats.get(refund.payment.method) ?? { count: 0, gross: 0, net: 0, refunds: 0 };
    current.refunds += refund.amount;
    methodStats.set(refund.payment.method, current);
  }

  const categoryStats = new Map<
    PaymentCategory,
    { count: number; gross: number; net: number; refunds: number }
  >();
  for (const payment of payments) {
    const current = categoryStats.get(payment.category) ?? { count: 0, gross: 0, net: 0, refunds: 0 };
    current.count += 1;
    current.gross += payment.grossAmount;
    current.net += payment.netAmount;
    categoryStats.set(payment.category, current);
  }
  for (const refund of refunds) {
    const current = categoryStats.get(refund.payment.category) ?? { count: 0, gross: 0, net: 0, refunds: 0 };
    current.refunds += refund.amount;
    categoryStats.set(refund.payment.category, current);
  }

  const trendRows = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 6 + index, 1);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

    const paid = trendPayments
      .filter((payment) => payment.processedAt >= start && payment.processedAt < end)
      .reduce((sum, payment) => sum + payment.netAmount, 0);
    const refunded = trendRefunds
      .filter((refund) => refund.processedAt >= start && refund.processedAt < end)
      .reduce((sum, refund) => sum + refund.amount, 0);

    return {
      label: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`,
      paid,
      refunded,
      net: paid - refunded,
    };
  });

  const maxTrendValue = Math.max(1, ...trendRows.map((row) => row.paid));
  const selectedMonthLabel = `${year}.${String(month).padStart(2, "0")}`;
  const unpaidAmount = unpaidSummary._sum.amount ?? 0;
  const unpaidCount = unpaidSummary._count.id ?? 0;
  const closedDays = settlements.filter((settlement) => settlement.closedAt).length;
  const settlementNetTotal = settlements.reduce((sum, settlement) => sum + settlement.netTotal, 0);
  const settlementRefundTotal = settlements.reduce((sum, settlement) => sum + settlement.refundTotal, 0);
  const settlementCashDiff = settlements.reduce((sum, settlement) => sum + (settlement.cashDiff ?? 0), 0);
  const settlementDelta = totalNet - settlementNetTotal;

  const previousMonthDate = new Date(year, month - 2, 1);
  const nextMonthDate = new Date(year, month, 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        결제 통계
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">결제·청구 통계</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            선택한 월의 실수납, 할인, 환불, 결제수단별 비중을 한 화면에서 봅니다. 아래 운영
            카드에는 현재 미납 잔액과 연체 현황을 함께 붙여서 독촉·정산 화면으로 바로 이어지게
            했습니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`?month=${formatMonthParam(previousMonthDate)}`}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:bg-mist"
          >
            이전 월
          </Link>
          {!isCurrentMonth ? (
            <Link
              href={`?month=${formatMonthParam(now)}`}
              className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm text-ember transition hover:bg-ember/10"
            >
              이번 달
            </Link>
          ) : null}
          {!isCurrentMonth ? (
            <Link
              href={`?month=${formatMonthParam(nextMonthDate)}`}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:bg-mist"
            >
              다음 월
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm text-slate shadow-sm">
        기준 월: <span className="font-semibold text-ink">{formatMonthLabel(year, month)}</span>
        <span className="mx-2 text-ink/20">|</span>
        전월 대비:
        <span className={monthDelta >= 0 ? "ml-2 font-semibold text-forest" : "ml-2 font-semibold text-red-600"}>
          {monthDelta >= 0 ? "+" : ""}
          {formatCompactKRW(monthDelta)}
        </span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-[28px] border border-ember/30 bg-ember/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-ember">월간 실수납</p>
          <p className="mt-2 text-3xl font-semibold text-ember">{formatCompactKRW(totalNet)}</p>
          <p className="mt-1 text-xs text-ember/70">승인·부분환불 결제 기준</p>
        </section>
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">월간 청구 합계</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{formatCompactKRW(totalGross)}</p>
          <p className="mt-1 text-xs text-slate">할인 전 청구 기준</p>
        </section>
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 결제 단가</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{formatCompactKRW(averageTicket)}</p>
          <p className="mt-1 text-xs text-slate">{totalCount.toLocaleString("ko-KR")}건 기준</p>
        </section>
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">월간 할인 합계</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{formatCompactKRW(totalDiscount)}</p>
          <p className="mt-1 text-xs text-slate">쿠폰·포인트 포함</p>
        </section>
        <section className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">월간 환불 합계</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">-{formatCompactKRW(totalRefund)}</p>
          <p className="mt-1 text-xs text-red-500">{refunds.length.toLocaleString("ko-KR")}건 처리</p>
        </section>
        <section className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">환불률</p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {percentage(totalRefund, totalNet + totalRefund).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-forest/70">월간 결제·환불 총합 대비</p>
        </section>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">현재 미납 운영 요약</h2>
              <p className="mt-1 text-xs text-slate">
                선택 월과 무관하게 지금 시점의 미납·연체·임박 건수를 보여줍니다.
              </p>
            </div>
            <Link
              href="/admin/payments/unpaid"
              className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition hover:bg-ember/10"
            >
              미납 화면으로 이동
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-4">
              <p className="text-xs text-slate">미납 잔액</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatCompactKRW(unpaidAmount)}</p>
              <p className="mt-1 text-xs text-slate">{unpaidCount.toLocaleString("ko-KR")}건</p>
            </div>
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-xs text-red-600">연체 건수</p>
              <p className="mt-2 text-2xl font-semibold text-red-700">{overdueCount.toLocaleString("ko-KR")}</p>
              <p className="mt-1 text-xs text-red-500">오늘 이전 납부기한</p>
            </div>
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-xs text-amber-700">7일 이내 도래</p>
              <p className="mt-2 text-2xl font-semibold text-amber-700">{dueSoonCount.toLocaleString("ko-KR")}</p>
              <p className="mt-1 text-xs text-amber-600">독촉 전 확인 대상</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/admin/payments/installments"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              분할 납부 관리
            </Link>
            <Link
              href="/admin/payments/installments/reminders"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              분납 알림
            </Link>
            <Link
              href="/admin/payments/reconciliation"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              정산 대조표
            </Link>
            <Link
              href="/admin/payments/invoices"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              청구서 허브
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">결제 수단 비중</h2>
          <p className="mt-1 text-xs text-slate">실수납 합계 기준으로 정렬했습니다.</p>
          <div className="mt-5 space-y-3">
            {Array.from(methodStats.entries())
              .sort((a, b) => b[1].net - a[1].net)
              .map(([method, stat]) => {
                const share = percentage(stat.net, totalNet);
                return (
                  <div key={method} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-ink">{METHOD_LABEL[method]}</span>
                      <span className="text-slate">
                        {formatCompactKRW(stat.net)} · {share.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-ink/5">
                      <div
                        className="h-full rounded-full bg-forest/70"
                        style={{ width: `${share.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {methodStats.size === 0 ? (
              <p className="py-6 text-sm text-slate">해당 월에는 집계할 결제 내역이 없습니다.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">결제 수단별 상세</h2>
          <p className="mt-1 text-xs text-slate">건수, 청구, 실수납, 환불을 함께 봅니다.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">결제 수단별 월간 통계</caption>
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                  <th className="pb-2 pr-4">결제수단</th>
                  <th className="pb-2 pr-4 text-right">건수</th>
                  <th className="pb-2 pr-4 text-right">청구</th>
                  <th className="pb-2 pr-4 text-right">실수납</th>
                  <th className="pb-2 text-right">환불</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {Array.from(methodStats.entries())
                  .sort((a, b) => b[1].net - a[1].net)
                  .map(([method, stat]) => (
                    <tr key={method}>
                      <td className="py-2.5 pr-4 font-medium text-ink">{METHOD_LABEL[method]}</td>
                      <td className="py-2.5 pr-4 text-right">{stat.count.toLocaleString("ko-KR")}건</td>
                      <td className="py-2.5 pr-4 text-right">{formatKRW(stat.gross)}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-forest">
                        {formatKRW(stat.net)}
                      </td>
                      <td className="py-2.5 text-right text-red-600">
                        {stat.refunds > 0 ? `-${formatKRW(stat.refunds)}` : "-"}
                      </td>
                    </tr>
                  ))}
                {methodStats.size === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate">
                      해당 월에는 집계할 결제 내역이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">결제 항목별 비중</h2>
          <p className="mt-1 text-xs text-slate">PRD의 PaymentCategory 분리 정산 기준입니다.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">결제 항목별 월간 통계</caption>
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                  <th className="pb-2 pr-4">항목</th>
                  <th className="pb-2 pr-4 text-right">건수</th>
                  <th className="pb-2 pr-4 text-right">실수납</th>
                  <th className="pb-2 text-right">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {Array.from(categoryStats.entries())
                  .sort((a, b) => b[1].net - a[1].net)
                  .map(([category, stat]) => {
                    const share = percentage(stat.net, totalNet);
                    return (
                      <tr key={category}>
                        <td className="py-2.5 pr-4 font-medium text-ink">{CATEGORY_LABEL[category]}</td>
                        <td className="py-2.5 pr-4 text-right">{stat.count.toLocaleString("ko-KR")}건</td>
                        <td className="py-2.5 pr-4 text-right">{formatKRW(stat.net)}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/5">
                              <div
                                className="h-full rounded-full bg-ember"
                                style={{ width: `${share.toFixed(1)}%` }}
                              />
                            </div>
                            <span className="w-10 text-xs text-slate">{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {categoryStats.size === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate">
                      해당 월에는 집계할 결제 내역이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">정산 진행도</h2>
              <p className="mt-1 text-xs text-slate">
                선택 월의 일계표 반영 상태와 실수납 대비 정산 차이를 확인합니다.
              </p>
            </div>
            <Link
              href={`/admin/payments/reconciliation?month=${formatMonthParam(monthStart)}`}
              className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              일계표 보기
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-4">
              <p className="text-xs text-slate">마감 일수</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {closedDays.toLocaleString("ko-KR")}일
              </p>
              <p className="mt-1 text-xs text-slate">{settlements.length.toLocaleString("ko-KR")}일계표 집계</p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-4 py-4">
              <p className="text-xs text-slate">정산 반영 합계</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatCompactKRW(settlementNetTotal)}</p>
              <p className="mt-1 text-xs text-slate">일계표 netTotal 기준</p>
            </div>
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-xs text-red-600">정산 반영 환불</p>
              <p className="mt-2 text-2xl font-semibold text-red-700">
                -{formatCompactKRW(settlementRefundTotal)}
              </p>
              <p className="mt-1 text-xs text-red-500">일계표 refundTotal 기준</p>
            </div>
            <div
              className={`rounded-[20px] border px-4 py-4 ${
                settlementDelta === 0
                  ? "border-forest/20 bg-forest/5"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <p className={`text-xs ${settlementDelta === 0 ? "text-forest" : "text-amber-700"}`}>
                실수납 대비 차이
              </p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  settlementDelta === 0 ? "text-forest" : "text-amber-700"
                }`}
              >
                {settlementDelta >= 0 ? "+" : ""}
                {formatCompactKRW(settlementDelta)}
              </p>
              <p className={`mt-1 text-xs ${settlementDelta === 0 ? "text-forest/70" : "text-amber-700"}`}>
                0원이면 결제 통계와 일계표가 일치합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-4 text-sm text-slate">
            현금 실재고 차이 합계:
            <span className={settlementCashDiff === 0 ? "ml-2 font-semibold text-forest" : "ml-2 font-semibold text-red-600"}>
              {settlementCashDiff >= 0 ? "+" : ""}
              {formatKRW(settlementCashDiff)}
            </span>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">최근 6개월 추이</h2>
        <p className="mt-1 text-xs text-slate">월별 실수납과 환불을 같이 보여줍니다.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">최근 6개월 결제 추이</caption>
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">월</th>
                <th className="pb-2 pr-4 text-right">실수납</th>
                <th className="pb-2 pr-4 text-right">환불</th>
                <th className="pb-2 pr-4 text-right">순수납</th>
                <th className="pb-2 text-right">추이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {trendRows.map((row) => {
                const isSelected = row.label === selectedMonthLabel;
                return (
                  <tr key={row.label} className={isSelected ? "bg-ember/5" : ""}>
                    <td className="py-2.5 pr-4 font-medium text-ink">
                      {row.label}
                      {isSelected ? (
                        <span className="ml-2 rounded-full bg-ember/10 px-1.5 py-0.5 text-xs text-ember">
                          선택
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 text-right">{row.paid > 0 ? formatKRW(row.paid) : "-"}</td>
                    <td className="py-2.5 pr-4 text-right text-red-600">
                      {row.refunded > 0 ? `-${formatKRW(row.refunded)}` : "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-forest">
                      {row.paid > 0 ? formatKRW(row.net) : "-"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-forest/70"
                            style={{ width: `${((row.paid / maxTrendValue) * 100).toFixed(1)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
