import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyCourseOwnership } from '@/lib/class-pass-data'
import {
  ensureStudentProfile,
  findMatchingStudentProfile,
  getStudentAuthProfile,
  initializeStudentAuth,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeName, normalizePhone } from '@/lib/utils'
import type { Enrollment, Student } from '@/types/database'
import {
  PAYMENT_CATEGORY_LABEL,
  type BillingStatus,
  type EnrollmentBilling,
  type EnrollmentPayment,
  type EnrollmentRefund,
  type PaymentCategory,
  type PaymentEventType,
  type PaymentMethod,
  type PaymentStatus,
  type RefundMethod,
  type RefundReasonCategory,
} from './types'

type ServerClient = ReturnType<typeof createServerClient>

export type PaymentItemInput = {
  label: string
  amount: number
}

export type CreatePaymentInput = {
  enrollmentId: number
  courseId?: number
  amount: number
  method: PaymentMethod
  category?: PaymentCategory
  paidAt?: string | null
  memo?: string | null
  cardLast4?: string | null
  installmentMonths?: number | null
  bankName?: string | null
  bankAccountLast4?: string | null
  cashReceiptApprovalNo?: string | null
  items?: PaymentItemInput[]
  skipBillingValidation?: boolean
  requireBillingForTuition?: boolean
}

export type UpsertEnrollmentBillingInput = {
  enrollmentId: number
  courseId: number
  expectedAmount: number
  discountAmount?: number | null
  discountReason?: string | null
  payableAmount?: number | null
  tuitionExempt?: boolean | null
  tuitionExemptReason?: string | null
}

export type CreatePaymentBundleInput = {
  enrollmentId: number
  courseId?: number
  billing?: Omit<UpsertEnrollmentBillingInput, 'enrollmentId' | 'courseId'> | null
  payments: Array<Omit<CreatePaymentInput, 'enrollmentId' | 'courseId' | 'skipBillingValidation' | 'requireBillingForTuition'>>
}

export type CreateEnrollmentForPaymentInput = {
  courseId: number
  name: string
  phone: string
  examNumber?: string | null
  birthDate?: string | null
  customData?: Record<string, string>
}

export type UpdatePaymentInput = Partial<Omit<CreatePaymentInput, 'enrollmentId' | 'courseId'>>

export type CreateRefundInput = {
  amount: number
  method: RefundMethod
  reasonCategory?: RefundReasonCategory | null
  reason?: string | null
  cancelReceiptNo?: string | null
  refundAccountLast4?: string | null
  refundedAt?: string | null
  memo?: string | null
}

export type CreateRefundBundleInput = {
  refunds: Array<CreateRefundInput & { paymentId: number }>
}

export type ListPaymentsOptions = {
  courseId?: number | null
  enrollmentId?: number | null
  from?: string | null
  to?: string | null
  method?: PaymentMethod | null
  status?: PaymentStatus | null
  limit?: number
}

const PAYMENT_SELECT = `
  *,
  enrollments(id,name,phone,exam_number,status),
  courses!inner(id,name,division),
  enrollment_payment_items(*),
  enrollment_refunds(*)
`

export const PAYMENT_SCHEMA_MISSING_MESSAGE =
  '?�납·?�산 ?�이블이 ?�직 DB???�용?��? ?�았?�니?? 로컬 Supabase?�서 supabase db reset???�행??Phase 1 migration??반영??주세??'

const PAYMENT_SCHEMA_OBJECTS = [
  'enrollment_billing',
  'enrollment_payments',
  'enrollment_payment_items',
  'enrollment_refunds',
  'payment_events',
  'get_payment_settlement',
  'create_payment_bundle_atomic',
  'refund_date',
  'reason_category',
  'cancel_receipt_no',
  'refund_account_last4',
]

function createPaymentError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function getPaymentErrorField(error: unknown, field: string) {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return ''
  }

  const value = (error as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

function getPaymentErrorText(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return [
    getPaymentErrorField(error, 'code'),
    getPaymentErrorField(error, 'message'),
    getPaymentErrorField(error, 'details'),
    getPaymentErrorField(error, 'hint'),
  ].filter(Boolean).join(' ')
}

export function isPaymentSchemaMissing(error: unknown) {
  const code = getPaymentErrorField(error, 'code')
  const text = getPaymentErrorText(error).toLowerCase()
  const referencesPaymentObject = PAYMENT_SCHEMA_OBJECTS.some((objectName) => text.includes(objectName))

  if (referencesPaymentObject && (
    code === 'PGRST202'
    || code === 'PGRST205'
    || code === '42P01'
    || code === '42883'
  )) {
    return true
  }

  return referencesPaymentObject && (
    text.includes('could not find')
    || text.includes('schema cache')
    || text.includes('does not exist')
    || text.includes('undefined_table')
    || text.includes('undefined function')
  )
}

export function createPaymentSchemaMissingError() {
  return createPaymentError(PAYMENT_SCHEMA_MISSING_MESSAGE, 503)
}

function toPositiveInteger(value: number, fieldLabel: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw createPaymentError(`${fieldLabel}?� 0?�보?????�수?�야 ?�니??`)
  }

  return value
}

function toNonNegativeInteger(value: number, fieldLabel: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw createPaymentError(`${fieldLabel}?� 0???�상 ?�수?�야 ?�니??`)
  }

  return value
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeLast4(value: string | null | undefined, fieldLabel: string) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  if (!/^\d{4}$/.test(normalized)) {
    throw createPaymentError(`${fieldLabel}???�자 4?�리?�야 ?�니??`)
  }

  return normalized
}

