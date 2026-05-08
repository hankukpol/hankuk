import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { resolveBranchSeriesOption } from '@/lib/branch-series'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  getCourseById,
  listMaterialsForCourse,
} from '@/lib/class-pass-data'
import {
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'
import { getTuitionExemptBillingRuleError } from '@/lib/payments/billing-rules'
import { normalizeCardCompanyInput, resolveDepositorName } from '@/lib/payments/request-normalizers'
import {
  deleteStudentIfOrphaned,
  ensureStudentProfile,
  findMatchingStudentProfile,
  getStudentAuthProfile,
  getStudentProfileById,
  initializeStudentAuth,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { isLikelyPhoneNumber, isValidBirthDateKey } from '@/lib/validation/primitives'
import type { Course, Enrollment, Student } from '@/types/database'

const phoneSchema = z.string().trim().refine(isLikelyPhoneNumber)
const optionalBirthDateSchema = z.preprocess(
  (value) => value === '' ? '' : value,
  z.union([z.string().refine(isValidBirthDateKey), z.literal('')]).optional().nullable(),
)

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

const paymentMethodSchema = z.enum(['card', 'homepage', 'cash', 'bank_transfer', 'point', 'free', 'other'])

const paymentSchema = z.object({
  amount: z.number().int().min(0),
  method: paymentMethodSchema,
  category: z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc']).default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  cardCompany: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  depositorName: z.string().trim().max(80).optional().nullable(),
  cashReceiptApprovalNo: z.string().trim().max(80).optional().nullable(),
  items: z.array(paymentItemSchema).optional(),
})

const billingSchema = z.object({
  expectedAmount: z.number().int().min(0),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().optional().nullable(),
  payableAmount: z.number().int().min(0),
  tuitionExempt: z.boolean().default(false),
  tuitionExemptReason: z.string().optional().nullable(),
})

const registrationSchema = z.object({
  courseId: z.number().int().positive(),
  textbookIds: z.array(z.number().int().positive()).optional(),
  billing: billingSchema,
})

const createBatchSchema = z.object({
  studentId: z.number().int().positive().optional().nullable(),
  updateSelectedStudent: z.boolean().optional(),
  name: z.string().min(1),
  phone: phoneSchema,
  exam_number: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  series_option_id: z.number().int().positive().optional().nullable(),
  student_type: z.enum(['academy', 'general']).default('academy'),
  memo: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  birth_date: optionalBirthDateSchema,
  custom_data: z.record(z.string()).optional(),
  registrations: z.array(registrationSchema).min(2).max(8),
  payments: z.array(paymentSchema).optional(),
})

type ServerClient = ReturnType<typeof createServerClient>
type ParsedBilling = z.infer<typeof billingSchema>
type ParsedPayment = z.infer<typeof paymentSchema>
type ParsedRegistration = z.infer<typeof registrationSchema>
type BatchEnrollmentRpcRow = {
  result_index: number
  enrollment_id: number
  course_id: number
  reactivated: boolean
  payment_ids: number[] | null
  enrollment_row: Enrollment | null
}

async function listExistingCourseRegistrations(
  db: ServerClient,
  courseId: number,
  studentId: number,
  name: string,
  phone: string,
) {
  const [byStudent, byIdentity] = await Promise.all([
    db
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
    db
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('name', name)
      .eq('phone', phone)
      .order('created_at', { ascending: false }),
  ])

  if (byStudent.error) {
    throw byStudent.error
  }

  if (byIdentity.error) {
    throw byIdentity.error
  }

  const byId = new Map<number, Enrollment>()
  for (const enrollment of [
    ...((byStudent.data ?? []) as Enrollment[]),
    ...((byIdentity.data ?? []) as Enrollment[]),
  ]) {
    byId.set(enrollment.id, enrollment)
  }

  return Array.from(byId.values()).sort((left, right) => (
    right.created_at.localeCompare(left.created_at)
  ))
}

function getBillingValidationError(billing: ParsedBilling, payments: ParsedPayment[]) {
  if (billing.discountAmount > billing.expectedAmount) {
    return '할인 금액은 강좌 정가보다 클 수 없습니다.'
  }

  const isZeroAmountBilling = !billing.tuitionExempt
    && billing.expectedAmount === 0
    && billing.discountAmount === 0
    && billing.payableAmount === 0

  if (!billing.tuitionExempt && billing.expectedAmount <= 0 && !isZeroAmountBilling) {
    return '유료 수강은 강좌 정가를 1원 이상 입력해야 합니다.'
  }

  if (!billing.tuitionExempt && billing.discountAmount > 0 && !billing.discountReason?.trim()) {
    return '할인 금액을 입력한 경우 할인 사유가 필요합니다.'
  }

  const calculatedPayableAmount = billing.tuitionExempt
    ? 0
    : Math.max(billing.expectedAmount - billing.discountAmount, 0)
  if (billing.payableAmount !== calculatedPayableAmount) {
    return '적용 금액이 청구 정보와 일치하지 않습니다.'
  }

  if (!billing.tuitionExempt && billing.payableAmount <= 0 && !isZeroAmountBilling) {
    return '적용 금액이 0원이면 무료 수강 또는 수납 면제로 기록해 주세요.'
  }

  if (isZeroAmountBilling && payments.length > 0) {
    return '0원 강좌는 결제 내역 없이 등록해 주세요.'
  }

  const tuitionPaymentTotal = payments.reduce((sum, payment) => (
    payment.category === 'tuition' ? sum + payment.amount : sum
  ), 0)
  if (billing.tuitionExempt) {
    if (!billing.tuitionExemptReason?.trim()) {
      return '무료 수강 또는 수납 면제 사유를 입력해 주세요.'
    }

    const exemptRuleError = getTuitionExemptBillingRuleError({
      tuitionExempt: billing.tuitionExempt,
      discountAmount: billing.discountAmount,
      tuitionExemptReason: billing.tuitionExemptReason,
    })
    if (exemptRuleError) {
      return exemptRuleError
    }

    if (payments.some((payment) => payment.method !== 'free' || payment.amount !== 0)) {
      return '무료 수강 결제 기록은 금액 0원과 무료 수단으로만 저장할 수 있습니다.'
    }

    return null
  }

  if (payments.length > 0 && tuitionPaymentTotal <= 0) {
    return '수납 금액을 입력해 주세요.'
  }

  if (payments.length > 0 && tuitionPaymentTotal !== billing.payableAmount) {
    return '수납 합계가 적용 금액과 일치해야 합니다.'
  }

  return null
}

function validateBatchPayments(registrations: ParsedRegistration[], payments: ParsedPayment[]) {
  if (payments.some((payment) => payment.category !== 'tuition')) {
    return '묶음 등록 결제는 수강료 결제만 지원합니다.'
  }

  if (payments.length === 0) {
    return null
  }

  const cardWithoutCompany = payments.find((payment) => (
    payment.method === 'card' && !payment.cardCompany?.trim()
  ))
  if (cardWithoutCompany) {
    return '카드 결제 시 카드사는 필수입니다.'
  }

  const invalidCardLast4 = payments.find((payment) => (
    payment.cardLast4 && !/^\d{4}$/.test(payment.cardLast4.trim())
  ))
  if (invalidCardLast4) {
    return '카드 마지막 번호는 숫자 4자리여야 합니다.'
  }

  const bankTransferWithoutAccount = payments.find((payment) => (
    payment.method === 'bank_transfer'
    && !resolveDepositorName(payment.depositorName, payment.bankAccountLast4)
  ))
  if (bankTransferWithoutAccount) {
    return '계좌 결제 시 입금자명은 필수입니다.'
  }

  const totalPayable = getBatchTotalPayable(registrations)
  const allExempt = registrations.every((registration) => registration.billing.tuitionExempt)
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)

  if (allExempt) {
    return payments.every((payment) => payment.method === 'free' && payment.amount === 0)
      ? null
      : '무료/면제 묶음 등록은 무료 수단과 0원 금액으로만 저장할 수 있습니다.'
  }

  if (payments.some((payment) => payment.method === 'free')) {
    return '유료 묶음 등록은 무료 결제수단으로 저장할 수 없습니다.'
  }

  if (payments.some((payment) => payment.amount <= 0)) {
    return '결제 수단별 수납 금액을 입력해 주세요.'
  }

  if (paymentTotal !== totalPayable) {
    return '묶음 결제 총액은 선택한 강좌들의 적용 금액 합계와 일치해야 합니다.'
  }

  return null
}

function getBatchTotalPayable(registrations: ParsedRegistration[]) {
  return registrations.reduce((sum, registration) => (
    sum + (registration.billing.tuitionExempt ? 0 : registration.billing.payableAmount)
  ), 0)
}

function getPaymentAllocationKey(payment: ParsedPayment, index: number) {
  return `${index}:${payment.method}`
}

function createRemainingByMethod(payments: ParsedPayment[]) {
  return new Map(payments.map((payment, index) => [
    getPaymentAllocationKey(payment, index),
    payment.amount,
  ]))
}

function applyAllocationDelta(
  allocations: Array<{
    amount: number
    key: string
    remainingAmount: number
  }>,
  delta: number,
) {
  let remainingDelta = delta

  if (remainingDelta > 0) {
    for (const allocation of [...allocations].reverse()) {
      if (remainingDelta <= 0) {
        break
      }

      const headroom = allocation.remainingAmount - allocation.amount
      const adjustment = Math.min(headroom, remainingDelta)
      allocation.amount += adjustment
      remainingDelta -= adjustment
    }
  } else if (remainingDelta < 0) {
    for (const allocation of [...allocations].reverse()) {
      if (remainingDelta >= 0) {
        break
      }

      const adjustment = Math.min(allocation.amount, Math.abs(remainingDelta))
      allocation.amount -= adjustment
      remainingDelta += adjustment
    }
  }

  if (remainingDelta !== 0) {
    throw new Error('BATCH_PAYMENT_ALLOCATION_MISMATCH')
  }
}

function buildPaymentsForRegistration(
  payments: ParsedPayment[],
  billing: ParsedBilling,
  course: Course,
  totalPayable: number,
  isLast: boolean,
  remainingByMethod: Map<string, number>,
): ParsedPayment[] {
  const coursePayable = billing.tuitionExempt ? 0 : billing.payableAmount
  if (coursePayable <= 0 || totalPayable <= 0 || payments.length === 0) {
    return []
  }

  const allocations = payments.map((payment, index) => {
    const key = getPaymentAllocationKey(payment, index)
    const remainingAmount = remainingByMethod.get(key) ?? 0
    const proportionalAmount = isLast
      ? remainingAmount
      : Math.round(payment.amount * coursePayable / totalPayable)

    return {
      payment,
      key,
      remainingAmount,
      amount: Math.min(Math.max(proportionalAmount, 0), remainingAmount),
    }
  })

  const allocatedTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  applyAllocationDelta(allocations, coursePayable - allocatedTotal)

  return allocations
    .filter((allocation) => allocation.amount > 0)
    .map((allocation) => {
      remainingByMethod.set(
        allocation.key,
        Math.max(allocation.remainingAmount - allocation.amount, 0),
      )

      return {
        ...allocation.payment,
        amount: allocation.amount,
        category: 'tuition',
        items: [{ label: course.name, amount: allocation.amount }],
      }
    })
}

function readSupabaseErrorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : ''
}

