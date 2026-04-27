import * as XLSX from 'xlsx'
import type { SettlementLedgerRow, SettlementReport } from './settlement-report'
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
    row.courseName,
    row.seriesLabel,
    row.methodLabel,
    row.categoryLabel,
    row.paymentAmount,
    row.discountAmount,
    row.receiptNo,
    row.cashReceiptApprovalNo ? '발행' : row.method === 'cash' || row.method === 'bank_transfer' ? '미기록' : '대상아님',
    row.memo ?? '',
    '',
    row.status,
  ])
}

function refundDetailRows(rows: SettlementLedgerRow[]) {
  return rows.map((row) => [
    row.refundId ?? '',
    row.date,
    row.paymentDate,
    row.studentName,
    row.courseName,
    row.seriesLabel,
    row.originalPaymentAmount,
    row.refundAmount,
    row.methodLabel,
    row.reasonCategoryLabel ?? '',
    row.reason ?? row.memo ?? '',
    row.cancelReceiptNo ?? '',
    '',
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

export function downloadDailySettlementXlsx(report: SettlementReport, date: string) {
  const workbook = XLSX.utils.book_new()
  appendSheet(workbook, '요약', summaryRows(report, `${date} 일일 정산`))
  appendSheet(workbook, '결제명세', [
    ['결제ID', '시각', '학생ID', '학생명', '응시번호', '연락처', '강좌', '직렬', '방법', '분류', '결제액', '할인액', '영수증번호', '현금영수증여부', '메모', '담당직원', '결제상태'],
    ...paymentDetailRows(report.paymentRows),
  ])
  appendSheet(workbook, '환불내역', [
    ['환불ID', '환불일', '결제일', '학생명', '강좌', '직렬', '결제액', '환불액', '환불방법', '사유분류', '사유메모', '카드취소영수증', '처리자'],
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
    ['결제ID', '시각', '학생ID', '학생명', '응시번호', '연락처', '강좌', '직렬', '방법', '분류', '결제액', '할인액', '영수증번호', '현금영수증여부', '메모', '담당직원', '결제상태'],
    ...paymentDetailRows(report.paymentRows),
  ])
  appendSheet(workbook, '환불내역', [
    ['환불ID', '환불일', '결제일', '학생명', '강좌', '직렬', '결제액', '환불액', '환불방법', '사유분류', '사유메모', '카드취소영수증', '처리자'],
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

export function downloadSettlementCsv(rows: SettlementLedgerRow[], filename: string) {
  const header = ['구분', '일자', '시각', '학생', '강좌', '직렬', '방법', '분류', '결제액', '환불액', '순액', '영수증번호', '사유']
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
      row.courseName,
      row.seriesLabel,
      row.methodLabel,
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