function normalizeRefundReasonCategory(value: RefundReasonCategory | null | undefined): RefundReasonCategory {
  return value ?? 'other'
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  const trimmed = value.trim()
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00+09:00`)
    : new Date(trimmed)

  if (Number.isNaN(parsed.getTime())) {
    throw createPaymentError('?�자�??�확???�력??주세??')
  }

  return parsed.toISOString()
}

function normalizePaymentItems(
  amount: number,
  category: PaymentCategory,
  items: PaymentItemInput[] | null | undefined,
) {
  const rawItems = Array.isArray(items) && items.length > 0
    ? items
    : [{ label: PAYMENT_CATEGORY_LABEL[category], amount }]

  const normalized = rawItems.map((item, index) => ({
    label: normalizeOptionalText(item.label) ?? PAYMENT_CATEGORY_LABEL[category],
    amount: amount === 0
      ? toNonNegativeInteger(Number(item.amount), `${index + 1}번째 결제 ??�� 금액`)
      : toPositiveInteger(Number(item.amount), `${index + 1}번째 결제 ??�� 금액`),
    sort_order: index,
  }))

  const itemTotal = normalized.reduce((sum, item) => sum + item.amount, 0)
  if (itemTotal !== amount) {
    throw createPaymentError('결제 ??�� ?�계가 결제 금액�??�치?�야 ?�니??')
  }

  return normalized
}

function getRefundTotal(payment: Pick<EnrollmentPayment, 'enrollment_refunds'>) {
  return (payment.enrollment_refunds ?? []).reduce((sum, refund) => sum + Number(refund.amount), 0)
}

function normalizeBillingInput(input: UpsertEnrollmentBillingInput) {
  const expectedAmount = toNonNegativeInteger(Number(input.expectedAmount), '강좌 ?��?')
  const discountAmount = toNonNegativeInteger(Number(input.discountAmount ?? 0), '?�인 금액')
  const tuitionExempt = Boolean(input.tuitionExempt)
  const discountReason = normalizeOptionalText(input.discountReason)

  if (discountAmount > expectedAmount) {
    throw createPaymentError('?�인 금액?� 강좌 ?��?보다 ?????�습?�다.')
  }

  if (!tuitionExempt && expectedAmount <= 0) {
    throw createPaymentError('?�료 ?�강?� 강좌 ?��?�?1???�상 ?�력?�야 ?�니??')
  }

  if (!tuitionExempt && discountAmount > 0 && !discountReason) {
    throw createPaymentError('?�인 금액???�력??경우 ?�인 ?�유가 ?�요?�니??')
  }

  const calculatedPayableAmount = Math.max(expectedAmount - discountAmount, 0)
  const payableAmount = input.payableAmount === undefined || input.payableAmount === null
    ? tuitionExempt ? 0 : calculatedPayableAmount
    : toNonNegativeInteger(Number(input.payableAmount), '?�용 금액')

  if (!tuitionExempt && payableAmount !== calculatedPayableAmount) {
    throw createPaymentError('?�용 금액?� 강좌 ?��??�서 ?�인 금액??뺀 금액�?같아???�니??')
  }

  if (!tuitionExempt && payableAmount <= 0) {
    throw createPaymentError('?�용 금액??0?�이�?무료 ?�강 ?�는 ?�납 면제�?기록??주세??')
  }

  const tuitionExemptReason = normalizeOptionalText(input.tuitionExemptReason)
  if (tuitionExempt && !tuitionExemptReason) {
    throw createPaymentError('무료 ?�강 ?�는 ?�납 면제 ?�유�??�력??주세??')
  }

  return {
    expectedAmount,
    discountAmount,
    discountReason,
    payableAmount: tuitionExempt ? 0 : payableAmount,
    tuitionExempt,
    tuitionExemptReason,
  }
}

function getBillingStatus(
  billing: Pick<EnrollmentBilling, 'payable_amount' | 'tuition_exempt'>,
  netAmount: number,
  paymentCount: number,
  options?: { allowRefundStatus?: boolean },
): BillingStatus {
  if (billing.tuition_exempt) {
    return 'exempt'
  }

  if (options?.allowRefundStatus && paymentCount > 0 && netAmount <= 0) {
    return 'refunded'
  }

  if (billing.payable_amount <= 0) {
    return 'paid'
  }

  if (netAmount <= 0) {
    return 'unpaid'
  }

  return netAmount >= billing.payable_amount ? 'paid' : 'partial'
}

async function recalculateEnrollmentBillingStatus(
  db: ServerClient,
  enrollmentId: number,
  netAmount: number,
  paymentCount: number,
  options?: { allowRefundStatus?: boolean },
) {
  const { data, error } = await db
    .from('enrollment_billing')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const billing = data as EnrollmentBilling | null
  if (!billing) {
    return null
  }

  const nextStatus = getBillingStatus(billing, netAmount, paymentCount, options)
  if (nextStatus === billing.status) {
    return billing
  }

  const { data: updated, error: updateError } = await db
    .from('enrollment_billing')
    .update({ status: nextStatus })
    .eq('id', billing.id)
    .select('*')
    .single()

  if (updateError) {
    throw updateError
  }

  return updated as EnrollmentBilling
}

async function loadEnrollmentBilling(db: ServerClient, enrollmentId: number) {
  const { data, error } = await db
    .from('enrollment_billing')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as EnrollmentBilling | null
}

async function getEnrollmentNetAmount(
  db: ServerClient,
  enrollmentId: number,
  category?: PaymentCategory,
) {
  let query = db
    .from('enrollment_payments')
    .select('amount,status,enrollment_refunds(amount)')
    .eq('enrollment_id', enrollmentId)
    .neq('status', 'voided')

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return ((data ?? []) as Array<Pick<EnrollmentPayment, 'amount' | 'status' | 'enrollment_refunds'>>)
    .reduce((sum, payment) => sum + payment.amount - getRefundTotal(payment), 0)
}

function getPaymentCategory(input: Pick<CreatePaymentInput, 'category'>) {
  return input.category ?? 'tuition'
}

function sumPaymentAmountByCategory(
  payments: Array<Pick<CreatePaymentInput, 'amount' | 'category'>>,
  category: PaymentCategory,
) {
  return payments.reduce((sum, payment) => (
    getPaymentCategory(payment) === category ? sum + Number(payment.amount) : sum
  ), 0)
}

async function validateStandaloneBillingPayment(params: {
  db: ServerClient
  enrollmentId: number
  category: PaymentCategory
  amount: number
  requireBillingForTuition?: boolean
}) {
  if (params.category !== 'tuition') {
    return
  }

  const billing = await loadEnrollmentBilling(params.db, params.enrollmentId)
  if (!billing) {
    if (params.requireBillingForTuition) {
      throw createPaymentError('?�강�?결제??�?�� ?�보?� ?�께 ?�?�해???�니??')
    }
    return
  }

  if (billing.tuition_exempt) {
    throw createPaymentError('?��? 무료 ?�강 ?�는 ?�납 면제�?기록???�강?�입?�다.')
  }

  const existingTuitionNetAmount = await getEnrollmentNetAmount(params.db, params.enrollmentId, 'tuition')
  const remainingAmount = Math.max(billing.payable_amount - existingTuitionNetAmount, 0)
  if (params.amount !== remainingAmount) {
    throw createPaymentError('?�강�?결제 금액?� ?��? ?�용 금액�??�치?�야 ?�니??')
  }
}

async function recordPaymentEvent(
  db: ServerClient,
  input: {
    paymentId: number | null
    enrollmentId: number | null
    eventType: PaymentEventType
    actorStaffId?: number | null
    beforeJson?: unknown
    afterJson?: unknown
  },
) {
  const { error } = await db
    .from('payment_events')
    .insert({
      payment_id: input.paymentId,
      enrollment_id: input.enrollmentId,
      event_type: input.eventType,
      actor_staff_id: input.actorStaffId ?? null,
      before_json: input.beforeJson ?? null,
      after_json: input.afterJson ?? null,
    })

  if (error) {
    throw error
  }
}

async function loadPaymentById(db: ServerClient, paymentId: number, division: string) {
  const { data, error } = await db
    .from('enrollment_payments')
    .select(PAYMENT_SELECT)
    .eq('id', paymentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as EnrollmentPayment | null
}

async function getEnrollmentForPayment(
  db: ServerClient,
  enrollmentId: number,
  division: string,
) {
  const { data, error } = await db
    .from('enrollments')
    .select('*,courses!inner(id,name,division)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw createPaymentError('?�강?�을 찾을 ???�습?�다.', 404)
  }

  const { courses, ...enrollment } = data as Enrollment & { courses?: unknown }
  void courses
  return enrollment as Enrollment
}

async function createPaymentItems(db: ServerClient, paymentId: number, items: ReturnType<typeof normalizePaymentItems>) {
  const { error } = await db
    .from('enrollment_payment_items')
    .insert(items.map((item) => ({
      payment_id: paymentId,
      label: item.label,
      amount: item.amount,
      sort_order: item.sort_order,
    })))

  if (error) {
    throw error
  }
}

async function recalculateEnrollmentPaymentState(
  db: ServerClient,
  enrollmentId: number,
  options?: { allowRefundStatus?: boolean },
) {
  const { data, error } = await db
    .from('enrollment_payments')
    .select('id,amount,status,category,enrollment_refunds(amount)')
    .eq('enrollment_id', enrollmentId)
    .neq('status', 'voided')

  if (error) {
    throw error
  }

  const payments = (data ?? []) as Array<Pick<EnrollmentPayment, 'id' | 'amount' | 'status' | 'category' | 'enrollment_refunds'>>
  const tuitionPayments = payments.filter((payment) => payment.category === 'tuition')
  const tuitionNetAmount = tuitionPayments.reduce((sum, payment) => (
    sum + payment.amount - getRefundTotal(payment)
  ), 0)

  if (options?.allowRefundStatus && tuitionPayments.length > 0 && tuitionNetAmount <= 0) {
    await recalculateEnrollmentBillingStatus(db, enrollmentId, tuitionNetAmount, tuitionPayments.length, {
      allowRefundStatus: true,
    })

    const { error: updateError } = await db
      .from('enrollments')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId)

    if (updateError) {
      throw updateError
    }
    return
  }

  await recalculateEnrollmentBillingStatus(db, enrollmentId, tuitionNetAmount, tuitionPayments.length)

  const { data: enrollment, error: enrollmentError } = await db
    .from('enrollments')
    .select('status')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (enrollmentError) {
    throw enrollmentError
  }

  if (enrollment?.status === 'refunded' && tuitionNetAmount > 0) {
    const { error: updateError } = await db
      .from('enrollments')
      .update({
        status: 'active',
        refunded_at: null,
      })
      .eq('id', enrollmentId)

    if (updateError) {
      throw updateError
    }
  }
}

async function recalculatePaymentStatus(
  db: ServerClient,
  paymentId: number,
  division: string,
  options?: { allowEnrollmentRefundStatus?: boolean },
) {
  const payment = await loadPaymentById(db, paymentId, division)
  if (!payment) {
    throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
  }

  if (payment.status === 'voided') {
    await recalculateEnrollmentPaymentState(db, payment.enrollment_id)
    return payment
  }

  const refundTotal = getRefundTotal(payment)
  const nextStatus: PaymentStatus = refundTotal <= 0
    ? 'paid'
    : refundTotal >= payment.amount
      ? 'fully_refunded'
      : 'partial_refunded'

  if (nextStatus !== payment.status) {
    const { error } = await db
      .from('enrollment_payments')
      .update({ status: nextStatus })
      .eq('id', paymentId)

    if (error) {
      throw error
    }
  }

  await recalculateEnrollmentPaymentState(db, payment.enrollment_id, {
    allowRefundStatus: options?.allowEnrollmentRefundStatus,
  })

  return (await loadPaymentById(db, paymentId, division)) ?? payment
}

export async function createEnrollmentForPayment(
  input: CreateEnrollmentForPaymentInput,
  division: string,
) {
  const db = createServerClient()

  if (!(await verifyCourseOwnership(input.courseId, division))) {
    throw createPaymentError('강좌�?찾을 ???�습?�다.', 404)
  }

  const matchedStudent = await findMatchingStudentProfile(db, {
    division,
    name: input.name,
    phone: input.phone,
    exam_number: input.examNumber,
  })

  if (matchedStudent) {
    const { data: existingByStudent, error: existingError } = await db
      .from('enrollments')
      .select('id')
      .eq('course_id', input.courseId)
      .eq('student_id', matchedStudent.id)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existingByStudent) {
      throw createPaymentError('같�? 강좌???�일???�생???��? ?�록?�어 ?�습?�다.', 409)
    }
  }

  const studentResult = await ensureStudentProfile(db, {
    division,
    currentStudentId: matchedStudent?.id ?? null,
    name: input.name,
    phone: input.phone,
    exam_number: input.examNumber,
  })

  if (studentResult.changed || studentResult.created) {
    await syncStudentEnrollmentSnapshots(db, studentResult.student)
  }

  const authSetup = await initializeStudentAuth(
    db,
    studentResult.student,
    input.birthDate || null,
  )

  const student = authSetup.student
  const { data, error } = await db
    .from('enrollments')
    .insert({
      course_id: input.courseId,
      student_id: student.id,
      name: student.name,
      phone: student.phone,
      exam_number: student.exam_number,
      custom_data: input.customData ?? {},
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createPaymentError('같�? 강좌???�일???�름/?�락�??�강?�이 ?��? 존재?�니??', 409)
    }

    throw error
  }

  await invalidateCache('enrollments')
  return {
    enrollment: {
      ...(data as Enrollment),
      student_profile: getStudentAuthProfile(student),
    },
    generatedPin: authSetup.generatedPin ?? null,
  }
}

export async function upsertEnrollmentBilling(
  input: UpsertEnrollmentBillingInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const enrollment = await getEnrollmentForPayment(db, input.enrollmentId, division)

  if (input.courseId !== enrollment.course_id) {
    throw createPaymentError('�?�� 강좌?� ?�강?�의 강좌가 ?�치?��? ?�습?�다.')
  }

  const normalized = normalizeBillingInput(input)
  const initialStatus: BillingStatus = normalized.tuitionExempt
    ? 'exempt'
    : normalized.payableAmount <= 0
      ? 'paid'
      : 'unpaid'

  const { data, error } = await db
    .from('enrollment_billing')
    .upsert({
      enrollment_id: enrollment.id,
      course_id: enrollment.course_id,
      expected_amount: normalized.expectedAmount,
      discount_amount: normalized.discountAmount,
      discount_reason: normalized.discountReason,
      payable_amount: normalized.payableAmount,
      tuition_exempt: normalized.tuitionExempt,
      tuition_exempt_reason: normalized.tuitionExemptReason,
      status: initialStatus,
      created_by_staff_id: actorStaffId ?? null,
    }, { onConflict: 'enrollment_id' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await recalculateEnrollmentPaymentState(db, enrollment.id)
  await invalidateCache('enrollments')

  return data as EnrollmentBilling
}

export async function createPayment(
  input: CreatePaymentInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const enrollment = await getEnrollmentForPayment(db, input.enrollmentId, division)
  const courseId = input.courseId ?? enrollment.course_id

  if (courseId !== enrollment.course_id) {
    throw createPaymentError('결제 강좌?� ?�강??강좌가 ?�치?��? ?�습?�다.')
  }

  if (input.method === 'mixed') {
    throw createPaymentError('Mixed payment must be split by payment method.')
  }

  const amount = input.method === 'free'
    ? toNonNegativeInteger(Number(input.amount), '결제 금액')
    : toPositiveInteger(Number(input.amount), '결제 금액')
  if (input.method === 'free' && amount !== 0) {
    throw createPaymentError('무료 ?�강?� 결제 금액??0?�이?�야 ?�니??')
  }
  const category = input.category ?? 'tuition'
  const normalizedItems = normalizePaymentItems(amount, category, input.items)
  const paidAt = normalizeTimestamp(input.paidAt)

  if (!input.skipBillingValidation) {
    await validateStandaloneBillingPayment({
      db,
      enrollmentId: enrollment.id,
      category,
      amount,
      requireBillingForTuition: input.requireBillingForTuition,
    })
  }

  const { data, error } = await db
    .from('enrollment_payments')
    .insert({
      enrollment_id: enrollment.id,
      course_id: courseId,
      amount,
      method: input.method,
      category,
      paid_at: paidAt,
      memo: normalizeOptionalText(input.memo),
      card_last4: normalizeLast4(input.cardLast4, '카드 마�?�?번호'),
      installment_months: Math.max(0, Number(input.installmentMonths ?? 0) || 0),
      bank_name: normalizeOptionalText(input.bankName),
      bank_account_last4: normalizeLast4(input.bankAccountLast4, '계좌 마�?�?번호'),
      cash_receipt_approval_no: normalizeOptionalText(input.cashReceiptApprovalNo),
      created_by_staff_id: actorStaffId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  const paymentId = Number(data.id)
  try {
    await createPaymentItems(db, paymentId, normalizedItems)
    await recordPaymentEvent(db, {
      paymentId,
      enrollmentId: enrollment.id,
      eventType: 'payment_created',
      actorStaffId,
      afterJson: { ...data, items: normalizedItems },
    })
    await recalculateEnrollmentPaymentState(db, enrollment.id)
  } catch (reason) {
    await db.from('enrollment_payments').delete().eq('id', paymentId)
    throw reason
  }

  await invalidateCache('enrollments')
  return loadPaymentById(db, paymentId, division)
}

export async function createPaymentBundle(
  input: CreatePaymentBundleInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const enrollment = await getEnrollmentForPayment(db, input.enrollmentId, division)
  const courseId = input.courseId ?? enrollment.course_id

  if (courseId !== enrollment.course_id) {
    throw createPaymentError('결제 강좌?� ?�강??강좌가 ?�치?��? ?�습?�다.')
  }

  if (input.payments.length === 0) {
    throw createPaymentError('?�?�할 결제 ?�단???�습?�다.')
  }

  const normalizedPayments = input.payments.map((payment, index) => {
    if (payment.method === 'mixed') {
      throw createPaymentError('복합 결제???�제 ?�단�?결제 2건으�??�?�해???�니??')
    }

    const amount = payment.method === 'free'
      ? toNonNegativeInteger(Number(payment.amount), `${index + 1}번째 결제 금액`)
      : toPositiveInteger(Number(payment.amount), `${index + 1}번째 결제 금액`)
    if (payment.method === 'free' && amount !== 0) {
      throw createPaymentError('무료 ?�강?� 결제 금액??0?�이?�야 ?�니??')
    }

    const category = payment.category ?? 'tuition'
    const items = normalizePaymentItems(amount, category, payment.items)

    return {
      amount,
      method: payment.method,
      category,
      paidAt: normalizeTimestamp(payment.paidAt),
      memo: normalizeOptionalText(payment.memo),
      cardLast4: normalizeLast4(payment.cardLast4, 'card last4'),
      installmentMonths: Math.max(0, Number(payment.installmentMonths ?? 0) || 0),
      bankName: normalizeOptionalText(payment.bankName),
      bankAccountLast4: normalizeLast4(payment.bankAccountLast4, 'bank account last4'),
      cashReceiptApprovalNo: normalizeOptionalText(payment.cashReceiptApprovalNo),
      items,
    }
  })

  const beforeBilling = await loadEnrollmentBilling(db, enrollment.id)
  const existingTuitionNetAmount = await getEnrollmentNetAmount(db, enrollment.id, 'tuition')
  const tuitionPaymentTotal = sumPaymentAmountByCategory(normalizedPayments, 'tuition')
  let normalizedBilling: ReturnType<typeof normalizeBillingInput> | null = null

  if (input.billing) {
    normalizedBilling = normalizeBillingInput({
      enrollmentId: enrollment.id,
      courseId,
      ...input.billing,
    })

    if (normalizedBilling.tuitionExempt) {
      if (beforeBilling?.tuition_exempt) {
        throw createPaymentError('?��? 무료 ?�강 ?�는 ?�납 면제�?기록???�강?�입?�다.')
      }

      if (existingTuitionNetAmount > 0) {
        throw createPaymentError('?��? ?�납 ?�역???�는 ?�강?��? 무료 ?�강?�로 변경할 ???�습?�다.')
      }

      const invalidFreePayment = input.payments.some((payment) => payment.method !== 'free' || Number(payment.amount) !== 0)
      if (invalidFreePayment) {
        throw createPaymentError('무료 ?�강 결제 기록?� 금액 0?�과 무료 ?�단?�로�??�?�할 ???�습?�다.')
      }
    } else {
      const remainingAmount = Math.max(normalizedBilling.payableAmount - existingTuitionNetAmount, 0)
      if (tuitionPaymentTotal !== remainingAmount) {
        throw createPaymentError('결제 ?�단�??�납 ?�계가 ?��? ?�용 금액�??�치?�야 ?�니??')
      }
    }
  } else if (beforeBilling && !beforeBilling.tuition_exempt) {
    const remainingAmount = Math.max(beforeBilling.payable_amount - existingTuitionNetAmount, 0)
    if (tuitionPaymentTotal > 0 && tuitionPaymentTotal !== remainingAmount) {
      throw createPaymentError('결제 ?�단�??�납 ?�계가 ?��? ?�용 금액�??�치?�야 ?�니??')
    }
  } else if (beforeBilling?.tuition_exempt && tuitionPaymentTotal > 0) {
    throw createPaymentError('?��? 무료 ?�강 ?�는 ?�납 면제�?기록???�강?�입?�다.')
  } else if (!beforeBilling && tuitionPaymentTotal > 0) {
    throw createPaymentError('?�강�?결제??�?�� ?�보?� ?�께 ?�?�해???�니??')
  }

  const initialBillingStatus: BillingStatus | null = normalizedBilling
    ? normalizedBilling.tuitionExempt
      ? 'exempt'
      : existingTuitionNetAmount + tuitionPaymentTotal >= normalizedBilling.payableAmount
        ? 'paid'
        : existingTuitionNetAmount + tuitionPaymentTotal > 0
          ? 'partial'
          : 'unpaid'
    : null

  const { data: rpcRows, error: rpcError } = await db.rpc('create_payment_bundle_atomic', {
    p_enrollment_id: enrollment.id,
    p_course_id: courseId,
    p_division: division,
    p_actor_staff_id: actorStaffId ?? null,
    p_billing: normalizedBilling
      ? {
        expectedAmount: normalizedBilling.expectedAmount,
        discountAmount: normalizedBilling.discountAmount,
        discountReason: normalizedBilling.discountReason,
        payableAmount: normalizedBilling.payableAmount,
        tuitionExempt: normalizedBilling.tuitionExempt,
        tuitionExemptReason: normalizedBilling.tuitionExemptReason,
        status: initialBillingStatus,
      }
      : null,
    p_payments: normalizedPayments.map((payment) => ({
      amount: payment.amount,
      method: payment.method,
      category: payment.category,
      paidAt: payment.paidAt,
      memo: payment.memo,
      cardLast4: payment.cardLast4,
      installmentMonths: payment.installmentMonths,
      bankName: payment.bankName,
      bankAccountLast4: payment.bankAccountLast4,
      cashReceiptApprovalNo: payment.cashReceiptApprovalNo,
      items: payment.items.map((item) => ({
        label: item.label,
        amount: item.amount,
        sortOrder: item.sort_order,
      })),
    })),
  })

  if (rpcError) {
    throw rpcError
  }

  const paymentIds = ((rpcRows ?? []) as Array<{ payment_id: number | string }>)
    .map((row) => Number(row.payment_id))
    .filter((paymentId) => Number.isInteger(paymentId) && paymentId > 0)

  if (paymentIds.length !== normalizedPayments.length) {
    throw createPaymentError('���� ���� ����� Ȯ������ ���߽��ϴ�.', 500)
  }

  await recalculateEnrollmentPaymentState(db, enrollment.id)
  const createdPayments = await Promise.all(paymentIds.map((paymentId) => loadPaymentById(db, paymentId, division)))
  await invalidateCache('enrollments')
  return createdPayments.filter((payment): payment is EnrollmentPayment => Boolean(payment))
}

export async function listPayments(
  options: ListPaymentsOptions,
  division: string,
) {
  const db = createServerClient()
  let query = db
    .from('enrollment_payments')
    .select(PAYMENT_SELECT)
    .eq('courses.division', division)
    .order('paid_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit ?? 200)

  if (options.courseId) {
    query = query.eq('course_id', options.courseId)
  }

  if (options.enrollmentId) {
    query = query.eq('enrollment_id', options.enrollmentId)
  }

  if (options.from) {
    query = query.gte('paid_date', options.from)
  }

  if (options.to) {
    query = query.lte('paid_date', options.to)
  }

  if (options.method) {
    query = query.eq('method', options.method)
  }

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data ?? []) as EnrollmentPayment[]
}

export async function listPaymentsByIds(paymentIds: number[], division: string) {
  const normalizedIds = Array.from(new Set(
    paymentIds
      .map((paymentId) => Number(paymentId))
      .filter((paymentId) => Number.isInteger(paymentId) && paymentId > 0),
  ))

  if (normalizedIds.length === 0) {
    return []
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('enrollment_payments')
    .select(PAYMENT_SELECT)
    .eq('courses.division', division)
    .in('id', normalizedIds)
    .order('paid_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as EnrollmentPayment[]
}

export async function listSettlementDetailPayments(
  options: Pick<ListPaymentsOptions, 'courseId' | 'from' | 'to' | 'limit'>,
  division: string,
) {
  const paidPayments = await listPayments(options, division)

  if (!options.from || !options.to) {
    return paidPayments
  }

  const db = createServerClient()
  const { data: refundRows, error } = await db
    .from('enrollment_refunds')
    .select('payment_id')
    .gte('refund_date', options.from)
    .lte('refund_date', options.to)
    .limit(options.limit ?? 5000)

  if (error) {
    throw error
  }

  const refundPaymentIds = (refundRows ?? [])
    .map((row) => Number(row.payment_id))
    .filter((paymentId) => Number.isInteger(paymentId) && paymentId > 0)
  const refundPayments = await listPaymentsByIds(refundPaymentIds, division)
  const merged = new Map<number, EnrollmentPayment>()

  for (const payment of paidPayments) {
    merged.set(payment.id, payment)
  }

  for (const payment of refundPayments) {
    if (!options.courseId || payment.course_id === options.courseId) {
      merged.set(payment.id, payment)
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    const paidAtCompare = right.paid_at.localeCompare(left.paid_at)
    return paidAtCompare === 0 ? right.id - left.id : paidAtCompare
  })
}

export async function updatePayment(
  paymentId: number,
  input: UpdatePaymentInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
  }

  if (before.status === 'voided') {
    throw createPaymentError('취소??결제???�정?????�습?�다.')
  }

  const nextMethod = input.method ?? before.method
  const nextAmount = input.amount === undefined
    ? before.amount
    : nextMethod === 'free'
      ? toNonNegativeInteger(Number(input.amount), '결제 금액')
      : toPositiveInteger(Number(input.amount), '결제 금액')
  if (nextMethod === 'free' && nextAmount !== 0) {
    throw createPaymentError('무료 ?�강?� 결제 금액??0?�이?�야 ?�니??')
  }
  const refundTotal = getRefundTotal(before)
  if (nextAmount < refundTotal) {
    throw createPaymentError('결제 금액?� ?��? ?�불??금액보다 ?�을 ???�습?�다.')
  }

  const nextCategory = input.category ?? before.category
  const updatePayload: Record<string, unknown> = {}

  if (input.amount !== undefined) updatePayload.amount = nextAmount
  if (input.method !== undefined) updatePayload.method = nextMethod
  if (input.category !== undefined) updatePayload.category = input.category
  if (input.paidAt !== undefined) updatePayload.paid_at = normalizeTimestamp(input.paidAt)
  if (input.memo !== undefined) updatePayload.memo = normalizeOptionalText(input.memo)
  if (input.cardLast4 !== undefined) updatePayload.card_last4 = normalizeLast4(input.cardLast4, '카드 마�?�?번호')
  if (input.installmentMonths !== undefined) {
    updatePayload.installment_months = Math.max(0, Number(input.installmentMonths ?? 0) || 0)
  }
  if (input.bankName !== undefined) updatePayload.bank_name = normalizeOptionalText(input.bankName)
  if (input.bankAccountLast4 !== undefined) {
    updatePayload.bank_account_last4 = normalizeLast4(input.bankAccountLast4, '계좌 마�?�?번호')
  }
  if (input.cashReceiptApprovalNo !== undefined) {
    updatePayload.cash_receipt_approval_no = normalizeOptionalText(input.cashReceiptApprovalNo)
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await db
      .from('enrollment_payments')
      .update(updatePayload)
      .eq('id', paymentId)

    if (error) {
      throw error
    }
  }

  if (input.items !== undefined || input.amount !== undefined || input.category !== undefined) {
    const normalizedItems = normalizePaymentItems(nextAmount, nextCategory, input.items)
    const deleteResult = await db
      .from('enrollment_payment_items')
      .delete()
      .eq('payment_id', paymentId)

    if (deleteResult.error) {
      throw deleteResult.error
    }

    await createPaymentItems(db, paymentId, normalizedItems)
  }

  const after = await recalculatePaymentStatus(db, paymentId, division)
  await recordPaymentEvent(db, {
    paymentId,
    enrollmentId: before.enrollment_id,
    eventType: 'payment_updated',
    actorStaffId,
    beforeJson: before,
    afterJson: after,
  })

  await invalidateCache('enrollments')
  return after
}

export async function voidPayment(
  paymentId: number,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
  }

  if (before.status === 'voided') {
    return before
  }

  if (getRefundTotal(before) > 0) {
    throw createPaymentError('?�불 기록???�는 결제??취소?????�습?�다.')
  }

  const { error } = await db
    .from('enrollment_payments')
    .update({ status: 'voided' })
    .eq('id', paymentId)

  if (error) {
    throw error
  }

  const after = await loadPaymentById(db, paymentId, division)
  await recordPaymentEvent(db, {
    paymentId,
    enrollmentId: before.enrollment_id,
    eventType: 'payment_voided',
    actorStaffId,
    beforeJson: before,
    afterJson: after,
  })
  await recalculateEnrollmentPaymentState(db, before.enrollment_id)
  await invalidateCache('enrollments')

  return after
}

export async function createRefund(
  paymentId: number,
  input: CreateRefundInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
  }

  if (before.status === 'voided') {
    throw createPaymentError('취소??결제???�불?????�습?�다.')
  }

  const amount = toPositiveInteger(Number(input.amount), '?�불 금액')
  const remaining = before.amount - getRefundTotal(before)
  if (amount > remaining) {
    throw createPaymentError('?�불 금액???��? 결제 금액보다 ?�니??')
  }

  const { data, error } = await db
    .from('enrollment_refunds')
    .insert({
      payment_id: paymentId,
      amount,
      method: input.method,
      reason_category: normalizeRefundReasonCategory(input.reasonCategory),
      reason: normalizeOptionalText(input.reason),
      cancel_receipt_no: normalizeOptionalText(input.cancelReceiptNo),
      refund_account_last4: normalizeLast4(input.refundAccountLast4, '??�텋 ?�꾩�?留덉?�?4?�?��'),
      refunded_at: normalizeTimestamp(input.refundedAt),
      processed_by_staff_id: actorStaffId ?? null,
      memo: normalizeOptionalText(input.memo),
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  const after = await recalculatePaymentStatus(db, paymentId, division, {
    allowEnrollmentRefundStatus: true,
  })
  await recordPaymentEvent(db, {
    paymentId,
    enrollmentId: before.enrollment_id,
    eventType: 'refund_created',
    actorStaffId,
    beforeJson: before,
    afterJson: { payment: after, refund: data },
  })

  await invalidateCache('enrollments')
  return {
    refund: data as EnrollmentRefund,
    payment: after,
  }
}

export async function createRefundBundle(
  input: CreateRefundBundleInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  if (input.refunds.length === 0) {
    throw createPaymentError('?�?�할 ?�불 ?�역???�습?�다.')
  }

  const paymentIds = Array.from(new Set(input.refunds.map((refund) => Number(refund.paymentId))))
  if (paymentIds.some((paymentId) => !Number.isInteger(paymentId) || paymentId <= 0)) {
    throw createPaymentError('?�불 ?�??결제 ID가 ?�바르�? ?�습?�다.')
  }

  const paymentMap = new Map<number, EnrollmentPayment>()
  let enrollmentId: number | null = null
  for (const paymentId of paymentIds) {
    const payment = await loadPaymentById(db, paymentId, division)
    if (!payment) {
      throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
    }

    if (payment.status === 'voided') {
      throw createPaymentError('취소??결제???�불?????�습?�다.')
    }

    if (enrollmentId === null) {
      enrollmentId = payment.enrollment_id
    } else if (enrollmentId !== payment.enrollment_id) {
      throw createPaymentError('같�? ?�강?�의 결제 건만 ??번에 ?�불?????�습?�다.')
    }

    paymentMap.set(paymentId, payment)
  }

  const requestedByPayment = new Map<number, number>()
  const normalizedRefunds = input.refunds.map((refund, index) => {
    const paymentId = Number(refund.paymentId)
    const amount = toPositiveInteger(Number(refund.amount), `${index + 1}번째 ?�불 금액`)
    requestedByPayment.set(paymentId, (requestedByPayment.get(paymentId) ?? 0) + amount)

    return {
      paymentId,
      amount,
      method: refund.method,
      reasonCategory: normalizeRefundReasonCategory(refund.reasonCategory),
      reason: normalizeOptionalText(refund.reason),
      cancelReceiptNo: normalizeOptionalText(refund.cancelReceiptNo),
      refundAccountLast4: normalizeLast4(refund.refundAccountLast4, '??�텋 ?�꾩�?留덉?�?4?�?��'),
      refundedAt: normalizeTimestamp(refund.refundedAt),
      memo: normalizeOptionalText(refund.memo),
    }
  })

  for (const [paymentId, requestedAmount] of requestedByPayment) {
    const payment = paymentMap.get(paymentId)
    if (!payment) {
      throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
    }

    const remaining = payment.amount - getRefundTotal(payment)
    if (requestedAmount > remaining) {
      throw createPaymentError('?�불 금액???��? 결제 금액보다 ?�니??')
    }
  }

  const createdRefunds: EnrollmentRefund[] = []
  try {
    for (const refund of normalizedRefunds) {
      const { data, error } = await db
        .from('enrollment_refunds')
        .insert({
          payment_id: refund.paymentId,
          amount: refund.amount,
          method: refund.method,
          reason_category: refund.reasonCategory,
          reason: refund.reason,
          cancel_receipt_no: refund.cancelReceiptNo,
          refund_account_last4: refund.refundAccountLast4,
          refunded_at: refund.refundedAt,
          processed_by_staff_id: actorStaffId ?? null,
          memo: refund.memo,
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      createdRefunds.push(data as EnrollmentRefund)
    }

    const updatedPayments: EnrollmentPayment[] = []
    for (const paymentId of paymentIds) {
      updatedPayments.push(await recalculatePaymentStatus(db, paymentId, division, {
        allowEnrollmentRefundStatus: true,
      }))
    }

    for (const refund of createdRefunds) {
      const before = paymentMap.get(refund.payment_id) ?? null
      const after = updatedPayments.find((payment) => payment.id === refund.payment_id) ?? null
      await recordPaymentEvent(db, {
        paymentId: refund.payment_id,
        enrollmentId: before?.enrollment_id ?? enrollmentId,
        eventType: 'refund_created',
        actorStaffId,
        beforeJson: before,
        afterJson: { payment: after, refund },
      })
    }

    await invalidateCache('enrollments')
    return {
      refunds: createdRefunds,
      payments: updatedPayments,
    }
  } catch (error) {
    for (const refund of createdRefunds) {
      await db
        .from('enrollment_refunds')
        .delete()
        .eq('id', refund.id)
    }

    for (const paymentId of paymentIds) {
      await recalculatePaymentStatus(db, paymentId, division).catch(() => null)
    }

    throw error
  }
}

export async function deleteRefund(
  paymentId: number,
  refundId: number,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제�?찾을 ???�습?�다.', 404)
  }

  const target = before.enrollment_refunds?.find((refund) => refund.id === refundId)
  if (!target) {
    throw createPaymentError('?�불 기록??찾을 ???�습?�다.', 404)
  }

  const { error } = await db
    .from('enrollment_refunds')
    .delete()
    .eq('id', refundId)
    .eq('payment_id', paymentId)

  if (error) {
    throw error
  }

  const after = await recalculatePaymentStatus(db, paymentId, division)
  await recordPaymentEvent(db, {
    paymentId,
    enrollmentId: before.enrollment_id,
    eventType: 'refund_voided',
    actorStaffId,
    beforeJson: { payment: before, refund: target },
    afterJson: after,
  })

  await invalidateCache('enrollments')
  return after
}

export function getPaymentServiceStatus(error: unknown) {
  if (isPaymentSchemaMissing(error)) {
    return 503
  }

  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status) || 400
    : 500
}

export function getPaymentServiceMessage(error: unknown, fallback: string) {
  if (isPaymentSchemaMissing(error)) {
    return PAYMENT_SCHEMA_MISSING_MESSAGE
  }

  if (error instanceof Error) {
    return error.message
  }

  const message = getPaymentErrorField(error, 'message')
  return message || fallback
}

export function createStudentMatcher(enrollments: Enrollment[]) {
  const byNameAndPhoneLast4 = new Map<string, Enrollment[]>()

  for (const enrollment of enrollments) {
    const last4 = normalizePhone(enrollment.phone).slice(-4)
    if (!last4) {
      continue
    }

    const key = `${normalizeName(enrollment.name)}::${last4}`
    byNameAndPhoneLast4.set(key, [...(byNameAndPhoneLast4.get(key) ?? []), enrollment])
  }

  return (name: string, phone: string) => {
    const key = `${normalizeName(name)}::${normalizePhone(phone).slice(-4)}`
    const candidates = byNameAndPhoneLast4.get(key) ?? []
    return candidates.length === 1 ? candidates[0] : null
  }
}

export async function listCourseEnrollmentsForPaymentImport(courseId: number, division: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('enrollments')
    .select('*,courses!inner(id,division),students(*)')
    .eq('course_id', courseId)
    .eq('courses.division', division)

  if (error) {
    throw error
  }

  return (data ?? []) as Array<Enrollment & { students?: Student | null }>
}
