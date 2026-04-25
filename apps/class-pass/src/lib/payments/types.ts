import type { Course, Enrollment } from '@/types/database'

export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'point' | 'mixed' | 'free' | 'other'
export type WritablePaymentMethod = Exclude<PaymentMethod, 'mixed'>
export type PaymentStatus = 'paid' | 'partial_refunded' | 'fully_refunded' | 'voided'
export type BillingStatus = 'unpaid' | 'partial' | 'paid' | 'exempt' | 'refunded'
export type PaymentCategory = 'tuition' | 'textbook' | 'material' | 'exam_fee' | 'extension' | 'etc'
export type RefundMethod = 'card_cancel' | 'cash' | 'bank_transfer' | 'point' | 'other'
export type RefundReasonCategory =
  | 'withdrawal'
  | 'transfer'
  | 'schedule_change'
  | 'change_of_mind'
  | 'payment_correction'
  | 'policy_application'
  | 'other'
export type PaymentEventType =
  | 'payment_created'
  | 'payment_updated'
  | 'payment_voided'
  | 'refund_created'
  | 'refund_voided'

export type PaymentItem = {
  id: number
  payment_id: number
  label: string
  amount: number
  sort_order: number
}

export type EnrollmentRefund = {
  id: number
  payment_id: number
  amount: number
  method: RefundMethod
  reason_category: RefundReasonCategory
  reason: string | null
  cancel_receipt_no: string | null
  refund_account_last4: string | null
  refunded_at: string
  refund_date: string
  processed_by_staff_id: number | null
  memo: string | null
  created_at: string
}

export type EnrollmentPayment = {
  id: number
  enrollment_id: number
  course_id: number
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  category: PaymentCategory
  paid_at: string
  paid_date: string
  memo: string | null
  card_last4: string | null
  installment_months: number
  bank_name: string | null
  bank_account_last4: string | null
  cash_receipt_approval_no: string | null
  created_by_staff_id: number | null
  created_at: string
  updated_at: string
  enrollments?: Pick<Enrollment, 'id' | 'name' | 'phone' | 'exam_number' | 'status'> | null
  courses?: Pick<Course, 'id' | 'name'> | null
  enrollment_payment_items?: PaymentItem[]
  enrollment_refunds?: EnrollmentRefund[]
}

export type EnrollmentBilling = {
  id: number
  enrollment_id: number
  course_id: number
  expected_amount: number
  discount_amount: number
  discount_reason: string | null
  payable_amount: number
  tuition_exempt: boolean
  tuition_exempt_reason: string | null
  status: BillingStatus
  created_by_staff_id: number | null
  created_at: string
  updated_at: string
}

export type PaymentSettlementRow = {
  paid_date: string
  course_id: number
  course_name: string
  method: PaymentMethod
  category: PaymentCategory
  gross_amount: number
  refund_amount: number
  net_amount: number
  payment_count: number
}

export type PaymentSummary = {
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: '카드',
  cash: '현금',
  bank_transfer: '계좌이체',
  point: '포인트',
  mixed: '복합',
  free: '무료',
  other: '기타',
}

export const PAYMENT_CATEGORY_LABEL: Record<PaymentCategory, string> = {
  tuition: '수강료',
  textbook: '교재비',
  material: '자료비',
  exam_fee: '응시료',
  extension: '연장',
  etc: '기타',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: '결제완료',
  partial_refunded: '부분환불',
  fully_refunded: '전액환불',
  voided: '취소',
}

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  unpaid: '미납',
  partial: '부분납',
  paid: '완납',
  exempt: '면제',
  refunded: '환불',
}

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  card_cancel: '카드 취소',
  cash: '현금 환급',
  bank_transfer: '계좌 송금',
  point: '포인트 반환',
  other: '기타',
}

export const REFUND_REASON_CATEGORY_LABEL: Record<RefundReasonCategory, string> = {
  withdrawal: '수강중단',
  transfer: '강좌 이전',
  schedule_change: '일정 변경',
  change_of_mind: '단순 변심',
  payment_correction: '오결제 정정',
  policy_application: '규정 적용',
  other: '기타',
}

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]
export const WRITABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method !== 'mixed') as WritablePaymentMethod[]
export const PAYMENT_CATEGORIES = Object.keys(PAYMENT_CATEGORY_LABEL) as PaymentCategory[]
export const REFUND_METHODS = Object.keys(REFUND_METHOD_LABEL) as RefundMethod[]
export const REFUND_REASON_CATEGORIES = Object.keys(REFUND_REASON_CATEGORY_LABEL) as RefundReasonCategory[]
