import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { beforeEach, describe, it, type TestContext } from 'node:test'
import type { EnrollmentPayment, SettlementEntryConfirmation } from '../../src/lib/payments/types'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const date = '2026-09-05'
const timestamp = '2026-09-05T01:00:00.000Z'
const emptyManifest = { version: 1, payments: [], refunds: [], items: [], confirmations: [] }
const state = {
  payments: [] as EnrollmentPayment[],
  writes: [] as Array<{ kind: string; name?: string; args: Record<string, unknown> }>,
  rpcError: null as { code: string; message: string } | null,
  displayNameError: false,
}

function confirmedEntry(): SettlementEntryConfirmation {
  return {
    id: 1, division: 'police', entry_kind: 'payment', payment_id: 1, refund_id: null,
    settlement_date: date, status: 'confirmed', confirmed_at: timestamp,
    confirmed_by_staff_id: 7, canceled_at: null, canceled_by_staff_id: null,
    created_at: timestamp, updated_at: timestamp,
  }
}

function payment(confirmed = false): EnrollmentPayment {
  return {
    id: 1, enrollment_id: 1, course_id: 1, amount: 10000, method: 'card', status: 'paid',
    category: 'tuition', paid_at: timestamp, paid_date: date, memo: null, card_last4: null,
    installment_months: 0, bank_name: null, bank_account_last4: null, depositor_name: null,
    cash_receipt_approval_no: null, display_receipt_no: null, card_company: null,
    checkout_group_id: null, series_option_id_snapshot: null, series_group_snapshot: null,
    series_label_snapshot: null, created_by_staff_id: null, created_at: timestamp,
    updated_at: timestamp, enrollment_refunds: [], enrollment_payment_items: [],
    settlement_confirmation: confirmed ? confirmedEntry() : null,
  }
}

function confirmationRecord(snapshot: unknown) {
  return {
    id: 1, division: 'police', settlement_date: date, status: 'confirmed',
    confirmed_at: timestamp, confirmed_by_staff_id: 7, snapshot_json: snapshot,
    memo: null, created_at: timestamp, updated_at: timestamp,
  }
}

function fakeDb() {
  return {
    from(table: string) {
      let payload: Record<string, unknown> = {}
      const query = {
        select() { return query }, eq() { return query },
        upsert(value: Record<string, unknown>) {
          payload = value
          state.writes.push({ kind: 'upsert', args: value })
          return query
        },
        async single() { return { data: confirmationRecord(payload.snapshot_json), error: null } },
        async maybeSingle() {
          if (table.startsWith('operator_')) {
            if (state.displayNameError) throw new Error('display-name lookup unavailable')
            return { data: { display_name: '테스트 확인자' }, error: null }
          }
          return { data: null, error: null }
        },
      }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.writes.push({ kind: 'rpc', name, args })
      return { data: state.rpcError ? null : confirmationRecord(args.p_snapshot_json), error: state.rpcError }
    },
  }
}

Module._load = function (request: string, parent: { filename?: string }, isMain: boolean) {
  if (request === '@/lib/supabase/server') return { createServerClient: fakeDb }
  if (request === './service' && parent.filename?.replaceAll('\\', '/').endsWith('/payments/settlement-confirmation.ts')) {
    return { listSettlementDetailPayments: async () => state.payments }
  }
  if (request === '@/lib/auth/authenticate') return { authenticateAdminRequest: async () => ({ payload: { staffId: 7 }, error: null }) }
  if (request === '@/lib/auth/actor') return { getActorStaffId: () => 7 }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  return originalLoad.call(this, request, parent, isMain)
}
const service = require('../../src/lib/payments/settlement-confirmation') as typeof import('../../src/lib/payments/settlement-confirmation')
const manifests = require('../../src/lib/payments/settlement-manifest') as typeof import('../../src/lib/payments/settlement-manifest')
const route = require('../../src/app/api/settlements/confirmation/route') as typeof import('../../src/app/api/settlements/confirmation/route')
Module._load = originalLoad

beforeEach(() => {
  state.payments = []
  state.writes = []
  state.rpcError = null
  state.displayNameError = false
})

function confirm(expectedManifest: unknown = emptyManifest) {
  return service.confirmDailySettlement({ date, division: 'police', actorStaffId: 7, expectedManifest })
}

