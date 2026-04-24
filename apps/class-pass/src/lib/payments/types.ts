import type { Course, Enrollment } from '@/types/database'

export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'point' | 'mixed' | 'other'
export type PaymentStatus = 'paid' | 'partial_refunded' | 'fully_refunded' | 'voided'
export type PaymentCategory = 'tuition' | 'textbook' | 'material' | 'exam_fee' | 'extension' | 'etc'
export type RefundMethod = 'card_cancel' | 'cash' | 'bank_transfer' | 'point' | 'other'
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
  reason: string | null
  refunded_at: string
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
  created_by_staff_id: number | null
  created_at: string
  updated_at: string
  enrollments?: Pick<Enrollment, 'id' | 'name' | 'phone' | 'exam_number' | 'status'> | null
  courses?: Pick<Course, 'id' | 'name'> | null
  enrollment_payment_items?: PaymentItem[]
  enrollment_refunds?: EnrollmentRefund[]
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

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  card_cancel: '카드 취소',
  cash: '현금 환급',
  bank_transfer: '계좌 송금',
  point: '포인트 반환',
  other: '기타',
}

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]
export const PAYMENT_CATEGORIES = Object.keys(PAYMENT_CATEGORY_LABEL) as PaymentCategory[]
export const REFUND_METHODS = Object.keys(REFUND_METHOD_LABEL) as RefundMethod[]
