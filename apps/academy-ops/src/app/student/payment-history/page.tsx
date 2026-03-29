import Link from "next/link";
import {
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

// ─── Label maps ───────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리 중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "검토 중",
  APPROVED: "승인",
  REJECTED: "거절",
  COMPLETED: "환불 완료",
  CANCELLED: "취소",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPaymentHistory(examNumber: string) {
  const payments = await getPrisma().payment.findMany({
    where: { examNumber },
    orderBy: [{ processedAt: "desc" }],
    include: {
      items: {
        select: {
          id: true,
          itemName: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
      },
      installments: {
        orderBy: [{ seq: "asc" }],
        select: {
          id: true,
          seq: true,
          amount: true,
          dueDate: true,
          paidAt: true,
        },
      },
      refunds: {
        orderBy: [{ processedAt: "desc" }],
        select: {
          id: true,
          amount: true,
          reason: true,
          status: true,
          processedAt: true,
        },
      },
    },
  });

  return payments;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPaymentHistoryPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Payment History Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              납부 이력은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 납부 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              납부 이력
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              납부 이력은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 전체 납부 및 환불 이력을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/payment-history" />
        </div>
      </main>
    );
  }

  const payments = await fetchPaymentHistory(viewer.examNumber);

  // ── KPI 계산 ─────────────────────────────────────────────────────────────────
  const approvedPayments = payments.filter(
    (p) =>
      p.status === PaymentStatus.APPROVED ||
      p.status === PaymentStatus.PARTIAL_REFUNDED ||
      p.status === PaymentStatus.FULLY_REFUNDED,
  );

  const totalPaid = approvedPayments.reduce((sum, p) => sum + p.grossAmount, 0);

  const totalRefunded = payments.flatMap((p) => p.refunds).reduce((sum, r) => {
    if (r.status === RefundStatus.COMPLETED || r.status === RefundStatus.APPROVED) {
      return sum + r.amount;
    }
    return sum;
  }, 0);

  const netPaid = totalPaid - totalRefunded;

  const unpaidInstallments = payments.flatMap((p) =>
    p.installments.filter((inst) => inst.paidAt === null),
  );
  const outstandingTotal = unpaidInstallments.reduce(
    (sum, inst) => sum + inst.amount,
    0,
  );

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Header ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Payment History
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {viewer.name}의 납부 이력
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                수강료 납부 및 환불 전체 내역을 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
              <Link
                href="/student/enrollment"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                수강 정보 보기
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 납부액</p>
              <p className="mt-3 text-2xl font-bold text-forest">
                {formatAmount(totalPaid)}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 환불액</p>
              <p
                className={`mt-3 text-2xl font-bold ${totalRefunded > 0 ? "text-red-600" : "text-slate"}`}
              >
                {totalRefunded > 0 ? `- ${formatAmount(totalRefunded)}` : formatAmount(0)}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">순 납부액</p>
              <p className="mt-3 text-2xl font-bold text-ember">
                {formatAmount(netPaid)}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">미납 잔액</p>
              <p
                className={`mt-3 text-2xl font-bold ${outstandingTotal > 0 ? "text-amber-600" : "text-forest"}`}
              >
                {formatAmount(outstandingTotal)}
              </p>
            </article>
          </div>
        </section>

        {/* ── Payment list ── */}
        {payments.length === 0 ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold">납부 내역</h2>
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              납부 내역이 없습니다.
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">납부 내역</h2>
                <p className="mt-2 text-sm leading-7 text-slate">
                  전체 {payments.length}건의 수납 기록입니다.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {payments.map((payment) => (
                <article
                  key={payment.id}
                  className="rounded-[24px] border border-ink/10 p-5"
                >
                  {/* Payment header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                          {formatDateWithWeekday(payment.processedAt)}
                        </span>
                        <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                          {PAYMENT_METHOD_LABEL[payment.method]}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                        >
                          {PAYMENT_STATUS_LABEL[payment.status]}
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-bold">
                        {formatAmount(payment.netAmount)}
                      </p>
                      {payment.grossAmount !== payment.netAmount && (
                        <p className="mt-1 text-sm text-slate">
                          정가: {formatAmount(payment.grossAmount)}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/student/payments/${payment.id}`}
                      className="shrink-0 inline-flex items-center rounded-xl border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/20"
                    >
                      영수증 보기 →
                    </Link>
                  </div>

                  {/* Payment items */}
                  {payment.items.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">항목</th>
                            <th className="px-4 py-3 font-semibold">단가</th>
                            <th className="px-4 py-3 font-semibold">수량</th>
                            <th className="px-4 py-3 font-semibold">금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {payment.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3">{item.itemName}</td>
                              <td className="px-4 py-3">{formatAmount(item.unitPrice)}</td>
                              <td className="px-4 py-3">{item.quantity}</td>
                              <td className="px-4 py-3 font-semibold">
                                {formatAmount(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Discount/coupon/point summary */}
                  {(payment.discountAmount > 0 ||
                    payment.couponAmount > 0 ||
                    payment.pointAmount > 0) && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {payment.discountAmount > 0 && (
                        <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">할인</div>
                          <div className="mt-2 font-semibold text-ember">
                            - {formatAmount(payment.discountAmount)}
                          </div>
                        </div>
                      )}
                      {payment.couponAmount > 0 && (
                        <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">쿠폰</div>
                          <div className="mt-2 font-semibold text-ember">
                            - {formatAmount(payment.couponAmount)}
                          </div>
                        </div>
                      )}
                      {payment.pointAmount > 0 && (
                        <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">포인트</div>
                          <div className="mt-2 font-semibold text-ember">
                            - {formatAmount(payment.pointAmount)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Installments */}
                  {payment.installments.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-semibold text-slate">분할 납부 일정</p>
                      <div className="overflow-x-auto rounded-[20px] border border-ink/10">
                        <table className="min-w-full divide-y divide-ink/10 text-sm">
                          <thead className="bg-mist/80 text-left">
                            <tr>
                              <th className="px-4 py-3 font-semibold">회차</th>
                              <th className="px-4 py-3 font-semibold">납부 예정일</th>
                              <th className="px-4 py-3 font-semibold">금액</th>
                              <th className="px-4 py-3 font-semibold">상태</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink/10">
                            {payment.installments.map((inst) => (
                              <tr key={inst.id}>
                                <td className="px-4 py-3 font-medium">{inst.seq}회</td>
                                <td className="px-4 py-3">
                                  {inst.dueDate
                                    ? formatDateWithWeekday(inst.dueDate)
                                    : "-"}
                                </td>
                                <td className="px-4 py-3 font-semibold">
                                  {formatAmount(inst.amount)}
                                </td>
                                <td className="px-4 py-3">
                                  {inst.paidAt ? (
                                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-1 text-xs font-semibold text-forest">
                                      납부 완료 · {formatDate(inst.paidAt)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                      미납
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Refunds */}
                  {payment.refunds.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-slate">환불 내역</p>
                      {payment.refunds.map((refund) => (
                        <div
                          key={refund.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-red-100 bg-red-50/50 px-4 py-3 text-sm"
                        >
                          <div>
                            <span className="font-semibold text-red-700">
                              - {formatAmount(refund.amount)}
                            </span>
                            {refund.reason && (
                              <span className="ml-3 text-slate">{refund.reason}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex rounded-full border border-red-200 bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                              {REFUND_STATUS_LABEL[refund.status]}
                            </span>
                            {refund.processedAt && (
                              <span className="text-xs text-slate">
                                {formatDateWithWeekday(refund.processedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {payment.note && (
                    <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-3 text-sm leading-7 text-slate">
                      메모: {payment.note}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── 미납 분납 요약 ── */}
        {unpaidInstallments.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold">미납 분할 납부</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              아직 납부되지 않은 분납 회차 목록입니다.
            </p>
            <div className="mt-5 overflow-hidden rounded-[24px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">회차</th>
                    <th className="px-4 py-3 font-semibold">납부 예정일</th>
                    <th className="px-4 py-3 font-semibold">금액</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {unpaidInstallments.map((inst) => (
                    <tr key={inst.id}>
                      <td className="px-4 py-3 font-medium">{inst.seq}회차</td>
                      <td className="px-4 py-3">
                        {inst.dueDate ? formatDateWithWeekday(inst.dueDate) : "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatAmount(inst.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          미납
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
