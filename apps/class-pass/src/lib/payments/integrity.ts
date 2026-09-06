import { createServerClient } from '@/lib/supabase/server'
import { readPaymentPages } from '@/lib/payments/read-pages'
import type { BillingStatus, CourseStatus, EnrollmentStatus, PaymentCategory, PaymentStatus } from '@/types/database'

type ServerClient = ReturnType<typeof createServerClient>

type CourseRow = {
  id: number
  name: string
  status: CourseStatus
  tuition_amount: number
}

type EnrollmentRow = {
  id: number
  course_id: number
  student_id: number | null
  name: string
  phone: string
  exam_number: string | null
  status: EnrollmentStatus
  created_at: string
}

type BillingRow = {
  id: number
  enrollment_id: number
  course_id: number
  expected_amount: number
  discount_amount: number
  payable_amount: number
  tuition_exempt: boolean
  status: BillingStatus
  created_at: string
  updated_at: string
}

type PaymentRow = {
  id: number
  enrollment_id: number
  course_id: number
  amount: number
  status: PaymentStatus
  category: PaymentCategory
  method: string
  paid_date: string
  created_at: string
}

type RefundRow = {
  id: number
  payment_id: number
  amount: number
  refunded_at: string
}

export type PaymentIntegritySeverity = 'error' | 'warning'

export type PaymentIntegrityIssue = {
  id: string
  severity: PaymentIntegritySeverity
  code:
    | 'missing_billing'
    | 'duplicate_billing'
    | 'billing_course_mismatch'
    | 'payment_course_mismatch'
    | 'payment_without_billing'
    | 'billable_without_payment'
    | 'billing_amount_mismatch'
    | 'billing_status_mismatch'
    | 'refunded_enrollment_has_net_amount'
    | 'active_enrollment_fully_refunded'
    | 'exempt_billing_without_active_free_payment'
    | 'payment_refund_status_mismatch'
  message: string
  recommendation: string
  courseId: number
  courseName: string
  enrollmentId: number
  studentName: string
  phone: string
  examNumber: string | null
  enrollmentStatus: EnrollmentStatus
  billingStatus: BillingStatus | null
  expectedBillingStatus: BillingStatus | null
  payableAmount: number
  paymentGrossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
  latestActivityAt: string | null
}

export type PaymentIntegrityReport = {
  division: string
  checkedAt: string
  truncated: boolean
  totals: {
    coursesChecked: number
    enrollmentsChecked: number
    billingsChecked: number
    paymentsChecked: number
    refundsChecked: number
    issueCount: number
    errorCount: number
    warningCount: number
  }
  issues: PaymentIntegrityIssue[]
}

export type CheckPaymentIntegrityOptions = {
  courseId?: number | null
  maxEnrollments?: number
}

const DEFAULT_MAX_ENROLLMENTS = 2000
const MAX_ENROLLMENTS_CAP = 5000
const QUERY_CHUNK_SIZE = 200

