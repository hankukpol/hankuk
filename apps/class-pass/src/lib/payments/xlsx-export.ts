import * as XLSX from 'xlsx'
import * as XLSX_STYLE from 'xlsx-js-style'
import type { SettlementLedgerRow, SettlementReport } from './settlement-report'
import type { PaymentMethod, RefundMethod } from './types'
import { formatWon } from './format'

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
