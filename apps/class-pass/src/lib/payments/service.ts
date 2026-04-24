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
  type EnrollmentPayment,
  type EnrollmentRefund,
  type PaymentCategory,
  type PaymentEventType,
  type PaymentMethod,
  type PaymentStatus,
  type RefundMethod,
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
  items?: PaymentItemInput[]
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
  reason?: string | null
  refundedAt?: string | null
  memo?: string | null
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

function createPaymentError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function toPositiveInteger(value: number, fieldLabel: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw createPaymentError(`${fieldLabel}은 0원보다 큰 정수여야 합니다.`)
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
    throw createPaymentError(`${fieldLabel}는 숫자 4자리여야 합니다.`)
  }

  return normalized
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
    throw createPaymentError('일자를 정확히 입력해 주세요.')
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
    amount: toPositiveInteger(Number(item.amount), `${index + 1}번째 결제 항목 금액`),
    sort_order: index,
  }))

  const itemTotal = normalized.reduce((sum, item) => sum + item.amount, 0)
  if (itemTotal !== amount) {
    throw createPaymentError('결제 항목 합계가 결제 금액과 일치해야 합니다.')
  }

  return normalized
}

function getRefundTotal(payment: Pick<EnrollmentPayment, 'enrollment_refunds'>) {
  return (payment.enrollment_refunds ?? []).reduce((sum, refund) => sum + Number(refund.amount), 0)
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
    throw createPaymentError('수강생을 찾을 수 없습니다.', 404)
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
    .select('id,amount,status,enrollment_refunds(amount)')
    .eq('enrollment_id', enrollmentId)
    .neq('status', 'voided')

  if (error) {
    throw error
  }

  const payments = (data ?? []) as Array<Pick<EnrollmentPayment, 'id' | 'amount' | 'status' | 'enrollment_refunds'>>
  const netAmount = payments.reduce((sum, payment) => (
    sum + payment.amount - getRefundTotal(payment)
  ), 0)

  if (options?.allowRefundStatus && payments.length > 0 && netAmount <= 0) {
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

  const { data: enrollment, error: enrollmentError } = await db
    .from('enrollments')
    .select('status')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (enrollmentError) {
    throw enrollmentError
  }

  if (enrollment?.status === 'refunded' && netAmount > 0) {
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
    throw createPaymentError('결제를 찾을 수 없습니다.', 404)
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
    throw createPaymentError('강좌를 찾을 수 없습니다.', 404)
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
      throw createPaymentError('같은 강좌에 동일한 학생이 이미 등록되어 있습니다.', 409)
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
      throw createPaymentError('같은 강좌에 동일한 이름/연락처 수강생이 이미 존재합니다.', 409)
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

export async function createPayment(
  input: CreatePaymentInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const enrollment = await getEnrollmentForPayment(db, input.enrollmentId, division)
  const courseId = input.courseId ?? enrollment.course_id

  if (courseId !== enrollment.course_id) {
    throw createPaymentError('결제 강좌와 수강생 강좌가 일치하지 않습니다.')
  }

  const amount = toPositiveInteger(Number(input.amount), '결제 금액')
  const category = input.category ?? 'tuition'
  const normalizedItems = normalizePaymentItems(amount, category, input.items)
  const paidAt = normalizeTimestamp(input.paidAt)

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
      card_last4: normalizeLast4(input.cardLast4, '카드 마지막 번호'),
      installment_months: Math.max(0, Number(input.installmentMonths ?? 0) || 0),
      bank_name: normalizeOptionalText(input.bankName),
      bank_account_last4: normalizeLast4(input.bankAccountLast4, '계좌 마지막 번호'),
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

export async function updatePayment(
  paymentId: number,
  input: UpdatePaymentInput,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제를 찾을 수 없습니다.', 404)
  }

  if (before.status === 'voided') {
    throw createPaymentError('취소된 결제는 수정할 수 없습니다.')
  }

  const nextAmount = input.amount === undefined
    ? before.amount
    : toPositiveInteger(Number(input.amount), '결제 금액')
  const refundTotal = getRefundTotal(before)
  if (nextAmount < refundTotal) {
    throw createPaymentError('결제 금액은 이미 환불된 금액보다 작을 수 없습니다.')
  }

  const nextCategory = input.category ?? before.category
  const updatePayload: Record<string, unknown> = {}

  if (input.amount !== undefined) updatePayload.amount = nextAmount
  if (input.method !== undefined) updatePayload.method = input.method
  if (input.category !== undefined) updatePayload.category = input.category
  if (input.paidAt !== undefined) updatePayload.paid_at = normalizeTimestamp(input.paidAt)
  if (input.memo !== undefined) updatePayload.memo = normalizeOptionalText(input.memo)
  if (input.cardLast4 !== undefined) updatePayload.card_last4 = normalizeLast4(input.cardLast4, '카드 마지막 번호')
  if (input.installmentMonths !== undefined) {
    updatePayload.installment_months = Math.max(0, Number(input.installmentMonths ?? 0) || 0)
  }
  if (input.bankName !== undefined) updatePayload.bank_name = normalizeOptionalText(input.bankName)
  if (input.bankAccountLast4 !== undefined) {
    updatePayload.bank_account_last4 = normalizeLast4(input.bankAccountLast4, '계좌 마지막 번호')
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

  if (input.items !== undefined) {
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
    throw createPaymentError('결제를 찾을 수 없습니다.', 404)
  }

  if (before.status === 'voided') {
    return before
  }

  if (getRefundTotal(before) > 0) {
    throw createPaymentError('환불 기록이 있는 결제는 취소할 수 없습니다.')
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
    throw createPaymentError('결제를 찾을 수 없습니다.', 404)
  }

  if (before.status === 'voided') {
    throw createPaymentError('취소된 결제는 환불할 수 없습니다.')
  }

  const amount = toPositiveInteger(Number(input.amount), '환불 금액')
  const remaining = before.amount - getRefundTotal(before)
  if (amount > remaining) {
    throw createPaymentError('환불 금액이 남은 결제 금액보다 큽니다.')
  }

  const { data, error } = await db
    .from('enrollment_refunds')
    .insert({
      payment_id: paymentId,
      amount,
      method: input.method,
      reason: normalizeOptionalText(input.reason),
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

export async function deleteRefund(
  paymentId: number,
  refundId: number,
  division: string,
  actorStaffId?: number | null,
) {
  const db = createServerClient()
  const before = await loadPaymentById(db, paymentId, division)
  if (!before) {
    throw createPaymentError('결제를 찾을 수 없습니다.', 404)
  }

  const target = before.enrollment_refunds?.find((refund) => refund.id === refundId)
  if (!target) {
    throw createPaymentError('환불 기록을 찾을 수 없습니다.', 404)
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
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status) || 400
    : 500
}

export function getPaymentServiceMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
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