function normalizeAmount(value: unknown) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function latestDate(...values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))

  if (timestamps.length === 0) {
    return null
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function fetchBillings(db: ServerClient, enrollmentIds: number[]) {
  const rows: BillingRow[] = []
  for (const ids of chunk(enrollmentIds, QUERY_CHUNK_SIZE)) {
    const data = await readPaymentPages<BillingRow>((from, to) => db
      .from('enrollment_billing')
      .select('id,enrollment_id,course_id,expected_amount,discount_amount,payable_amount,tuition_exempt,status,created_at,updated_at')
      .in('enrollment_id', ids)
      .order('id', { ascending: true })
      .range(from, to))

    rows.push(...data)
  }

  return rows
}

async function fetchPayments(db: ServerClient, enrollmentIds: number[]) {
  const rows: PaymentRow[] = []
  for (const ids of chunk(enrollmentIds, QUERY_CHUNK_SIZE)) {
    const data = await readPaymentPages<PaymentRow>((from, to) => db
      .from('enrollment_payments')
      .select('id,enrollment_id,course_id,amount,status,category,method,paid_date,created_at')
      .in('enrollment_id', ids)
      .order('id', { ascending: true })
      .range(from, to))

    rows.push(...data)
  }

  return rows
}

async function fetchRefunds(db: ServerClient, paymentIds: number[]) {
  const rows: RefundRow[] = []
  for (const ids of chunk(paymentIds, QUERY_CHUNK_SIZE)) {
    const data = await readPaymentPages<RefundRow>((from, to) => db
      .from('enrollment_refunds')
      .select('id,payment_id,amount,refunded_at')
      .in('payment_id', ids)
      .order('id', { ascending: true })
      .range(from, to))

    rows.push(...data)
  }

  return rows
}

function expectedBillingStatus(
  enrollment: EnrollmentRow,
  billing: BillingRow,
  netAmount: number,
  paymentCount: number,
  refundAmount: number,
): BillingStatus {
  if (enrollment.status === 'cancelled') {
    return 'closed'
  }

  if (billing.tuition_exempt) {
    return 'exempt'
  }

  if (
    paymentCount > 0
    && netAmount <= 0
    && (refundAmount > 0 || enrollment.status === 'refunded')
  ) {
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

function createBaseIssue(input: {
  severity: PaymentIntegritySeverity
  code: PaymentIntegrityIssue['code']
  message: string
  recommendation: string
  course: CourseRow
  enrollment: EnrollmentRow
  billing: BillingRow | null
  expectedStatus: BillingStatus | null
  paymentGrossAmount: number
  refundAmount: number
  paymentCount: number
  latestActivityAt: string | null
}): PaymentIntegrityIssue {
  const netAmount = input.paymentGrossAmount - input.refundAmount

  return {
    id: `${input.code}:${input.enrollment.id}:${input.billing?.id ?? 'none'}`,
    severity: input.severity,
    code: input.code,
    message: input.message,
    recommendation: input.recommendation,
    courseId: input.course.id,
    courseName: input.course.name,
    enrollmentId: input.enrollment.id,
    studentName: input.enrollment.name,
    phone: input.enrollment.phone,
    examNumber: input.enrollment.exam_number,
    enrollmentStatus: input.enrollment.status,
    billingStatus: input.billing?.status ?? null,
    expectedBillingStatus: input.expectedStatus,
    payableAmount: input.billing?.payable_amount ?? input.course.tuition_amount,
    paymentGrossAmount: input.paymentGrossAmount,
    refundAmount: input.refundAmount,
    netAmount,
    paymentCount: input.paymentCount,
    latestActivityAt: input.latestActivityAt,
  }
}

export async function checkPaymentIntegrity(
  division: string,
  options: CheckPaymentIntegrityOptions = {},
): Promise<PaymentIntegrityReport> {
  const db = createServerClient()
  const maxEnrollments = Math.min(
    Math.max(options.maxEnrollments ?? DEFAULT_MAX_ENROLLMENTS, 1),
    MAX_ENROLLMENTS_CAP,
  )

  const courses = await readPaymentPages<CourseRow>((from, to) => {
    let courseQuery = db
      .from('courses')
      .select('id,name,status,tuition_amount')
      .eq('division', division)

    if (options.courseId) {
      courseQuery = courseQuery.eq('id', options.courseId)
    }

    return courseQuery.order('id', { ascending: true }).range(from, to)
  })

  const courseById = new Map(courses.map((course) => [course.id, course]))
  const courseIds = courses.map((course) => course.id)

  if (courseIds.length === 0) {
    return {
      division,
      checkedAt: new Date().toISOString(),
      truncated: false,
      totals: {
        coursesChecked: 0,
        enrollmentsChecked: 0,
        billingsChecked: 0,
        paymentsChecked: 0,
        refundsChecked: 0,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      issues: [],
    }
  }

  let allEnrollments: EnrollmentRow[] = []
  for (const ids of chunk(courseIds, QUERY_CHUNK_SIZE)) {
    const rows = await readPaymentPages<EnrollmentRow>((from, to) => db
      .from('enrollments')
      .select('id,course_id,student_id,name,phone,exam_number,status,created_at')
      .in('course_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to), maxEnrollments + 1)

    // Each disjoint course chunk contributes its newest candidates. Keep the
    // global newest max + 1 so the cap and overflow probe retain their meaning.
    allEnrollments.push(...rows)
    allEnrollments.sort((left, right) => (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      || right.id - left.id
    ))
    allEnrollments = allEnrollments.slice(0, maxEnrollments + 1)
  }

  const truncated = allEnrollments.length > maxEnrollments
  const enrollments = truncated ? allEnrollments.slice(0, maxEnrollments) : allEnrollments
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id)

  if (enrollmentIds.length === 0) {
    return {
      division,
      checkedAt: new Date().toISOString(),
      truncated,
      totals: {
        coursesChecked: courses.length,
        enrollmentsChecked: 0,
        billingsChecked: 0,
        paymentsChecked: 0,
        refundsChecked: 0,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      issues: [],
    }
  }

  const billingRows = await fetchBillings(db, enrollmentIds)
  const paymentRows = await fetchPayments(db, enrollmentIds)
  const refundRows = await fetchRefunds(db, paymentRows.map((payment) => payment.id))

  const billingsByEnrollmentId = new Map<number, BillingRow[]>()
  for (const billing of billingRows) {
    const rows = billingsByEnrollmentId.get(billing.enrollment_id) ?? []
    rows.push(billing)
    billingsByEnrollmentId.set(billing.enrollment_id, rows)
  }

  const paymentsByEnrollmentId = new Map<number, PaymentRow[]>()
  for (const payment of paymentRows) {
    const rows = paymentsByEnrollmentId.get(payment.enrollment_id) ?? []
    rows.push(payment)
    paymentsByEnrollmentId.set(payment.enrollment_id, rows)
  }

  const refundsByPaymentId = new Map<number, RefundRow[]>()
  for (const refund of refundRows) {
    const rows = refundsByPaymentId.get(refund.payment_id) ?? []
    rows.push(refund)
    refundsByPaymentId.set(refund.payment_id, rows)
  }

  const issues: PaymentIntegrityIssue[] = []

  for (const enrollment of enrollments) {
    const course = courseById.get(enrollment.course_id)
    if (!course) {
      continue
    }

    const enrollmentBillings = billingsByEnrollmentId.get(enrollment.id) ?? []
    const billing = enrollmentBillings[0] ?? null
    const enrollmentPayments = paymentsByEnrollmentId.get(enrollment.id) ?? []
    const activeTuitionPayments = enrollmentPayments.filter(
      (payment) => payment.category === 'tuition' && payment.status !== 'voided',
    )
    const activeFreeTuitionPaymentCount = activeTuitionPayments.filter(
      (payment) => payment.method === 'free',
    ).length
    const paymentGrossAmount = activeTuitionPayments.reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0)
    const paymentCount = activeTuitionPayments.length
    const refundAmount = activeTuitionPayments.reduce((sum, payment) => {
      const refunds = refundsByPaymentId.get(payment.id) ?? []
      return sum + refunds.reduce((refundSum, refund) => refundSum + normalizeAmount(refund.amount), 0)
    }, 0)
    const latestActivityAt = latestDate(
      enrollment.created_at,
      billing?.updated_at,
      ...enrollmentPayments.map((payment) => payment.created_at),
      ...activeTuitionPayments.flatMap((payment) => (refundsByPaymentId.get(payment.id) ?? []).map((refund) => refund.refunded_at)),
    )
    const expectedStatus = billing
      ? expectedBillingStatus(enrollment, billing, paymentGrossAmount - refundAmount, paymentCount, refundAmount)
      : null

    if (enrollmentBillings.length > 1) {
      issues.push(createBaseIssue({
        severity: 'error',
        code: 'duplicate_billing',
        message: '한 수강 등록에 청구 정보가 2개 이상 연결되어 있습니다.',
        recommendation: '중복 billing 중 실제 사용할 1건만 남기고 나머지는 DB에서 정리해야 합니다.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (!billing) {
      if (paymentCount > 0) {
        issues.push(createBaseIssue({
          severity: 'error',
          code: 'payment_without_billing',
          message: '수납 기록은 있지만 청구 정보가 없습니다.',
          recommendation: '수강생 결제 상세에서 billing 정보를 재저장하거나 수납 내역을 확인해 주세요.',
          course,
          enrollment,
          billing: null,
          expectedStatus: null,
          paymentGrossAmount,
          refundAmount,
          paymentCount,
          latestActivityAt,
        }))
      } else if (enrollment.status === 'active' && course.tuition_amount > 0) {
        issues.push(createBaseIssue({
          severity: 'warning',
          code: 'missing_billing',
          message: '유료 강좌 수강 등록에 청구 정보가 없습니다.',
          recommendation: '미납 수강이 의도된 상태인지 확인하고, 필요하면 수강생 결제 상세에서 청구 정보를 저장해 주세요.',
          course,
          enrollment,
          billing: null,
          expectedStatus: null,
          paymentGrossAmount,
          refundAmount,
          paymentCount,
          latestActivityAt,
        }))
      }

      continue
    }

    if (billing.course_id !== enrollment.course_id) {
      issues.push(createBaseIssue({
        severity: 'error',
        code: 'billing_course_mismatch',
        message: '청구 정보의 강좌 ID가 수강 등록의 강좌 ID와 다릅니다.',
        recommendation: '해당 billing row의 course_id를 수강 등록 강좌와 맞추거나 billing을 재생성해야 합니다.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    for (const payment of enrollmentPayments) {
      if (payment.course_id !== enrollment.course_id) {
        issues.push({
          ...createBaseIssue({
            severity: 'error',
            code: 'payment_course_mismatch',
            message: '수납 기록의 강좌 ID가 수강 등록의 강좌 ID와 다릅니다.',
            recommendation: '수납 기록이 잘못 연결되었는지 확인하고 course_id 또는 enrollment_id를 정리해야 합니다.',
            course,
            enrollment,
            billing,
            expectedStatus,
            paymentGrossAmount,
            refundAmount,
            paymentCount,
            latestActivityAt,
          }),
          id: `payment_course_mismatch:${enrollment.id}:${payment.id}`,
        })
      }

      const paymentRefundAmount = (refundsByPaymentId.get(payment.id) ?? [])
        .reduce((sum, refund) => sum + normalizeAmount(refund.amount), 0)
      if (
        payment.status === 'fully_refunded'
        && paymentRefundAmount < normalizeAmount(payment.amount)
      ) {
        issues.push({
          ...createBaseIssue({
            severity: 'warning',
            code: 'payment_refund_status_mismatch',
            message: '수납 상태는 전액환불인데 환불 합계가 수납액보다 작습니다.',
            recommendation: '환불 기록 누락 또는 결제 상태 동기화 누락인지 확인해 주세요.',
            course,
            enrollment,
            billing,
            expectedStatus,
            paymentGrossAmount,
            refundAmount,
            paymentCount,
            latestActivityAt,
          }),
          id: `payment_refund_status_mismatch:${enrollment.id}:${payment.id}`,
        })
      }
    }

    const calculatedPayable = billing.tuition_exempt
      ? 0
      : Math.max(billing.expected_amount - billing.discount_amount, 0)
    if (billing.discount_amount > billing.expected_amount || billing.payable_amount !== calculatedPayable) {
      issues.push(createBaseIssue({
        severity: 'error',
        code: 'billing_amount_mismatch',
        message: '청구 금액 계산값과 저장된 적용 금액이 일치하지 않습니다.',
        recommendation: '청구 정가, 할인액, 적용 금액을 다시 저장해 주세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (billing.tuition_exempt && activeFreeTuitionPaymentCount === 0 && enrollment.status !== 'cancelled') {
      const isRefundedEnrollment = enrollment.status === 'refunded'
      issues.push(createBaseIssue({
        severity: isRefundedEnrollment ? 'error' : 'warning',
        code: 'exempt_billing_without_active_free_payment',
        message: isRefundedEnrollment
          ? '수강 상태는 환불완료인데 청구 정보가 무료/면제로 남아 있습니다.'
          : '무료/면제 청구인데 활성 무료 수납 기록이 없습니다.',
        recommendation: isRefundedEnrollment
          ? '무료/면제 수납 취소 후 청구 상태가 복구되지 않은 상태일 수 있습니다. 정가/적용 금액과 환불 상태를 다시 저장해 주세요.'
          : '결제 상세에서 무료/면제 기록이 의도된 상태인지 확인하고, 필요하면 무료 수납 기록을 다시 저장해 주세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (
      enrollment.status === 'active'
      && !billing.tuition_exempt
      && billing.payable_amount > 0
      && paymentCount === 0
    ) {
      issues.push(createBaseIssue({
        severity: 'warning',
        code: 'billable_without_payment',
        message: '유료 청구가 있지만 수납 기록이 없습니다.',
        recommendation: '미납 청구가 의도된 상태인지 확인해 주세요. 등록 중 결제 저장 실패가 의심되면 수납을 다시 입력하세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (expectedStatus && billing.status !== expectedStatus) {
      const severe =
        billing.status === 'paid'
        || billing.status === 'refunded'
        || expectedStatus === 'refunded'
        || (expectedStatus === 'paid' && paymentGrossAmount - refundAmount >= billing.payable_amount)

      issues.push(createBaseIssue({
        severity: severe ? 'error' : 'warning',
        code: 'billing_status_mismatch',
        message: `청구 상태가 계산값과 다릅니다. 현재 ${billing.status}, 계산값 ${expectedStatus}.`,
        recommendation: '수강생 결제 상세를 열어 상태 재계산이 필요한지 확인해 주세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (enrollment.status === 'refunded' && paymentGrossAmount - refundAmount > 0) {
      issues.push(createBaseIssue({
        severity: 'error',
        code: 'refunded_enrollment_has_net_amount',
        message: '수강 상태는 환불완료인데 남은 수납 순액이 있습니다.',
        recommendation: '환불 누락인지, 수강 상태가 잘못 변경되었는지 확인해 주세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }

    if (
      enrollment.status === 'active'
      && paymentCount > 0
      && refundAmount >= paymentGrossAmount
      && paymentGrossAmount > 0
    ) {
      issues.push(createBaseIssue({
        severity: 'error',
        code: 'active_enrollment_fully_refunded',
        message: '수납은 전액 환불된 상태인데 수강 상태가 활성입니다.',
        recommendation: '환불 처리 후 수강 상태 동기화가 누락되었는지 확인해 주세요.',
        course,
        enrollment,
        billing,
        expectedStatus,
        paymentGrossAmount,
        refundAmount,
        paymentCount,
        latestActivityAt,
      }))
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.length - errorCount

  return {
    division,
    checkedAt: new Date().toISOString(),
    truncated,
    totals: {
      coursesChecked: courses.length,
      enrollmentsChecked: enrollments.length,
      billingsChecked: billingRows.length,
      paymentsChecked: paymentRows.length,
      refundsChecked: refundRows.length,
      issueCount: issues.length,
      errorCount,
      warningCount,
    },
    issues: issues.sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === 'error' ? -1 : 1
      }

      return (right.latestActivityAt ?? '').localeCompare(left.latestActivityAt ?? '')
    }),
  }
}
