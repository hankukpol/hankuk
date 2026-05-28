import * as XLSX from 'xlsx'
import * as XLSX_STYLE from 'xlsx-js-style'
import type { SettlementLedgerRow, SettlementReport } from './settlement-report'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_STATUS_LABEL,
  REFUND_METHOD_LABEL,
  REFUND_REASON_CATEGORY_LABEL,
  type EnrollmentPayment,
  type EnrollmentRefund,
  type PaymentMethod,
  type RefundMethod,
} from './types'
import { formatWon } from './format'
import { ENROLLMENT_STUDENT_TYPE_LABEL, type Course, type Enrollment } from '@/types/database'

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

function paymentDetailRows(rows: SettlementLedgerRow[]) {
  return rows.map((row) => [
    row.paymentId,
    `${row.date} ${row.time}`,
    row.enrollmentId,
    row.studentName,
    row.examNumber ?? '',
    row.phone ?? '',
    row.studentTypeLabel,
    row.courseName,
    row.seriesLabel,
    row.methodLabel,
    row.cardCompany ?? '',
    row.categoryLabel,
    row.paymentAmount,
    row.discountAmount,
    row.receiptNo,
    row.cashReceiptApprovalNo ? '발행' : row.method === 'cash' || row.method === 'bank_transfer' ? '미기록' : '대상아님',
    row.memo ?? '',
    row.createdByStaffId ?? '',
    row.status,
  ])
}

function refundDetailRows(rows: SettlementLedgerRow[]) {
  return rows.map((row) => [
    row.refundId ?? '',
    row.receiptNo,
    row.date,
    row.paymentDate,
    row.studentName,
    row.studentTypeLabel,
    row.courseName,
    row.seriesLabel,
    row.originalPaymentAmount,
    row.refundAmount,
    row.methodLabel,
    row.reasonCategoryLabel ?? '',
    row.reason ?? row.memo ?? '',
    row.cancelReceiptNo ?? '',
    row.processedByStaffId ?? '',
  ])
}

function summaryRows(report: SettlementReport, title: string) {
  return [
    [title],
    [],
    ['총매출', report.summary.grossAmount],
    ['환불', report.summary.refundAmount],
    ['순매출', report.summary.netAmount],
    ['수납건수', report.summary.paymentCount],
    ['환불건수', report.summary.refundCount],
    ['결제자수', report.summary.payerCount],
    ['환불률', `${(report.summary.refundRate * 100).toFixed(1)}%`],
    [],
    ['수납 방법', '건수', '총액', '영수증 번호 범위'],
    ...report.paymentMethods.map((method) => [
      method.label,
      method.count,
      method.grossAmount,
      method.receiptRange,
    ]),
    [],
    ['환불 방법', '건수', '환불액', '영수증 번호 범위'],
    ...report.refundMethods.map((method) => [
      method.label,
      method.count,
      method.refundAmount,
      method.receiptRange,
    ]),
    [],
    ['분류', '총액', '환불', '순액'],
    ...report.categories.map((category) => [
      category.label,
      category.grossAmount,
      category.refundAmount,
      category.netAmount,
    ]),
    [],
    ['직렬', '수납', '환불', '순액', '수납건수', '환불건수', '인원'],
    ...report.seriesRows.map((series) => [
      series.label,
      series.grossAmount,
      series.refundAmount,
      series.netAmount,
      series.paymentCount,
      series.refundCount,
      series.studentCount,
    ]),
  ]
}

function writeWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename, { compression: true })
}

type ReportPaymentColumn = 'cash' | 'card' | 'point' | 'bank_transfer'
type ReportPaymentChoice = {
  column: ReportPaymentColumn | null
  fallback: boolean
}
type StyledWorksheet = XLSX_STYLE.WorkSheet & Record<string, XLSX_STYLE.CellObject | unknown>

const REPORT_HEADERS = [
  ['월/일', '이름', 'Code', '구분', '내역 및 NO.', '결제수단', '', '', '', '카드사\n구분', '비고'],
  ['', '', '', '', '', '현금', '카드', '포인트', '계좌입금', '', ''],
]

