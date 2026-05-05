import { createServerClient } from '@/lib/supabase/server'
import { buildSettlementReport } from './settlement-report'
import { listSettlementDetailPayments } from './service'
import type { EnrollmentPayment, PaymentMethod } from './types'

type ServerClient = ReturnType<typeof createServerClient>

export type DailySettlementEffectiveStatus = 'unconfirmed' | 'confirmed' | 'needs_review'

export type DailySettlementSnapshot = {
  gross: number
  refund: number
  net: number
  payment_count: number
  refund_count: number
  payer_count: number
  by_method: Partial<Record<PaymentMethod, number>>
  refund_by_method: Record<string, number>
}

export type DailySettlementConfirmationRecord = {
  id: number
  settlement_date: string
  division: string
  status: 'confirmed' | 'needs_review'
  confirmed_at: string
  confirmed_by_staff_id: number
  snapshot_json: DailySettlementSnapshot | null
  memo: string | null
  created_at: string
  updated_at: string
}

export type DailySettlementConfirmationView = {
  id: number
  settlementDate: string
  division: string
  status: 'confirmed' | 'needs_review'
  effectiveStatus: DailySettlementEffectiveStatus
  confirmedAt: string
  confirmedByStaffId: number
  confirmedByName: string | null
  snapshot: DailySettlementSnapshot | null
  currentSnapshot: DailySettlementSnapshot
  latestChangedAt: string | null
  snapshotChanged: boolean
  memo: string | null
}

function isDateParam(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toRecord(row: unknown): DailySettlementConfirmationRecord {
  const data = row as Record<string, unknown>
  return {
    id: Number(data.id),
    settlement_date: String(data.settlement_date),
    division: String(data.division),
    status: data.status === 'needs_review' ? 'needs_review' : 'confirmed',
    confirmed_at: String(data.confirmed_at),
    confirmed_by_staff_id: Number(data.confirmed_by_staff_id),
    snapshot_json: parseDailySettlementSnapshot(data.snapshot_json),
    memo: typeof data.memo === 'string' ? data.memo : null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  }
}

function toFiniteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseAmountMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, amount]) => [key, toFiniteNumber(amount)])
      .filter(([, amount]) => amount !== 0),
  )
}

function parseDailySettlementSnapshot(value: unknown): DailySettlementSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const data = value as Record<string, unknown>
  return {
    gross: toFiniteNumber(data.gross),
    refund: toFiniteNumber(data.refund),
    net: toFiniteNumber(data.net),
    payment_count: toFiniteNumber(data.payment_count),
    refund_count: toFiniteNumber(data.refund_count),
    payer_count: toFiniteNumber(data.payer_count),
    by_method: parseAmountMap(data.by_method) as Partial<Record<PaymentMethod, number>>,
    refund_by_method: parseAmountMap(data.refund_by_method),
  }
}

function mapsEqual(left: Record<string, number>, right: Record<string, number>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) {
      return false
    }
  }

  return true
}

function snapshotsEqual(left: DailySettlementSnapshot | null, right: DailySettlementSnapshot) {
  if (!left) {
    return true
  }

  return left.gross === right.gross
    && left.refund === right.refund
    && left.net === right.net
    && left.payment_count === right.payment_count
    && left.refund_count === right.refund_count
    && left.payer_count === right.payer_count
    && mapsEqual(left.by_method as Record<string, number>, right.by_method as Record<string, number>)
    && mapsEqual(left.refund_by_method, right.refund_by_method)
}

export function buildDailySettlementSnapshot(payments: EnrollmentPayment[], date: string): DailySettlementSnapshot {
  const report = buildSettlementReport(payments, date, date)
  const byMethod: Partial<Record<PaymentMethod, number>> = {}
  const refundByMethod: Record<string, number> = {}

  for (const method of report.paymentMethods) {
    if (method.grossAmount !== 0) {
      byMethod[method.key as PaymentMethod] = method.grossAmount
    }
  }

  for (const method of report.refundMethods) {
    if (method.refundAmount !== 0) {
      refundByMethod[method.key] = method.refundAmount
    }
  }

  return {
    gross: report.summary.grossAmount,
    refund: report.summary.refundAmount,
    net: report.summary.netAmount,
    payment_count: report.summary.paymentCount,
    refund_count: report.summary.refundCount,
    payer_count: report.summary.payerCount,
    by_method: byMethod,
    refund_by_method: refundByMethod,
  }
}

function collectLatestChangedAt(payments: EnrollmentPayment[], date: string, confirmedAt: string) {
  let latest: string | null = null

  const mark = (value: string | null | undefined) => {
    if (!value || value <= confirmedAt) {
      return
    }

    if (!latest || value > latest) {
      latest = value
    }
  }

  for (const payment of payments) {
    if (payment.paid_date === date) {
      mark(payment.updated_at)
    }

    for (const refund of payment.enrollment_refunds ?? []) {
      if (refund.refund_date === date) {
        mark(refund.created_at)
        mark(refund.refunded_at)
      }
    }
  }

  return latest
}

