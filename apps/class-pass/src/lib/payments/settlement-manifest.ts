import type { EnrollmentPayment, SettlementEntryConfirmation } from './types'

type ManifestRow = Record<string, string | number | null>
export type DailySettlementManifest = {
  version: 1
  payments: ManifestRow[]
  refunds: ManifestRow[]
  items: ManifestRow[]
  confirmations: ManifestRow[]
}

// PostgreSQL timestamptz has microsecond precision. Preserve the sub-millisecond
// portion while normalizing offsets so client JSON and locked SQL agree exactly.
function instant(value: string | null | undefined) {
  if (!value) return null
  const iso = new Date(value).toISOString()
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? ''
  return `${iso.slice(0, 19)}.${fraction.padEnd(6, '0').slice(0, 6)}Z`
}

function confirmationRow(entry: SettlementEntryConfirmation): ManifestRow {
  return {
    id: entry.id, entry_kind: entry.entry_kind, payment_id: entry.payment_id,
    refund_id: entry.refund_id, settlement_date: entry.settlement_date, status: entry.status,
    confirmed_at: instant(entry.confirmed_at), confirmed_by_staff_id: entry.confirmed_by_staff_id,
    canceled_at: instant(entry.canceled_at), canceled_by_staff_id: entry.canceled_by_staff_id,
    updated_at: instant(entry.updated_at),
  }
}

export function buildDailySettlementManifest(payments: EnrollmentPayment[], date: string): DailySettlementManifest {
  const manifest: DailySettlementManifest = { version: 1, payments: [], refunds: [], items: [], confirmations: [] }
  for (const payment of payments) {
    const refunds = (payment.enrollment_refunds ?? []).filter((refund) => refund.refund_date === date)
    if (payment.paid_date !== date && refunds.length === 0) continue
    manifest.payments.push({
      id: payment.id, enrollment_id: payment.enrollment_id, course_id: payment.course_id,
      amount: payment.amount, method: payment.method, status: payment.status, category: payment.category,
      paid_date: payment.paid_date, paid_at: instant(payment.paid_at), updated_at: instant(payment.updated_at),
    })
    for (const item of payment.enrollment_payment_items ?? []) {
      manifest.items.push({ id: item.id, payment_id: item.payment_id, label: item.label, amount: item.amount, sort_order: item.sort_order })
    }
    if (payment.paid_date === date && payment.settlement_confirmation?.settlement_date === date) {
      manifest.confirmations.push(confirmationRow(payment.settlement_confirmation))
    }
    for (const refund of refunds) {
      manifest.refunds.push({
        id: refund.id, payment_id: refund.payment_id, amount: refund.amount, method: refund.method,
        refund_date: refund.refund_date, refunded_at: instant(refund.refunded_at), created_at: instant(refund.created_at),
        reason_category: refund.reason_category, reason: refund.reason, memo: refund.memo,
        display_receipt_no: refund.display_receipt_no, cancel_receipt_no: refund.cancel_receipt_no,
        refund_account_last4: refund.refund_account_last4, processed_by_staff_id: refund.processed_by_staff_id,
      })
      if (refund.settlement_confirmation?.settlement_date === date) {
        manifest.confirmations.push(confirmationRow(refund.settlement_confirmation))
      }
    }
  }
  for (const rows of [manifest.payments, manifest.refunds, manifest.items, manifest.confirmations]) {
    rows.sort((left, right) => Number(left.id) - Number(right.id))
  }
  return manifest
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

export function settlementManifestsEqual(left: unknown, right: DailySettlementManifest) {
  return canonicalJson(left) === canonicalJson(right)
}

export function countPendingSettlementEntries(payments: EnrollmentPayment[], date: string) {
  const confirmed = (entry: SettlementEntryConfirmation | null | undefined) => (
    entry?.status === 'confirmed' && entry.settlement_date === date
  )
  let pending = 0
  for (const payment of payments) {
    if (payment.status === 'voided') continue
    if (payment.paid_date === date && !confirmed(payment.settlement_confirmation)) pending += 1
    for (const refund of payment.enrollment_refunds ?? []) {
      if (refund.refund_date === date && !confirmed(refund.settlement_confirmation)) pending += 1
    }
  }
  return pending
}
