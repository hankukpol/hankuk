import type { EnrollmentPayment, PaymentCategory } from './types'

export type PaymentSummary = {
  gross: number
  refund: number
  net: number
  count: number
  latestPaidAt: string | null
}

type SummaryPayment = Pick<
  EnrollmentPayment,
  'enrollment_id' | 'amount' | 'status' | 'category' | 'paid_at' | 'enrollment_refunds'
>

function createEmptySummary(): PaymentSummary {
  return { gross: 0, refund: 0, net: 0, count: 0, latestPaidAt: null }
}

export function getRefundTotal(payment: Pick<EnrollmentPayment, 'enrollment_refunds'>) {
  return (payment.enrollment_refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0)
}

export function summarizePayments(
  payments: SummaryPayment[],
  options?: { category?: PaymentCategory },
): PaymentSummary {
  return payments.reduce<PaymentSummary>((summary, payment) => {
    if (payment.status === 'voided' || (options?.category && payment.category !== options.category)) {
      return summary
    }

    const refund = getRefundTotal(payment)
    summary.gross += payment.amount
    summary.refund += refund
    summary.net += payment.amount - refund
    summary.count += 1
    if (!summary.latestPaidAt || payment.paid_at > summary.latestPaidAt) {
      summary.latestPaidAt = payment.paid_at
    }

    return summary
  }, createEmptySummary())
}

export function summarizePaymentsByEnrollment(
  payments: SummaryPayment[],
  options?: { category?: PaymentCategory },
) {
  const map = new Map<number, PaymentSummary>()

  for (const payment of payments) {
    if (payment.status === 'voided' || (options?.category && payment.category !== options.category)) {
      continue
    }

    const current = map.get(payment.enrollment_id) ?? createEmptySummary()
    const refund = getRefundTotal(payment)
    current.gross += payment.amount
    current.refund += refund
    current.net += payment.amount - refund
    current.count += 1
    if (!current.latestPaidAt || payment.paid_at > current.latestPaidAt) {
      current.latestPaidAt = payment.paid_at
    }

    map.set(payment.enrollment_id, current)
  }

  return map
}
