import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  REFUND_METHOD_LABEL,
  type PaymentCategory,
  type PaymentMethod,
  type PaymentStatus,
  type RefundMethod,
} from './types'

export function formatWon(value: number | null | undefined) {
  return `${Math.round(Number(value ?? 0)).toLocaleString('ko-KR')}원`
}

export function formatPaymentDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function paymentMethodLabel(value: PaymentMethod) {
  return PAYMENT_METHOD_LABEL[value] ?? value
}

export function paymentCategoryLabel(value: PaymentCategory) {
  return PAYMENT_CATEGORY_LABEL[value] ?? value
}

export function paymentStatusLabel(value: PaymentStatus) {
  return PAYMENT_STATUS_LABEL[value] ?? value
}

export function refundMethodLabel(value: RefundMethod) {
  return REFUND_METHOD_LABEL[value] ?? value
}