const REPORT_COLUMN_WIDTHS = [
  { wch: 10 },
  { wch: 10 },
  { wch: 7 },
  { wch: 18 },
  { wch: 20 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 14 },
  { wch: 10 },
  { wch: 18 },
]

function reportDateLabel(date: string) {
  const [, , month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? []
  return month && day ? `${month}월 ${day}일` : date
}

function reportPaymentChoice(method: PaymentMethod | RefundMethod, amount: number): ReportPaymentChoice {
  if (method === 'cash') {
    return { column: 'cash', fallback: false }
  }

  if (method === 'card' || method === 'homepage' || method === 'card_cancel') {
    return { column: 'card', fallback: false }
  }

  if (method === 'point') {
    return { column: 'point', fallback: false }
  }

  if (method === 'bank_transfer') {
    return { column: 'bank_transfer', fallback: false }
  }

  return amount === 0
    ? { column: null, fallback: false }
    : { column: 'card', fallback: true }
}

function reportPaymentAmount(row: SettlementLedgerRow) {
  return row.kind === 'refund' ? -row.refundAmount : row.paymentAmount
}

function reportDetail(row: SettlementLedgerRow) {
  const memo = row.memo?.trim()
  const detail = memo || (row.category === 'tuition' ? '' : row.categoryLabel)
  const receiptNo = row.receiptNo ? `NO. ${row.receiptNo}` : ''

  return [detail, receiptNo].filter(Boolean).join('\n')
}

function reportMemo(row: SettlementLedgerRow, paymentChoice: ReportPaymentChoice) {
  const notes = [
    row.kind === 'refund' ? (row.reason?.trim() || row.reasonCategoryLabel || '환불') : '',
    row.cancelReceiptNo ? `취소영수증 ${row.cancelReceiptNo}` : '',
    row.cashReceiptApprovalNo ? `현금영수증 ${row.cashReceiptApprovalNo}` : '',
    paymentChoice.fallback || !paymentChoice.column ? row.methodLabel : '',
  ].filter(Boolean)

  return notes.join(' / ')
}

function reportLedgerRows(rows: SettlementLedgerRow[]) {
  const sortedRows = [...rows].sort((left, right) => {
    const occurredCompare = left.occurredAt.localeCompare(right.occurredAt)
    return occurredCompare === 0 ? left.id.localeCompare(right.id) : occurredCompare
  })
  let previousDate = ''

  return sortedRows.map((row) => {
    const amount = reportPaymentAmount(row)
    const paymentChoice = reportPaymentChoice(row.method, amount)
    const dateLabel = row.date === previousDate ? '' : reportDateLabel(row.date)
    previousDate = row.date

    return [
      dateLabel,
      row.studentName,
      row.courseReportCode ?? '',
      row.courseName,
      reportDetail(row),
      paymentChoice.column === 'cash' ? amount : '',
      paymentChoice.column === 'card' ? amount : '',
      paymentChoice.column === 'point' ? amount : '',
      paymentChoice.column === 'bank_transfer' ? amount : '',
      paymentChoice.column === 'card' ? (row.cardCompany ?? '') : '',
      reportMemo(row, paymentChoice),
    ]
  })
}

function styleReportSheet(sheet: StyledWorksheet, dataRowCount: number) {
  const headerFill = { patternType: 'solid', fgColor: { rgb: 'FFFFFF99' } }
  const border = {
    top: { style: 'thin', color: { rgb: 'FF808080' } },
    bottom: { style: 'thin', color: { rgb: 'FF808080' } },
    left: { style: 'thin', color: { rgb: 'FF808080' } },
    right: { style: 'thin', color: { rgb: 'FF808080' } },
  }
  const baseAlignment = { vertical: 'center', horizontal: 'center', wrapText: true }
  const bodyAlignment = { vertical: 'center', horizontal: 'center', wrapText: true }
  const amountAlignment = { vertical: 'center', horizontal: 'right', wrapText: true }
  const totalRows = REPORT_HEADERS.length + dataRowCount

  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },
    { s: { r: 0, c: 9 }, e: { r: 1, c: 9 } },
    { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } },
  ]
  sheet['!cols'] = REPORT_COLUMN_WIDTHS
  sheet['!rows'] = [
    { hpt: 22 },
    { hpt: 22 },
    ...Array.from({ length: dataRowCount }, () => ({ hpt: 30 })),
  ]

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
    for (let colIndex = 0; colIndex < 11; colIndex += 1) {
      const address = XLSX_STYLE.utils.encode_cell({ r: rowIndex, c: colIndex })
      const cell = (sheet[address] ?? { t: 's', v: '' }) as XLSX_STYLE.CellObject
      const isHeader = rowIndex < 2
      const isAmountColumn = colIndex >= 5 && colIndex <= 8 && rowIndex >= 2
      const isNegative = typeof cell.v === 'number' && cell.v < 0

      cell.s = {
        border,
        fill: isHeader ? headerFill : undefined,
        font: {
          name: '맑은 고딕',
          sz: isHeader ? 10 : 9,
          bold: isHeader,
          color: isNegative ? { rgb: 'FFFF0000' } : undefined,
        },
        alignment: isHeader ? baseAlignment : isAmountColumn ? amountAlignment : bodyAlignment,
        numFmt: isAmountColumn ? '#,##0' : undefined,
      }

      sheet[address] = cell
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 강좌별 정산 다운로드
// ─────────────────────────────────────────────────────────────────────────────

type CoursePaymentSummary = {
  enrollmentId: number | null
  studentName: string
  phone: string
  examNumber: string
  seriesLabel: string
  studentTypeLabel: string
  registrationDate: string
  expectedAmount: number
  discountAmount: number
  paidAmount: number
  refundedAmount: number
  netAmount: number
  paymentCount: number
  refundCount: number
  methodSummary: string
  lastPaidDate: string
  memo: string
}

function isActivePayment(payment: EnrollmentPayment): boolean {
  return payment.status !== 'voided'
}

function toKstDateOnly(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function activeRefundAmount(refunds: EnrollmentRefund[] | undefined): number {
  if (!refunds || refunds.length === 0) return 0
  return refunds.reduce((sum, refund) => sum + (refund.amount || 0), 0)
}

function describePaymentMethodMix(payment: EnrollmentPayment): string {
  if (payment.method !== 'mixed') {
    const label = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method
    return payment.card_company ? `${label}(${payment.card_company})` : label
  }
  const items = payment.enrollment_payment_items ?? []
  if (items.length === 0) {
    return PAYMENT_METHOD_LABEL.mixed
  }
  return items.map((item) => item.label || PAYMENT_METHOD_LABEL.mixed).join('·')
}

function summarizePaymentMethodMix(payments: EnrollmentPayment[]): string {
  const labels = new Set<string>()
  for (const payment of payments) {
    const mix = describePaymentMethodMix(payment)
    for (const part of mix.split('·')) {
      const trimmed = part.trim()
      if (trimmed) labels.add(trimmed)
    }
  }
  return Array.from(labels).join('·')
}

export function buildStudentLevelRows(
  payments: EnrollmentPayment[],
  enrollments: Enrollment[],
): CoursePaymentSummary[] {
  const activePayments = payments.filter(isActivePayment)
  const byEnrollmentId = new Map<number, EnrollmentPayment[]>()

  for (const payment of activePayments) {
    const enrollmentId = payment.enrollment_id
    if (enrollmentId == null) continue
    const bucket = byEnrollmentId.get(enrollmentId) ?? []
    bucket.push(payment)
    byEnrollmentId.set(enrollmentId, bucket)
  }

  const seriesLabelFromEnrollment = (enrollment: Enrollment): string => {
    if (enrollment.series?.trim()) return enrollment.series.trim()
    if (enrollment.series_group === 'career') return '경채'
    return '공채'
  }

  const summarizeOne = (
    enrollment: Enrollment | null,
    enrollmentId: number,
    paymentsForEnrollment: EnrollmentPayment[],
  ): CoursePaymentSummary => {
    const firstPayment = paymentsForEnrollment[0]
    const studentName =
      enrollment?.name?.trim() ||
      firstPayment?.enrollments?.name?.trim() ||
      ''
    const phone =
      enrollment?.phone?.trim() ||
      firstPayment?.enrollments?.phone?.trim() ||
      ''
    const examNumber =
      enrollment?.exam_number?.trim() ||
      firstPayment?.enrollments?.exam_number?.trim() ||
      ''
    const seriesLabel = enrollment
      ? seriesLabelFromEnrollment(enrollment)
      : firstPayment?.series_label_snapshot?.trim() ||
        (firstPayment?.series_group_snapshot === 'career' ? '경채' : '공채')
    const studentTypeLabel = enrollment
      ? ENROLLMENT_STUDENT_TYPE_LABEL[enrollment.student_type ?? 'general']
      : ENROLLMENT_STUDENT_TYPE_LABEL[(firstPayment?.enrollments?.student_type ?? 'general')]

    const paidAmount = paymentsForEnrollment.reduce((sum, p) => sum + (p.amount || 0), 0)
    const refundedAmount = paymentsForEnrollment.reduce(
      (sum, p) => sum + activeRefundAmount(p.enrollment_refunds),
      0,
    )
    const refundCount = paymentsForEnrollment.reduce(
      (sum, p) => sum + (p.enrollment_refunds?.length ?? 0),
      0,
    )

    // Billing snapshot은 enrollment_id 단위로 같은 값이라 첫 번째 non-null만 사용해도 됨.
    // expected_amount(원 청구액)·discount_amount는 enrollment_billing의 진실값.
    // billing이 없는 enrollment(과거 데이터 등)는 결제총액으로 fallback.
    const billing = paymentsForEnrollment.find((p) => p.enrollment_billing)?.enrollment_billing ?? null
    const expectedAmount = billing?.expected_amount ?? paidAmount
    const discountAmount = billing?.discount_amount ?? 0

    const lastPaidDate = paymentsForEnrollment
      .map((p) => p.paid_date || '')
      .filter(Boolean)
      .sort()
      .pop() ?? ''

    return {
      enrollmentId,
      studentName,
      phone,
      examNumber,
      seriesLabel,
      studentTypeLabel,
      registrationDate: toKstDateOnly(enrollment?.created_at),
      expectedAmount,
      discountAmount,
      paidAmount,
      refundedAmount,
      netAmount: paidAmount - refundedAmount,
      paymentCount: paymentsForEnrollment.length,
      refundCount,
      methodSummary: summarizePaymentMethodMix(paymentsForEnrollment),
      lastPaidDate,
      memo: enrollment?.memo?.trim() ?? '',
    }
  }

  const results: CoursePaymentSummary[] = []
  const processedEnrollmentIds = new Set<number>()

  // 1. enrollments에 있는 모든 학생을 enrollment 순서대로 처리 (미결제 포함)
  for (const enrollment of enrollments) {
    const paymentsForEnrollment = byEnrollmentId.get(enrollment.id) ?? []
    results.push(summarizeOne(enrollment, enrollment.id, paymentsForEnrollment))
    processedEnrollmentIds.add(enrollment.id)
  }

  // 2. enrollments에는 없지만 결제 기록이 있는 경우 (취소된 등록 등)
  for (const [enrollmentId, paymentsForEnrollment] of byEnrollmentId.entries()) {
    if (processedEnrollmentIds.has(enrollmentId)) continue
    results.push(summarizeOne(null, enrollmentId, paymentsForEnrollment))
  }

  return results
}

function studentLevelSheetRows(summaries: CoursePaymentSummary[]): unknown[][] {
  const header = [
    '번호',
    '이름',
    '연락처',
    '직렬',
    '학원구분',
    '등록일',
    '청구금액',
    '할인금액',
    '결제총액',
    '환불총액',
    '순액',
    '결제건수',
    '환불건수',
    '결제수단요약',
    '최근결제일',
    '비고',
  ]
  const rows: unknown[][] = [header]
  summaries.forEach((summary, index) => {
    rows.push([
      index + 1,
      summary.studentName,
      summary.phone,
      summary.seriesLabel,
      summary.studentTypeLabel,
      summary.registrationDate,
      summary.expectedAmount,
      summary.discountAmount,
      summary.paidAmount,
      summary.refundedAmount,
      summary.netAmount,
      summary.paymentCount,
      summary.refundCount,
      summary.methodSummary,
      summary.lastPaidDate,
      summary.memo,
    ])
  })
  return rows
}

function coursePaymentDetailRows(payments: EnrollmentPayment[]): unknown[][] {
  // 결제금액(parent)과 분할금액(mixed child)을 분리해서 SUM 중복 합산 방지.
  // 회계 정확성:
  //   SUM(결제금액 컬럼) = 부모 결제 합계 = 강좌 총매출 (자식 행은 빈 칸이라 미포함)
  //   SUM(분할금액 컬럼) = mixed 결제의 분할 항목 합계 (검증용, 부모 결제와 일치해야 함)
  const header = [
    '결제ID',
    '결제일',
    '시각',
    '묶음결제ID',
    '학생명',
    '응시번호',
    '연락처',
    '직렬',
    '학원구분',
    '분류',
    '결제수단',
    '결제금액',
    '분할금액',
    '카드사',
    '카드끝4',
    '할부',
    '은행',
    '입금자명',
    '계좌끝4',
    '현금영수증승인번호',
    '영수증번호',
    '결제상태',
    '메모',
  ]

  const rows: unknown[][] = [header]

  const sorted = [...payments]
    .filter(isActivePayment)
    .sort((left, right) => (left.paid_at || '').localeCompare(right.paid_at || '') || left.id - right.id)

  for (const payment of sorted) {
    const paidAt = payment.paid_at ? new Date(payment.paid_at) : null
    const time = paidAt
      ? new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(paidAt)
      : ''

    const enrollment = payment.enrollments
    const seriesLabel =
      enrollment?.series?.trim() ||
      payment.series_label_snapshot?.trim() ||
      (enrollment?.series_group === 'career' || payment.series_group_snapshot === 'career'
        ? '경채'
        : '공채')

    // 부모 행: 결제금액에 총액, 분할금액은 빈 칸
    rows.push([
      payment.id,
      payment.paid_date || '',
      time,
      payment.checkout_group_id ?? '',
      enrollment?.name ?? '',
      enrollment?.exam_number ?? '',
      enrollment?.phone ?? '',
      seriesLabel,
      ENROLLMENT_STUDENT_TYPE_LABEL[enrollment?.student_type ?? 'general'],
      PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category,
      PAYMENT_METHOD_LABEL[payment.method] ?? payment.method,
      payment.amount,
      '', // 분할금액 (mixed가 아니거나 부모 행이라 비움)
      payment.card_company ?? '',
      payment.card_last4 ?? '',
      payment.installment_months > 0 ? `${payment.installment_months}개월` : '',
      payment.bank_name ?? '',
      payment.depositor_name ?? '',
      payment.bank_account_last4 ?? '',
      payment.cash_receipt_approval_no ?? '',
      payment.display_receipt_no ?? '',
      PAYMENT_STATUS_LABEL[payment.status] ?? payment.status,
      payment.memo ?? '',
    ])

    // mixed 결제는 분할 항목을 자식 행으로 펼침 — 결제금액 컬럼은 비우고 분할금액에만 표시
    if (payment.method === 'mixed' && payment.enrollment_payment_items?.length) {
      for (const item of payment.enrollment_payment_items) {
        rows.push([
          '', '', '', '', '  ↳ ' + (item.label || '분할 항목'),
          '', '', '', '', '',
          item.label || '', // 결제수단
          '',                // 결제금액 — 비워야 SUM 중복 안 됨
          item.amount,       // 분할금액 — 여기에만 금액
          '', '', '', '', '', '', '', '', '', '',
        ])
      }
    }
  }

  return rows
}

function courseRefundDetailRows(payments: EnrollmentPayment[]): unknown[][] {
  // SUM 정확성:
  //   - SUM(환불금액) = 강좌 총환불 (회계상 합계 사용)
  //   - "원결제금액" 컬럼: 환불 대상 결제 정보 (참고용). 부분환불 여러 건 시 동일 결제ID에서 반복될 수 있어
  //     SUM 대상이 아님을 이름으로 명확히 함.
  const header = [
    '환불ID',
    '환불일',
    '대상결제ID',
    '결제일',
    '학생명',
    '연락처',
    '직렬',
    '학원구분',
    '원결제금액',
    '환불금액',
    '환불수단',
    '환불계좌끝4',
    '카드취소영수증',
    '사유분류',
    '사유메모',
    '영수증번호',
  ]

  const rows: unknown[][] = [header]

  const refunds: Array<{ payment: EnrollmentPayment; refund: EnrollmentRefund }> = []
  for (const payment of payments) {
    if (!isActivePayment(payment)) continue
    for (const refund of payment.enrollment_refunds ?? []) {
      refunds.push({ payment, refund })
    }
  }

  refunds.sort((a, b) =>
    (a.refund.refunded_at || '').localeCompare(b.refund.refunded_at || '') || a.refund.id - b.refund.id,
  )

  for (const { payment, refund } of refunds) {
    const enrollment = payment.enrollments
    const seriesLabel =
      enrollment?.series?.trim() ||
      payment.series_label_snapshot?.trim() ||
      (enrollment?.series_group === 'career' || payment.series_group_snapshot === 'career'
        ? '경채'
        : '공채')

    rows.push([
      refund.id,
      refund.refund_date || '',
      payment.id,
      payment.paid_date || '',
      enrollment?.name ?? '',
      enrollment?.phone ?? '',
      seriesLabel,
      ENROLLMENT_STUDENT_TYPE_LABEL[enrollment?.student_type ?? 'general'],
      payment.amount,
      refund.amount,
      REFUND_METHOD_LABEL[refund.method] ?? refund.method,
      refund.refund_account_last4 ?? '',
      refund.cancel_receipt_no ?? '',
      REFUND_REASON_CATEGORY_LABEL[refund.reason_category] ?? refund.reason_category,
      refund.reason ?? refund.memo ?? '',
      refund.display_receipt_no ?? '',
    ])
  }

  return rows
}

function sanitizeCourseFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'course'
}

export function downloadCourseSettlementXlsx(
  report: SettlementReport,
  payments: EnrollmentPayment[],
  course: Pick<Course, 'id' | 'name' | 'slug'>,
  enrollments: Enrollment[],
  range: { from: string; to: string },
) {
  const workbook = XLSX.utils.book_new()
  const title = `${course.name} 정산 (${range.from} ~ ${range.to})`

  appendSheet(workbook, '요약', summaryRows(report, title))
  appendSheet(workbook, '수강생별', studentLevelSheetRows(buildStudentLevelRows(payments, enrollments)))
  appendSheet(workbook, '결제명세', coursePaymentDetailRows(payments))
  appendSheet(workbook, '환불내역', courseRefundDetailRows(payments))

  const fromKey = range.from.replace(/-/g, '')
  const toKey = range.to.replace(/-/g, '')
  const slug = sanitizeCourseFilename(course.slug || course.name)
  writeWorkbook(workbook, `${slug}-settlement-${fromKey}-${toKey}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────

export function downloadDailySettlementReportXlsx(report: SettlementReport, date: string) {
  const rows = reportLedgerRows(report.ledgerRows)
  const sheet = XLSX_STYLE.utils.aoa_to_sheet([
    ...REPORT_HEADERS,
    ...rows,
  ]) as StyledWorksheet
  const workbook = XLSX_STYLE.utils.book_new()

  styleReportSheet(sheet, rows.length)
  XLSX_STYLE.utils.book_append_sheet(workbook, sheet, '보고용')
  XLSX_STYLE.writeFile(workbook, `settlement-report-${date.replace(/[^0-9]/g, '')}.xlsx`, { compression: true })
}

export function downloadDailySettlementXlsx(report: SettlementReport, date: string) {
  const workbook = XLSX.utils.book_new()
  appendSheet(workbook, '요약', summaryRows(report, `${date} 일일 정산`))
  appendSheet(workbook, '결제명세', [
    ['결제ID', '시각', '학생ID', '학생명', '응시번호', '연락처', '학원구분', '강좌', '직렬', '방법', '카드사', '분류', '결제액', '할인액', '영수증번호', '현금영수증여부', '메모', '담당직원', '결제상태'],
    ...paymentDetailRows(report.paymentRows),
  ])
  appendSheet(workbook, '환불내역', [
    ['환불ID', '영수증번호', '환불일', '결제일', '학생명', '학원구분', '강좌', '직렬', '결제액', '환불액', '환불방법', '사유분류', '사유메모', '카드취소영수증', '처리자'],
    ...refundDetailRows(report.refundRows),
  ])
  writeWorkbook(workbook, `settlement-daily-${date.replace(/-/g, '')}.xlsx`)
}

export function downloadMonthlySettlementXlsx(report: SettlementReport, month: string) {
  const workbook = XLSX.utils.book_new()
  appendSheet(workbook, '요약', [
    ...summaryRows(report, `${month} 월별 정산`),
    [],
    ['일평균 순매출', report.summary.averageDailyNet],
    ['일평균 순매출 표시', formatWon(report.summary.averageDailyNet)],
  ])
  appendSheet(workbook, '일별집계', [
    ['일자', '총액', '환불', '순액', '수납건수', '환불건수'],
    ...report.dailyRows.map((row) => [
      row.date,
      row.grossAmount,
      row.refundAmount,
      row.netAmount,
      row.paymentCount,
      row.refundCount,
    ]),
  ])
  appendSheet(workbook, '결제명세', [
    ['결제ID', '시각', '학생ID', '학생명', '응시번호', '연락처', '학원구분', '강좌', '직렬', '방법', '카드사', '분류', '결제액', '할인액', '영수증번호', '현금영수증여부', '메모', '담당직원', '결제상태'],
    ...paymentDetailRows(report.paymentRows),
  ])
  appendSheet(workbook, '환불내역', [
    ['환불ID', '영수증번호', '환불일', '결제일', '학생명', '학원구분', '강좌', '직렬', '결제액', '환불액', '환불방법', '사유분류', '사유메모', '카드취소영수증', '처리자'],
    ...refundDetailRows(report.refundRows),
  ])
  appendSheet(workbook, '강좌별', [
    ['강좌ID', '강좌명', '매출', '환불', '순액', '결제건수', '환불건수', '학생수'],
    ...report.courseRows.map((row) => [
      row.courseId,
      row.courseName,
      row.grossAmount,
      row.refundAmount,
      row.netAmount,
      row.paymentCount,
      row.refundCount,
      row.studentCount,
    ]),
  ])
  writeWorkbook(workbook, `settlement-monthly-${month.replace(/-/g, '')}.xlsx`)
}

export function downloadPaymentImportTemplate() {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['이름', '연락처', '응시번호', '생년월일', '수강료', '결제일', '결제방법', '카드사', '입금자명', '분류', '비고'],
    ['홍길동', '01012345678', '12345', '900515', 60000, '2026-05-07', '카드', '신한', '', '수강료', ''],
    ['김철수', '01098765432', '', '19950322', 2900000, '2026-05-04', '카드', 'KB', '', '수강료', '장기분납'],
    ['이영희', '01055556666', '67890', '', 60000, '2026-05-07', '현금', '', '', '수강료', ''],
    ['박계좌', '01044443333', '', '', 60000, '2026-05-07', '계좌', '', '박계좌', '수강료', ''],
  ])
  sheet['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, '수납가져오기양식')
  XLSX.writeFile(workbook, 'payment-import-template.xlsx', { compression: true })
}

export function downloadSettlementCsv(rows: SettlementLedgerRow[], filename: string) {
  const header = ['구분', '일자', '시각', '학생', '학원구분', '강좌', '직렬', '방법', '카드사', '분류', '결제액', '환불액', '순액', '영수증번호', '사유']
  const escapeCell = (value: unknown) => {
    const raw = String(value ?? '')
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
  }
  const csv = [
    header,
    ...rows.map((row) => [
      row.kind === 'payment' ? '수납' : '환불',
      row.date,
      row.time,
      row.studentName,
      row.studentTypeLabel,
      row.courseName,
      row.seriesLabel,
      row.methodLabel,
      row.cardCompany ?? '',
      row.categoryLabel,
      row.paymentAmount,
      row.refundAmount,
      row.netAmount,
      row.receiptNo,
      row.reasonCategoryLabel ?? row.reason ?? '',
    ]),
  ].map((line) => line.map(escapeCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
