import { createServerClient } from '@/lib/supabase/server'
import type { PaymentCategory, PaymentMethod, PaymentSettlementRow } from './types'

export type SettlementSummary = {
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
}

export type SettlementGroupKey = 'daily' | 'monthly' | 'course' | 'method'

export type SettlementGroupedRow = SettlementSummary & {
  key: string
  label: string
}

export type MonthlyCategoryStat = {
  count: number
  gross: number
  refund: number
  net: number
}

export type MonthlyMethodStat = {
  count: number
  amount: number
}

export type MonthlySettlementData = {
  month: string
  summary: SettlementSummary
  methods: Record<PaymentMethod, MonthlyMethodStat>
  categories: Record<PaymentCategory, MonthlyCategoryStat>
  dailyBreakdown: Array<{
    date: string
    count: number
    gross: number
    refund: number
    net: number
  }>
}

const EMPTY_SUMMARY: SettlementSummary = {
  grossAmount: 0,
  refundAmount: 0,
  netAmount: 0,
  paymentCount: 0,
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function normalizeSettlementRow(row: Record<string, unknown>): PaymentSettlementRow {
  return {
    paid_date: String(row.paid_date),
    course_id: Number(row.course_id),
    course_name: String(row.course_name ?? ''),
    method: row.method as PaymentMethod,
    category: row.category as PaymentCategory,
    gross_amount: toNumber(row.gross_amount),
    refund_amount: toNumber(row.refund_amount),
    net_amount: toNumber(row.net_amount),
    payment_count: toNumber(row.payment_count),
  }
}

export function summarizeSettlementRows(rows: PaymentSettlementRow[]): SettlementSummary {
  return rows.reduce((summary, row) => ({
    grossAmount: summary.grossAmount + row.gross_amount,
    refundAmount: summary.refundAmount + row.refund_amount,
    netAmount: summary.netAmount + row.net_amount,
    paymentCount: summary.paymentCount + row.payment_count,
  }), EMPTY_SUMMARY)
}

export function groupSettlementRows(
  rows: PaymentSettlementRow[],
  groupKey: SettlementGroupKey,
): SettlementGroupedRow[] {
  const grouped = new Map<string, SettlementGroupedRow>()

  for (const row of rows) {
    const key = groupKey === 'monthly'
      ? row.paid_date.slice(0, 7)
      : groupKey === 'course'
        ? String(row.course_id)
        : groupKey === 'method'
          ? row.method
          : row.paid_date
    const label = groupKey === 'course' ? row.course_name : key
    const current = grouped.get(key) ?? {
      key,
      label,
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
      paymentCount: 0,
    }

    current.grossAmount += row.gross_amount
    current.refundAmount += row.refund_amount
    current.netAmount += row.net_amount
    current.paymentCount += row.payment_count
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((left, right) => (
    groupKey === 'daily' || groupKey === 'monthly'
      ? right.key.localeCompare(left.key)
      : left.label.localeCompare(right.label, 'ko-KR')
  ))
}

export async function getPaymentSettlement(params: {
  from: string
  to: string
  courseId?: number | null
  division?: string | null
}) {
  const db = createServerClient()
  const { data, error } = await db.rpc('get_payment_settlement', {
    p_from_date: params.from,
    p_to_date: params.to,
    p_course_id: params.courseId ?? null,
    p_division: params.division ?? null,
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSettlementRow)
}

export function parseMonthParam(param: string | null | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [year, month] = param.split('-').map(Number)
    if (month >= 1 && month <= 12) {
      return { year, month }
    }
  }

  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export async function getMonthlySettlementData(
  monthParam: string | null | undefined,
  division?: string | null,
): Promise<MonthlySettlementData> {
  const { year, month } = parseMonthParam(monthParam)
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const lastDate = new Date(year, month, 0).getDate()
  const rows = await getPaymentSettlement({
    from: `${monthStr}-01`,
    to: `${monthStr}-${String(lastDate).padStart(2, '0')}`,
    division,
  })

  const summary = summarizeSettlementRows(rows)
  const dailyRows = groupSettlementRows(rows, 'daily')
  const methods = {
    card: { count: 0, amount: 0 },
    cash: { count: 0, amount: 0 },
    bank_transfer: { count: 0, amount: 0 },
    point: { count: 0, amount: 0 },
    mixed: { count: 0, amount: 0 },
    other: { count: 0, amount: 0 },
  } satisfies Record<PaymentMethod, MonthlyMethodStat>
  const categories = {
    tuition: { count: 0, gross: 0, refund: 0, net: 0 },
    textbook: { count: 0, gross: 0, refund: 0, net: 0 },
    material: { count: 0, gross: 0, refund: 0, net: 0 },
    exam_fee: { count: 0, gross: 0, refund: 0, net: 0 },
    extension: { count: 0, gross: 0, refund: 0, net: 0 },
    etc: { count: 0, gross: 0, refund: 0, net: 0 },
  } satisfies Record<PaymentCategory, MonthlyCategoryStat>

  for (const row of rows) {
    methods[row.method].count += row.payment_count
    methods[row.method].amount += row.gross_amount
    categories[row.category].count += row.payment_count
    categories[row.category].gross += row.gross_amount
    categories[row.category].refund += row.refund_amount
    categories[row.category].net += row.net_amount
  }

  return {
    month: monthStr,
    summary,
    methods,
    categories,
    dailyBreakdown: dailyRows.map((row) => ({
      date: row.key,
      count: row.paymentCount,
      gross: row.grossAmount,
      refund: row.refundAmount,
      net: row.netAmount,
    })),
  }
}
