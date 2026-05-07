import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  REFUND_METHOD_LABEL,
  type EnrollmentPayment,
  type EnrollmentRefund,
  type PaymentCategory,
  type PaymentMethod,
  type RefundMethod,
} from './types'
import { reasonCategoryLabel } from './format'
import {
  ENROLLMENT_STUDENT_TYPE_LABEL,
  type BranchSeriesGroup,
  type EnrollmentStudentType,
} from '@/types/database'

export type SettlementEventKind = 'payment' | 'refund'
export type SettlementFilterKind = 'all' | 'payment' | 'refund'
export type SettlementCategoryGroup = 'tuition' | 'textbook' | 'other'
export type SettlementSeriesFilter = {
  group?: BranchSeriesGroup | null
  label?: string | null
}

export type SettlementLedgerRow = {
  id: string
  kind: SettlementEventKind
  occurredAt: string
  date: string
  time: string
  paymentDate: string
  paymentId: number
  checkoutGroupId: string | null
  refundId: number | null
  enrollmentId: number
  studentName: string
  examNumber: string | null
  phone: string | null
  studentType: EnrollmentStudentType
  studentTypeLabel: string
  courseId: number
  courseName: string
  courseReportCode: string | null
  seriesGroup: BranchSeriesGroup
  seriesLabel: string
  method: PaymentMethod | RefundMethod
  methodLabel: string
  originalPaymentMethod: PaymentMethod
  originalPaymentMethodLabel: string
  category: PaymentCategory
  categoryLabel: string
  paymentAmount: number
  originalPaymentAmount: number
  discountAmount: number
  refundAmount: number
  netAmount: number
  receiptNo: string
  cardCompany: string | null
  cashReceiptApprovalNo: string | null
  createdByStaffId: number | null
  processedByStaffId: number | null
  reasonCategory: string | null
  reasonCategoryLabel: string | null
  reason: string | null
  memo: string | null
  status: string
  cancelReceiptNo: string | null
  settlementConfirmedAt: string | null
  settlementConfirmedByStaffId: number | null
}

export type SettlementMethodSummary = {
  key: string
  label: string
  count: number
  grossAmount: number
  refundAmount: number
  netAmount: number
  receiptRange: string
}

export type SettlementCategorySummary = {
  key: SettlementCategoryGroup
  label: string
  grossAmount: number
  refundAmount: number
  netAmount: number
}

export type SettlementDailySummary = {
  date: string
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
  refundCount: number
  payerCount: number
}

export type SettlementCourseSummary = {
  courseId: number
  courseName: string
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
  refundCount: number
  studentCount: number
}

export type SettlementSeriesSummary = {
  key: string
  group: BranchSeriesGroup
  label: string
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
  refundCount: number
  studentCount: number
}

export type SettlementReport = {
  range: {
    from: string
    to: string
  }
  summary: {
    grossAmount: number
    refundAmount: number
    netAmount: number
    paymentCount: number
    refundCount: number
    payerCount: number
    averageDailyNet: number
    refundRate: number
  }
  paymentMethods: SettlementMethodSummary[]
  refundMethods: SettlementMethodSummary[]
  categories: SettlementCategorySummary[]
  seriesGroups: SettlementSeriesSummary[]
  seriesRows: SettlementSeriesSummary[]
  dailyRows: SettlementDailySummary[]
  courseRows: SettlementCourseSummary[]
  ledgerRows: SettlementLedgerRow[]
  paymentRows: SettlementLedgerRow[]
  refundRows: SettlementLedgerRow[]
}

const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['card', 'homepage', 'cash', 'bank_transfer', 'point', 'other', 'free']
const REFUND_METHOD_ORDER: RefundMethod[] = ['card_cancel', 'cash', 'bank_transfer']
const CATEGORY_GROUP_LABEL: Record<SettlementCategoryGroup, string> = {
  tuition: '강좌료',
  textbook: '교재비',
  other: '기타',
}

function inDateRange(date: string | null | undefined, from: string, to: string) {
  return Boolean(date && date >= from && date <= to)
}