describe('daily settlement confirmation safety', () => {
  it('rejects stale displayed transactions without any write', async () => {
    state.payments = [payment(true)]
    await assert.rejects(confirm(), (error: unknown) => (error as { status?: number }).status === 409)
    assert.deepEqual(state.writes, [])
  })

  it('rejects unconfirmed transaction rows before writing a daily confirmation', async () => {
    state.payments = [payment()]
    const current = await service.getDailySettlementConfirmation(date, 'police')
    await assert.rejects(confirm(current.currentManifest), (error: unknown) => {
      assert.equal((error as { status?: number }).status, 409)
      assert.match((error as Error).message, /1.*미확인|미확인.*1/)
      return true
    })
    assert.deepEqual(state.writes, [])
  })

  it('writes through exactly one atomic RPC with a server-built snapshot', async () => {
    const result = await confirm()
    assert.equal(result.effectiveStatus, 'confirmed')
    assert.equal(state.writes.length, 1)
    assert.equal(state.writes[0].kind, 'rpc')
    assert.equal(state.writes[0].name, 'confirm_daily_settlement_atomic')
    assert.deepEqual(state.writes[0].args.p_expected_manifest, emptyManifest)
    assert.deepEqual(state.writes[0].args.p_snapshot_json, {
      gross: 0, refund: 0, net: 0, payment_count: 0, refund_count: 0, payer_count: 0,
      by_method: {}, refund_by_method: {},
    })
  })

  it('does not report failure after commit when display-name enrichment fails', async () => {
    state.displayNameError = true
    const result = await confirm()
    assert.equal(result.effectiveStatus, 'confirmed')
    assert.equal(result.confirmation.confirmedByName, null)
    assert.equal(state.writes.length, 1)
  })

  it('surfaces a transaction-time manifest conflict without retrying the write', async () => {
    state.rpcError = { code: '40001', message: 'SETTLEMENT_SNAPSHOT_CHANGED' }
    await assert.rejects(confirm(), (error: unknown) => (error as { status?: number }).status === 409)
    assert.equal(state.writes.length, 1)
  })

  it('refuses date-only POST requests that do not carry the displayed manifest', async () => {
    const response = await route.POST(new Request('http://localhost/api/settlements/confirmation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }),
    }) as never)
    assert.equal(response.status, 400)
    assert.deepEqual(state.writes, [])
  })

  it('rejects a replaced transaction even when every displayed total is unchanged', async () => {
    const displayed = payment(true)
    const expectedManifest = manifests.buildDailySettlementManifest([displayed], date)
    state.payments = [{ ...displayed, id: 9, settlement_confirmation: { ...confirmedEntry(), payment_id: 9 } }]
    await assert.rejects(confirm(expectedManifest), (error: unknown) => (error as { status?: number }).status === 409)
    assert.deepEqual(state.writes, [])
  })

  it('checks refunds on their own settlement date, including payments from previous dates', async () => {
    state.payments = [{
      ...payment(true), paid_date: '2026-09-04',
      enrollment_refunds: [{
        id: 5, payment_id: 1, amount: 5000, method: 'card_cancel', reason_category: 'withdrawal',
        reason: null, display_receipt_no: null, cancel_receipt_no: null, refund_account_last4: null,
        refunded_at: timestamp, refund_date: date, processed_by_staff_id: 7, memo: null,
        created_at: timestamp, settlement_confirmation: null,
      }],
    }]
    const current = await service.getDailySettlementConfirmation(date, 'police')
    assert.equal(current.pendingEntryCount, 1)
    assert.equal(current.currentSnapshot.gross, 0)
    assert.equal(current.currentSnapshot.refund, 5000)
    await assert.rejects(confirm(current.currentManifest), (error: unknown) => (error as { status?: number }).status === 409)
    assert.deepEqual(state.writes, [])
  })

  it('does not count a canceled or wrong-date transaction confirmation as confirmed', async () => {
    for (const entry of [
      { ...confirmedEntry(), status: 'canceled' as const, canceled_at: timestamp, canceled_by_staff_id: 7 },
      { ...confirmedEntry(), settlement_date: '2026-09-04' },
    ]) {
      state.payments = [{ ...payment(), settlement_confirmation: entry }]
      const current = await service.getDailySettlementConfirmation(date, 'police')
      assert.equal(current.pendingEntryCount, 1)
      await assert.rejects(confirm(current.currentManifest), (error: unknown) => (error as { status?: number }).status === 409)
    }
    assert.deepEqual(state.writes, [])
  })

  it('normalizes timezone offsets without losing microsecond versions and ignores object key order', () => {
    const displayed = { ...payment(true), updated_at: '2026-09-05T10:00:00.123456+09:00' }
    const manifest = manifests.buildDailySettlementManifest([displayed], date)
    assert.equal(manifest.payments[0].updated_at, '2026-09-05T01:00:00.123456Z')
    const reordered = Object.fromEntries(Object.entries(manifest).reverse())
    assert.equal(manifests.settlementManifestsEqual(reordered, manifest), true)
    const changed = manifests.buildDailySettlementManifest([{ ...displayed, updated_at: '2026-09-05T10:00:00.123457+09:00' }], date)
    assert.equal(manifests.settlementManifestsEqual(manifest, changed), false)
  })

  it('keeps voided transactions in the version manifest but excludes their pending entries and totals', async () => {
    state.payments = [{ ...payment(), status: 'voided' }]
    const current = await service.getDailySettlementConfirmation(date, 'police')
    assert.equal(current.pendingEntryCount, 0)
    assert.equal(current.currentSnapshot.gross, 0)
    assert.equal(current.currentManifest.payments.length, 1)
    const result = await confirm(current.currentManifest)
    assert.equal(result.effectiveStatus, 'confirmed')
    assert.equal(state.writes.length, 1)
  })

  it('passes the displayed manifest through POST and ignores any supplied fake summary', async () => {
    const response = await route.POST(new Request('http://localhost/api/settlements/confirmation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, expectedManifest: emptyManifest, snapshot: { gross: 999999 } }),
    }) as never)
    assert.equal(response.status, 201)
    assert.equal((state.writes[0].args.p_snapshot_json as { gross: number }).gross, 0)
  })
})