async function getOperatorDisplayName(db: ServerClient, actorId: number) {
  if (!Number.isInteger(actorId) || actorId <= 0) {
    return null
  }

  const accountResult = await db
    .from('operator_accounts')
    .select('display_name')
    .eq('id', actorId)
    .maybeSingle()

  if (!accountResult.error && accountResult.data?.display_name) {
    return String(accountResult.data.display_name)
  }

  const membershipResult = await db
    .from('operator_memberships')
    .select('operator_accounts(display_name)')
    .eq('id', actorId)
    .maybeSingle()

  const operatorAccounts = membershipResult.data?.operator_accounts as { display_name?: string } | null | undefined
  return operatorAccounts?.display_name ? String(operatorAccounts.display_name) : null
}

export async function getDailySettlementConfirmation(date: string, division: string) {
  if (!isDateParam(date)) {
    throw new Error('정산일 형식이 올바르지 않습니다.')
  }

  const db = createServerClient()
  const payments = await listSettlementDetailPayments({ from: date, to: date }, division)
  const currentSnapshot = buildDailySettlementSnapshot(payments, date)
  const { data, error } = await db
    .from('daily_settlement_confirmations')
    .select('*')
    .eq('settlement_date', date)
    .eq('division', division)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return {
      division,
      settlementDate: date,
      effectiveStatus: 'unconfirmed' as const,
      confirmation: null,
      currentSnapshot,
      latestChangedAt: null,
      snapshotChanged: false,
    }
  }

  const record = toRecord(data)
  const latestChangedAt = collectLatestChangedAt(payments, date, record.confirmed_at)
  const snapshotChanged = !snapshotsEqual(record.snapshot_json, currentSnapshot)
  const confirmedByName = await getOperatorDisplayName(db, record.confirmed_by_staff_id)
  const effectiveStatus: DailySettlementEffectiveStatus = latestChangedAt || snapshotChanged ? 'needs_review' : record.status
  const confirmation: DailySettlementConfirmationView = {
    id: record.id,
    settlementDate: record.settlement_date,
    division: record.division,
    status: record.status,
    effectiveStatus,
    confirmedAt: record.confirmed_at,
    confirmedByStaffId: record.confirmed_by_staff_id,
    confirmedByName,
    snapshot: record.snapshot_json,
    currentSnapshot,
    latestChangedAt,
    snapshotChanged,
    memo: record.memo,
  }

  return {
    division,
    settlementDate: date,
    effectiveStatus,
    confirmation,
    currentSnapshot,
    latestChangedAt,
    snapshotChanged,
  }
}

export async function confirmDailySettlement(input: {
  date: string
  division: string
  actorStaffId: number
  memo?: string | null
}) {
  if (!isDateParam(input.date)) {
    throw new Error('정산일 형식이 올바르지 않습니다.')
  }

  if (!Number.isInteger(input.actorStaffId) || input.actorStaffId <= 0) {
    throw new Error('정산 확인자를 확인하지 못했습니다.')
  }

  const db = createServerClient()
  const payments = await listSettlementDetailPayments({ from: input.date, to: input.date }, input.division)
  const snapshot = buildDailySettlementSnapshot(payments, input.date)
  const confirmedAt = new Date().toISOString()
  const { data, error } = await db
    .from('daily_settlement_confirmations')
    .upsert({
      settlement_date: input.date,
      division: input.division,
      status: 'confirmed',
      confirmed_at: confirmedAt,
      confirmed_by_staff_id: input.actorStaffId,
      snapshot_json: snapshot,
      memo: input.memo?.trim() || null,
    }, { onConflict: 'settlement_date,division' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  const record = toRecord(data)
  const confirmedByName = await getOperatorDisplayName(db, record.confirmed_by_staff_id)

  return {
    division: input.division,
    settlementDate: input.date,
    effectiveStatus: 'confirmed' as const,
    confirmation: {
      id: record.id,
      settlementDate: record.settlement_date,
      division: record.division,
      status: record.status,
      effectiveStatus: 'confirmed' as const,
      confirmedAt: record.confirmed_at,
      confirmedByStaffId: record.confirmed_by_staff_id,
      confirmedByName,
      snapshot: record.snapshot_json,
      currentSnapshot: snapshot,
      latestChangedAt: null,
      snapshotChanged: false,
      memo: record.memo,
    },
    currentSnapshot: snapshot,
    latestChangedAt: null,
    snapshotChanged: false,
  }
}