function toKstDate(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function toKstTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function daysInclusive(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00+09:00`)
  const toDate = new Date(`${to}T00:00:00+09:00`)
  const diff = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  return Math.max(diff, 1)
}

function receiptNo(id: number, prefix = '#') {
  return `${prefix}${String(id).padStart(3, '0')}`
}

function receiptRangeFromValues(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'ko-KR', { numeric: true }))

  if (normalized.length === 0) {
    return '-'
  }

  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  return first === last ? first : `${first}~${last}`
}

function categoryGroup(category: PaymentCategory): SettlementCategoryGroup {
  if (category === 'tuition') {
    return 'tuition'
  }

  if (category === 'textbook') {
    return 'textbook'
  }

  return 'other'
}

function getPaymentRefundTotal(payment: EnrollmentPayment) {
  return (payment.enrollment_refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0)
}

function getSettlementConfirmedAt(entry: Pick<EnrollmentPayment, 'settlement_confirmation'> | EnrollmentRefund) {
  return entry.settlement_confirmation?.status === 'confirmed'
    ? entry.settlement_confirmation.confirmed_at
    : null
}

function getSettlementConfirmedByStaffId(entry: Pick<EnrollmentPayment, 'settlement_confirmation'> | EnrollmentRefund) {
  return entry.settlement_confirmation?.status === 'confirmed'
    ? entry.settlement_confirmation.confirmed_by_staff_id
    : null
}

function getStudentName(payment: EnrollmentPayment) {
  return payment.enrollments?.name ?? `수강생 #${payment.enrollment_id}`
}

function getCourseName(payment: EnrollmentPayment) {
  return payment.courses?.name ?? `강좌 #${payment.course_id}`
}

function getCourseReportCode(payment: EnrollmentPayment) {
  return payment.courses?.settlement_report_code?.trim() || null
}

function getPaymentSeriesMeta(payment: EnrollmentPayment): { group: BranchSeriesGroup; label: string } {
  const group = payment.series_group_snapshot ?? payment.enrollments?.series_group ?? 'public'
  const fallbackLabel = group === 'career' ? '경채' : '공채'
  return {
    group,
    label: payment.series_label_snapshot?.trim() || payment.enrollments?.series?.trim() || fallbackLabel,
  }
}

function getPaymentStudentType(payment: EnrollmentPayment): EnrollmentStudentType {
  return payment.enrollments?.student_type ?? 'general'
}

function getPaymentDiscountAmount(payment: EnrollmentPayment) {
  return payment.category === 'tuition'
    ? Number(payment.enrollment_billing?.discount_amount ?? 0)
    : 0
}

function matchesSeriesFilter(row: SettlementLedgerRow, filter?: SettlementSeriesFilter) {
  if (!filter?.group && !filter?.label) {
    return true
  }

  if (filter.group && row.seriesGroup !== filter.group) {
    return false
  }

  if (filter.label && row.seriesLabel !== filter.label) {
    return false
  }

  return true
}

function createPaymentRow(payment: EnrollmentPayment): SettlementLedgerRow {
  const series = getPaymentSeriesMeta(payment)
  const studentType = getPaymentStudentType(payment)
  return {
    id: `payment-${payment.id}`,
    kind: 'payment',
    occurredAt: payment.paid_at,
    date: payment.paid_date || toKstDate(payment.paid_at),
    time: toKstTime(payment.paid_at),
    paymentDate: payment.paid_date || toKstDate(payment.paid_at),
    paymentId: payment.id,
    checkoutGroupId: payment.checkout_group_id ?? null,
    refundId: null,
    enrollmentId: payment.enrollment_id,
    studentName: getStudentName(payment),
    examNumber: payment.enrollments?.exam_number ?? null,
    phone: payment.enrollments?.phone ?? null,
    studentType,
    studentTypeLabel: ENROLLMENT_STUDENT_TYPE_LABEL[studentType],
    courseId: payment.course_id,
    courseName: getCourseName(payment),
    courseReportCode: getCourseReportCode(payment),
    seriesGroup: series.group,
    seriesLabel: series.label,
    method: payment.method,
    methodLabel: PAYMENT_METHOD_LABEL[payment.method] ?? payment.method,
    originalPaymentMethod: payment.method,
    originalPaymentMethodLabel: PAYMENT_METHOD_LABEL[payment.method] ?? payment.method,
    category: payment.category,
    categoryLabel: PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category,
    paymentAmount: payment.amount,
    originalPaymentAmount: payment.amount,
    discountAmount: getPaymentDiscountAmount(payment),
    refundAmount: 0,
    netAmount: payment.amount,
    receiptNo: payment.display_receipt_no ?? receiptNo(payment.id),
    cardCompany: payment.card_company,
    cashReceiptApprovalNo: payment.cash_receipt_approval_no,
    createdByStaffId: payment.created_by_staff_id,
    processedByStaffId: null,
    reasonCategory: null,
    reasonCategoryLabel: null,
    reason: null,
    memo: payment.memo,
    status: payment.status,
    cancelReceiptNo: null,
    settlementConfirmedAt: getSettlementConfirmedAt(payment),
    settlementConfirmedByStaffId: getSettlementConfirmedByStaffId(payment),
  }
}

function createRefundRow(payment: EnrollmentPayment, refund: EnrollmentRefund): SettlementLedgerRow {
  const series = getPaymentSeriesMeta(payment)
  const studentType = getPaymentStudentType(payment)
  return {
    id: `refund-${refund.id}`,
    kind: 'refund',
    occurredAt: refund.refunded_at,
    date: refund.refund_date || toKstDate(refund.refunded_at),
    time: toKstTime(refund.refunded_at),
    paymentDate: payment.paid_date || toKstDate(payment.paid_at),
    paymentId: payment.id,
    checkoutGroupId: payment.checkout_group_id ?? null,
    refundId: refund.id,
    enrollmentId: payment.enrollment_id,
    studentName: getStudentName(payment),
    examNumber: payment.enrollments?.exam_number ?? null,
    phone: payment.enrollments?.phone ?? null,
    studentType,
    studentTypeLabel: ENROLLMENT_STUDENT_TYPE_LABEL[studentType],
    courseId: payment.course_id,
    courseName: getCourseName(payment),
    courseReportCode: getCourseReportCode(payment),
    seriesGroup: series.group,
    seriesLabel: series.label,
    method: refund.method,
    methodLabel: REFUND_METHOD_LABEL[refund.method] ?? refund.method,
    originalPaymentMethod: payment.method,
    originalPaymentMethodLabel: PAYMENT_METHOD_LABEL[payment.method] ?? payment.method,
    category: payment.category,
    categoryLabel: PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category,
    paymentAmount: 0,
    originalPaymentAmount: payment.amount,
    discountAmount: 0,
    refundAmount: refund.amount,
    netAmount: -refund.amount,
    receiptNo: refund.display_receipt_no ?? receiptNo(refund.id, 'R#'),
    cardCompany: payment.card_company,
    cashReceiptApprovalNo: null,
    createdByStaffId: payment.created_by_staff_id,
    processedByStaffId: refund.processed_by_staff_id,
    reasonCategory: refund.reason_category,
    reasonCategoryLabel: reasonCategoryLabel(refund.reason_category),
    reason: refund.reason,
    memo: refund.memo,
    status: 'refunded',
    cancelReceiptNo: refund.cancel_receipt_no,
    settlementConfirmedAt: getSettlementConfirmedAt(refund),
    settlementConfirmedByStaffId: getSettlementConfirmedByStaffId(refund),
  }
}

function ensureMethodSummary(
  summaries: Map<string, SettlementMethodSummary & { receiptNos: string[] }>,
  key: string,
  label: string,
) {
  const current = summaries.get(key) ?? {
    key,
    label,
    count: 0,
    grossAmount: 0,
    refundAmount: 0,
    netAmount: 0,
    receiptRange: '-',
    receiptNos: [],
  }
  summaries.set(key, current)
  return current
}

function normalizeMethodSummaries(
  summaries: Map<string, SettlementMethodSummary & { receiptNos: string[] }>,
  order: string[],
) {
  const orderedKeys = [
    ...order,
    ...Array.from(summaries.keys()).filter((key) => !order.includes(key)),
  ]

  return orderedKeys.map((key) => {
    const summary = summaries.get(key) ?? {
      key,
      label: key in PAYMENT_METHOD_LABEL
        ? PAYMENT_METHOD_LABEL[key as PaymentMethod]
        : REFUND_METHOD_LABEL[key as RefundMethod] ?? key,
      count: 0,
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
      receiptRange: '-',
      receiptNos: [],
    }

    return {
      key: summary.key,
      label: summary.label,
      count: summary.count,
      grossAmount: summary.grossAmount,
      refundAmount: summary.refundAmount,
      netAmount: summary.netAmount,
      receiptRange: receiptRangeFromValues(summary.receiptNos),
    }
  })
}

function ensureSeriesSummary(
  summaries: Map<string, SettlementSeriesSummary & { studentIds: Set<number> }>,
  key: string,
  group: BranchSeriesGroup,
  label: string,
) {
  const current = summaries.get(key) ?? {
    key,
    group,
    label,
    grossAmount: 0,
    refundAmount: 0,
    netAmount: 0,
    paymentCount: 0,
    refundCount: 0,
    studentCount: 0,
    studentIds: new Set<number>(),
  }
  summaries.set(key, current)
  return current
}

function normalizeSeriesSummaries(summaries: Map<string, SettlementSeriesSummary & { studentIds: Set<number> }>) {
  return Array.from(summaries.values())
    .map((row) => ({
      key: row.key,
      group: row.group,
      label: row.label,
      grossAmount: row.grossAmount,
      refundAmount: row.refundAmount,
      netAmount: row.netAmount,
      paymentCount: row.paymentCount,
      refundCount: row.refundCount,
      studentCount: row.studentCount,
    }))
    .sort((left, right) => {
      if (left.group !== right.group) {
        return left.group === 'public' ? -1 : 1
      }
      return right.netAmount - left.netAmount || left.label.localeCompare(right.label)
    })
}

export function buildSettlementReport(
  payments: EnrollmentPayment[],
  from: string,
  to: string,
  seriesFilter?: SettlementSeriesFilter,
): SettlementReport {
  const activePayments = payments.filter((payment) => payment.status !== 'voided')
  const paymentRows = activePayments
    .filter((payment) => inDateRange(payment.paid_date || toKstDate(payment.paid_at), from, to))
    .map(createPaymentRow)
    .filter((row) => matchesSeriesFilter(row, seriesFilter))
  const refundRows = activePayments.flatMap((payment) => (
    (payment.enrollment_refunds ?? [])
      .filter((refund) => inDateRange(refund.refund_date || toKstDate(refund.refunded_at), from, to))
      .map((refund) => createRefundRow(payment, refund))
  )).filter((row) => matchesSeriesFilter(row, seriesFilter))
  const ledgerRows = [...paymentRows, ...refundRows].sort((left, right) => {
    const occurredCompare = right.occurredAt.localeCompare(left.occurredAt)
    return occurredCompare === 0 ? right.id.localeCompare(left.id) : occurredCompare
  })

  const grossAmount = paymentRows.reduce((sum, row) => sum + row.paymentAmount, 0)
  const refundAmount = refundRows.reduce((sum, row) => sum + row.refundAmount, 0)
  const payerIds = new Set(paymentRows.map((row) => row.enrollmentId))
  const paymentMethodMap = new Map<string, SettlementMethodSummary & { receiptNos: string[] }>()
  const refundMethodMap = new Map<string, SettlementMethodSummary & { receiptNos: string[] }>()
  const categoryMap = new Map<SettlementCategoryGroup, SettlementCategorySummary>()
  const dailyMap = new Map<string, SettlementDailySummary & { payerIds: Set<number> }>()
  const courseMap = new Map<number, SettlementCourseSummary & { studentIds: Set<number> }>()
  const seriesGroupMap = new Map<string, SettlementSeriesSummary & { studentIds: Set<number> }>()
  const seriesDetailMap = new Map<string, SettlementSeriesSummary & { studentIds: Set<number> }>()

  for (const row of paymentRows) {
    const methodSummary = ensureMethodSummary(paymentMethodMap, row.method, row.methodLabel)
    methodSummary.count += 1
    methodSummary.grossAmount += row.paymentAmount
    methodSummary.netAmount += row.netAmount
    methodSummary.receiptNos.push(row.receiptNo)
  }

  for (const row of refundRows) {
    const methodSummary = ensureMethodSummary(refundMethodMap, row.method, row.methodLabel)
    methodSummary.count += 1
    methodSummary.refundAmount += row.refundAmount
    methodSummary.netAmount += row.netAmount
    methodSummary.receiptNos.push(row.receiptNo)
  }

  for (const group of Object.keys(CATEGORY_GROUP_LABEL) as SettlementCategoryGroup[]) {
    categoryMap.set(group, {
      key: group,
      label: CATEGORY_GROUP_LABEL[group],
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
    })
  }

  for (const row of paymentRows) {
    const summary = categoryMap.get(categoryGroup(row.category))
    if (summary) {
      summary.grossAmount += row.paymentAmount
      summary.netAmount += row.netAmount
    }
  }

  for (const row of refundRows) {
    const summary = categoryMap.get(categoryGroup(row.category))
    if (summary) {
      summary.refundAmount += row.refundAmount
      summary.netAmount += row.netAmount
    }
  }

  for (const row of ledgerRows) {
    const daily = dailyMap.get(row.date) ?? {
      date: row.date,
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
      paymentCount: 0,
      refundCount: 0,
      payerCount: 0,
      payerIds: new Set<number>(),
    }
    daily.grossAmount += row.paymentAmount
    daily.refundAmount += row.refundAmount
    daily.netAmount += row.netAmount
    daily.paymentCount += row.kind === 'payment' ? 1 : 0
    daily.refundCount += row.kind === 'refund' ? 1 : 0
    if (row.kind === 'payment') {
      daily.payerIds.add(row.enrollmentId)
    }
    daily.payerCount = daily.payerIds.size
    dailyMap.set(row.date, daily)

    const course = courseMap.get(row.courseId) ?? {
      courseId: row.courseId,
      courseName: row.courseName,
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
      paymentCount: 0,
      refundCount: 0,
      studentCount: 0,
      studentIds: new Set<number>(),
    }
    course.grossAmount += row.paymentAmount
    course.refundAmount += row.refundAmount
    course.netAmount += row.netAmount
    course.paymentCount += row.kind === 'payment' ? 1 : 0
    course.refundCount += row.kind === 'refund' ? 1 : 0
    course.studentIds.add(row.enrollmentId)
    course.studentCount = course.studentIds.size
    courseMap.set(row.courseId, course)

    const groupLabel = row.seriesGroup === 'career' ? '경채' : '공채'
    const seriesGroup = ensureSeriesSummary(
      seriesGroupMap,
      `group:${row.seriesGroup}`,
      row.seriesGroup,
      groupLabel,
    )
    seriesGroup.grossAmount += row.paymentAmount
    seriesGroup.refundAmount += row.refundAmount
    seriesGroup.netAmount += row.netAmount
    seriesGroup.paymentCount += row.kind === 'payment' ? 1 : 0
    seriesGroup.refundCount += row.kind === 'refund' ? 1 : 0
    seriesGroup.studentIds.add(row.enrollmentId)
    seriesGroup.studentCount = seriesGroup.studentIds.size

    const seriesDetail = ensureSeriesSummary(
      seriesDetailMap,
      `${row.seriesGroup}:${row.seriesLabel}`,
      row.seriesGroup,
      row.seriesLabel,
    )
    seriesDetail.grossAmount += row.paymentAmount
    seriesDetail.refundAmount += row.refundAmount
    seriesDetail.netAmount += row.netAmount
    seriesDetail.paymentCount += row.kind === 'payment' ? 1 : 0
    seriesDetail.refundCount += row.kind === 'refund' ? 1 : 0
    seriesDetail.studentIds.add(row.enrollmentId)
    seriesDetail.studentCount = seriesDetail.studentIds.size
  }

  return {
    range: { from, to },
    summary: {
      grossAmount,
      refundAmount,
      netAmount: grossAmount - refundAmount,
      paymentCount: paymentRows.length,
      refundCount: refundRows.length,
      payerCount: payerIds.size,
      averageDailyNet: Math.round((grossAmount - refundAmount) / daysInclusive(from, to)),
      refundRate: grossAmount > 0 ? refundAmount / grossAmount : 0,
    },
    paymentMethods: normalizeMethodSummaries(paymentMethodMap, PAYMENT_METHOD_ORDER),
    refundMethods: normalizeMethodSummaries(refundMethodMap, REFUND_METHOD_ORDER),
    categories: Array.from(categoryMap.values()),
    seriesGroups: normalizeSeriesSummaries(seriesGroupMap),
    seriesRows: normalizeSeriesSummaries(seriesDetailMap),
    dailyRows: Array.from(dailyMap.values())
      .map((row) => ({
        date: row.date,
        grossAmount: row.grossAmount,
        refundAmount: row.refundAmount,
        netAmount: row.netAmount,
        paymentCount: row.paymentCount,
        refundCount: row.refundCount,
        payerCount: row.payerCount,
      }))
      .sort((left, right) => right.date.localeCompare(left.date)),
    courseRows: Array.from(courseMap.values())
      .map((row) => ({
        courseId: row.courseId,
        courseName: row.courseName,
        grossAmount: row.grossAmount,
        refundAmount: row.refundAmount,
        netAmount: row.netAmount,
        paymentCount: row.paymentCount,
        refundCount: row.refundCount,
        studentCount: row.studentCount,
      }))
      .sort((left, right) => right.netAmount - left.netAmount),
    ledgerRows,
    paymentRows,
    refundRows,
  }
}

export function getPaymentRefundTotalForSettlement(payment: EnrollmentPayment) {
  return getPaymentRefundTotal(payment)
}
