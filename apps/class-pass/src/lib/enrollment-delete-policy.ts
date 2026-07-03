export type EnrollmentDeletePaymentSnapshot = {
  id: number
  amount: number | null
  method?: string | null
  status?: string | null
}

export type EnrollmentDeleteDecision = {
  canDelete: boolean
  paymentRowCount: number
  positivePaymentCount: number
  zeroAmountPaymentCount: number
}

function normalizePaymentAmount(payment: EnrollmentDeletePaymentSnapshot) {
  const amount = Number(payment.amount)
  return Number.isFinite(amount) ? amount : 0
}

export function getEnrollmentDeleteDecision(
  payments: EnrollmentDeletePaymentSnapshot[],
): EnrollmentDeleteDecision {
  const positivePaymentCount = payments.filter((payment) => normalizePaymentAmount(payment) > 0).length
  const zeroAmountPaymentCount = payments.length - positivePaymentCount

  return {
    canDelete: payments.length === 0,
    paymentRowCount: payments.length,
    positivePaymentCount,
    zeroAmountPaymentCount,
  }
}