async function renderSettlementPage(t: TestContext, page: 'daily' | 'monthly', displayedPayments: EnrollmentPayment[] = []) {
  const { JSDOM } = require('../_setup/dom.cjs')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost/police/dashboard/settlements/${page}?date=${date}`, pretendToBeVisual: true,
  })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of ['window', 'self', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'HTMLInputElement', 'HTMLSelectElement', 'IS_REACT_ACT_ENVIRONMENT', 'React']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'React' ? require('react') : dom.window[key]
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require(`../../src/app/(admin)/dashboard/settlements/${page}/page`).default
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = []
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.startsWith('/api/courses')) {
      const all = [{ id: 1, name: '현재 강좌', status: 'active' }, { id: 2, name: '종료 강좌', status: 'archived' }]
      return Response.json({ courses: url.includes('activeOnly=1') ? all.slice(0, 1) : all })
    }
    if (url.startsWith('/api/payments/settlement/details')) return Response.json({ payments: displayedPayments })
    if (url.startsWith('/api/settlements/confirmation')) {
      return Response.json({
        division: 'police', settlementDate: date, effectiveStatus: 'unconfirmed', confirmation: null,
        currentSnapshot: service.buildDailySettlementSnapshot([], date), currentManifest: emptyManifest,
        pendingEntryCount: 0, latestChangedAt: null, snapshotChanged: false,
      })
    }
    throw new Error(`Unexpected UI request: ${url}`)
  })
  const root = createRoot(document.getElementById('root')!)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  await act(async () => {
    root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page) }))
  })
  return { requests, act, dom }
}

describe('settlement page request boundaries', () => {
  it('same-course mixed payments are counted as transactions, not duplicate courses', async (t) => {
    const first = { ...payment(), amount: 50000, checkout_group_id: 'aeef33a3-df6e-46d2-95bb-3a61c34bb874' }
    const second = { ...first, id: 2, method: 'card' as const, card_company: 'KB' }
    await renderSettlementPage(t, 'daily', [first, second])
    const group = Array.from(document.querySelectorAll('tr')).find((row) => row.textContent?.includes('묶음결제'))
    assert.ok(group)
    assert.match(group.textContent ?? '', /2건 · 100,000원/)
    assert.doesNotMatch(group.textContent ?? '', /2개 강좌/)
  })
  for (const page of ['daily', 'monthly'] as const) {
    it(`${page} keeps archived actual courses selectable with a clear label`, async (t) => {
      await renderSettlementPage(t, page)
      const option = document.querySelector('option[value="2"]')
      assert.ok(option, 'archived course remains in the historical filter')
      assert.equal(option.textContent, '종료 강좌 (보관)')
      assert.ok(document.querySelector('option[value="1"]'), 'active courses remain available')
    })
  }

  it('daily confirmation sends the manifest of the displayed rows, not a separate status response', async (t) => {
    const { act, requests } = await renderSettlementPage(t, 'daily', [payment(true)])
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '정산 확인')
    assert.ok(button)
    assert.equal(button.disabled, false)
    await act(async () => button.click())
    const posted = requests.find((request) => request.body && request.url === '/api/settlements/confirmation')
    assert.ok(posted)
    const manifest = posted.body?.expectedManifest as { payments?: Array<{ id: number; updated_at: string }> }
    assert.equal(manifest?.payments?.[0]?.id, 1)
    assert.equal(manifest.payments?.[0]?.updated_at, '2026-09-05T01:00:00.000000Z')
  })

  it('daily confirmation is disabled while a displayed transaction remains unconfirmed', async (t) => {
    await renderSettlementPage(t, 'daily', [payment()])
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '정산 확인')
    assert.ok(button)
    assert.equal(button.disabled, true)
    assert.match(document.body.textContent ?? '', /미확인.*1|1.*미확인/)
  })

  it('daily confirmation requires a new report after the selected dates change', async (t) => {
    const { act, dom } = await renderSettlementPage(t, 'daily')
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'))
    assert.equal(inputs.length, 2)
    await act(async () => {
      for (const input of inputs) {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-09-06')
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      }
    })
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '정산 확인')
    assert.ok(button)
    assert.equal(button.disabled, true)
  })
})