function getBatchRpcStatus(error: unknown) {
  const message = readSupabaseErrorMessage(error)
  if (message.includes('active enrollment already exists')) {
    return 409
  }
  if (message.includes('course not found')) {
    return 404
  }
  if (
    message.includes('duplicate course')
    || message.includes('invalid textbook')
    || message.includes('billing is required')
    || message.includes('payment total')
    || message.includes('invalid input syntax for type timestamp')
  ) {
    return 400
  }

  return getPaymentServiceStatus(error)
}

function getBatchRpcMessage(error: unknown, fallback: string) {
  const message = readSupabaseErrorMessage(error)
  if (message.includes('active enrollment already exists')) {
    return '선택한 강좌 중 이미 등록된 강좌가 있습니다.'
  }
  if (message.includes('course not found')) {
    return '강좌를 찾을 수 없습니다.'
  }
  if (message.includes('invalid textbook')) {
    return '유효하지 않은 교재가 포함되어 있습니다.'
  }
  if (message.includes('tuition payment total does not match remaining payable amount')) {
    return '수납 금액이 현재 미수납 금액과 일치하지 않습니다. 새로고침 후 다시 확인해 주세요.'
  }
  if (message.includes('invalid input syntax for type timestamp')) {
    return '수납일시 형식이 올바르지 않습니다.'
  }

  return getPaymentServiceMessage(error, fallback)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdminRequest(req)
    if (auth.error) {
      return auth.error
    }

    const featureError = await requireAppFeature('admin_student_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = createBatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '묶음 수강생 등록 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const registrations = parsed.data.registrations
    const courseIds = registrations.map((registration) => registration.courseId)
    if (new Set(courseIds).size !== courseIds.length) {
      return NextResponse.json({ error: '같은 강좌를 묶음 등록에 중복 선택할 수 없습니다.' }, { status: 400 })
    }

    const payments = (parsed.data.payments ?? []).map((payment) => ({
      ...payment,
      cardCompany: payment.method === 'card' ? normalizeCardCompanyInput(payment.cardCompany) : null,
      depositorName: resolveDepositorName(payment.depositorName, payment.bankAccountLast4),
    }))
    const paymentError = validateBatchPayments(registrations, payments)
    if (paymentError) {
      return NextResponse.json({ error: paymentError }, { status: 400 })
    }

    const division = await getServerTenantType()
    const courses = new Map<number, Course>()
    for (const registration of registrations) {
      const course = await getCourseById(registration.courseId, division)
      if (!course) {
        return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
      }
      courses.set(course.id, course)
    }

    const totalPayable = getBatchTotalPayable(registrations)
    const lastBillableRegistrationIndex = registrations.findLastIndex((registration) => (
      !registration.billing.tuitionExempt
      && registration.billing.payableAmount > 0
    ))
    const remainingByMethod = createRemainingByMethod(payments)
    const registrationPaymentAllocations = registrations.map((registration, index) => {
      const course = courses.get(registration.courseId)
      if (!course) {
        throw new Error('BATCH_ENROLLMENT_MISMATCH')
      }

      return buildPaymentsForRegistration(
        payments,
        registration.billing,
        course,
        totalPayable,
        index === lastBillableRegistrationIndex,
        remainingByMethod,
      )
    })

    for (const [index, registration] of registrations.entries()) {
      const billingError = getBillingValidationError(
        registration.billing,
        registrationPaymentAllocations[index] ?? [],
      )
      if (billingError) {
        return NextResponse.json({ error: billingError }, { status: 400 })
      }
    }

    for (const registration of registrations) {
      const textbookIds = Array.from(new Set(registration.textbookIds ?? []))
      if (textbookIds.length === 0) {
        continue
      }

      const textbooks = await listMaterialsForCourse(registration.courseId, { materialType: 'textbook' })
      const textbookIdSet = new Set(textbooks.map((textbook) => textbook.id))
      if (textbookIds.some((textbookId) => !textbookIdSet.has(textbookId))) {
        return NextResponse.json({ error: '유효하지 않은 교재가 포함되어 있습니다.' }, { status: 400 })
      }
    }

    const db = createServerClient()
    const seriesOption = await resolveBranchSeriesOption({
      optionId: parsed.data.series_option_id,
      label: parsed.data.series,
    })
    if (parsed.data.series_option_id && seriesOption?.id !== parsed.data.series_option_id) {
      return NextResponse.json({ error: '선택한 직렬은 현재 지점에서 사용할 수 없습니다.' }, { status: 400 })
    }

    const selectedStudent = parsed.data.studentId
      ? await getStudentProfileById(db, parsed.data.studentId, division)
      : null

    if (parsed.data.studentId && !selectedStudent) {
      return NextResponse.json({ error: '선택한 수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const matchedStudent = selectedStudent ?? await findMatchingStudentProfile(db, {
      division,
      name: parsed.data.name,
      phone: parsed.data.phone,
      exam_number: parsed.data.exam_number,
      photo_url: parsed.data.photo_url,
    })

    const studentResult = selectedStudent && !parsed.data.updateSelectedStudent
      ? { student: selectedStudent, created: false, changed: false }
      : await ensureStudentProfile(db, {
        division,
        currentStudentId: selectedStudent?.id ?? matchedStudent?.id ?? null,
        name: parsed.data.name,
        phone: parsed.data.phone,
        exam_number: parsed.data.exam_number,
        photo_url: parsed.data.photo_url,
      })

    const authSetup = await initializeStudentAuth(
      db,
      studentResult.student,
      parsed.data.birth_date || null,
    )
    const student = authSetup.student

    for (const registration of registrations) {
      const existingRegistrations = await listExistingCourseRegistrations(
        db,
        registration.courseId,
        student.id,
        student.name,
        student.phone,
      )
      const activeRegistration = existingRegistrations.find((entry) => entry.status === 'active')
      if (activeRegistration) {
        return NextResponse.json({ error: '선택한 강좌 중 이미 등록된 강좌가 있습니다.' }, { status: 409 })
      }
    }

    const actorStaffId = getActorStaffId(auth.payload)
    const hasBillablePayment = registrationPaymentAllocations.some((allocation) => allocation.length > 0)
    const checkoutGroupId = hasBillablePayment ? randomUUID() : null
    const studentSnapshot = {
      name: student.name,
      phone: student.phone,
      examNumber: student.exam_number,
      gender: parsed.data.gender || null,
      region: parsed.data.region || null,
      seriesOptionId: seriesOption?.id ?? null,
      seriesGroup: seriesOption?.group_key ?? 'public',
      series: seriesOption?.label ?? parsed.data.series ?? '공채',
      studentType: parsed.data.student_type,
      memo: parsed.data.memo || null,
      photoUrl: student.photo_url,
      customData: parsed.data.custom_data ?? {},
    }
    const rpcRegistrations = registrations.map((registration, index) => {
      const course = courses.get(registration.courseId)
      if (!course) {
        throw new Error('BATCH_ENROLLMENT_MISMATCH')
      }

      return {
        courseId: registration.courseId,
        textbookIds: Array.from(new Set(registration.textbookIds ?? [])),
        billing: registration.billing,
        payments: registrationPaymentAllocations[index] ?? [],
      }
    })

    const { data: rpcData, error: rpcError } = await db.rpc('create_enrollment_batch_atomic', {
      p_student_id: student.id,
      p_student_snapshot: studentSnapshot,
      p_registrations: rpcRegistrations,
      p_division: division,
      p_actor_staff_id: actorStaffId,
      p_checkout_group_id: checkoutGroupId,
    })

    if (rpcError) {
      console.error('enrollments.batch.POST atomic RPC failed', rpcError)

      if (studentResult.created) {
        try {
          await deleteStudentIfOrphaned(db, student.id)
        } catch (deleteError) {
          console.error('enrollments.batch.POST student cleanup failed', {
            rpcError,
            deleteError,
            studentId: student.id,
          })
        }
      }

      return NextResponse.json(
        { error: getBatchRpcMessage(rpcError, '묶음 수강생 등록을 저장하지 못했습니다.') },
        { status: getBatchRpcStatus(rpcError) },
      )
    }

    const rpcRows = ((rpcData ?? []) as BatchEnrollmentRpcRow[])
      .sort((left, right) => left.result_index - right.result_index)
    if (rpcRows.length !== registrations.length || rpcRows.some((row) => !row.enrollment_row)) {
      throw new Error('BATCH_ENROLLMENT_RPC_RESULT_MISMATCH')
    }

    const createdEnrollments = rpcRows.map((row) => ({
      ...(row.enrollment_row as Enrollment),
      student_type: (row.enrollment_row as Enrollment).student_type ?? parsed.data.student_type,
    }))
    const reactivatedCount = rpcRows.filter((row) => row.reactivated).length

    try {
      if (studentResult.changed || studentResult.created) {
        await syncStudentEnrollmentSnapshots(db, student)
      }
      await invalidateCache('enrollments')
      if (registrations.some((registration) => (registration.textbookIds ?? []).length > 0)) {
        await invalidateCache('materials')
      }
    } catch (postCommitError) {
      console.error('enrollments.batch.POST post-commit refresh failed', {
        postCommitError,
        enrollmentIds: createdEnrollments.map((enrollment) => enrollment.id),
      })
    }

    return NextResponse.json(
      {
        enrollments: createdEnrollments.map((enrollment) => ({
          ...enrollment,
          student_profile: getStudentAuthProfile(student as Student),
        })),
        checkoutGroupId,
        reactivatedCount,
        generated_pin: authSetup.generatedPin ?? undefined,
      },
      {
        status: reactivatedCount > 0 ? 200 : 201,
        ...(authSetup.generatedPin ? { headers: { 'Cache-Control': 'no-store, max-age=0' } } : {}),
      },
    )
  } catch (error) {
    return handleRouteError('enrollments.batch.POST', '묶음 수강생 등록을 생성하지 못했습니다.', error)
  }
}
