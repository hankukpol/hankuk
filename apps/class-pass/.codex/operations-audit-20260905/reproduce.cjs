// Read-only audit: real application functions, in-memory dependencies only.
// No environment credentials, network requests, or database writes are used.
const assert = require('node:assert/strict')
const Module = require('node:module')
require('tsx/cjs')
const originalLoad = Module._load
const copy = (value) => JSON.parse(JSON.stringify(value))
const state = { payload: null, version: 1, revoked: true, failures: 0, events: [], payment: null, billing: null, enrollment: null }

function resetPayment() {
  state.failures = 0
  state.events = []
  state.enrollment = { id: 1, course_id: 2, status: 'active' }
  state.billing = { id: 1, enrollment_id: 1, course_id: 2, expected_amount: 100000, discount_amount: 0, payable_amount: 100000, tuition_exempt: false, status: 'paid' }
  state.payment = { id: 100, enrollment_id: 1, course_id: 2, amount: 100000, method: 'cash', category: 'tuition', status: 'paid', card_company: null, enrollment_refunds: [], enrollment_payment_items: [{ label: '수강료', amount: 100000 }], paid_at: '2026-09-05T01:00:00.000Z', paid_date: '2026-09-05', updated_at: '2026-09-05T01:00:00.000Z' }
}

function builder(table) {
  let operation = 'select'
  let patch
  const filters = {}
  const api = {
    select() { return api },
    eq(key, value) { filters[key] = value; return api },
    neq() { return api },
    is() { return api },
    in() { return api },
    order() { return api },
    update(value) { operation = 'update'; patch = value; return api },
    insert(value) { operation = 'insert'; patch = value; return api },
    delete() { operation = 'delete'; return api },
    maybeSingle() { return run(true) },
    single() { return run(true) },
    then(resolve, reject) { return run(false).then(resolve, reject) },
  }
  async function run(single) {
    if (table === 'enrollment_payments' && operation === 'select' && single && state.failures > 0) {
      state.failures--
      return { data: null, error: { code: 'TEST_TRANSIENT_READ', message: 'Simulated post-commit read failure' } }
    }
    let row
    if (table === 'enrollment_payments') row = state.payment
    else if (table === 'enrollment_billing') row = state.billing
    else if (table === 'enrollments') row = state.enrollment
    else if (table === 'payment_events') {
      if (operation === 'insert') state.events.push(copy(patch))
      return { data: null, error: null }
    } else if (table === 'enrollment_refunds') {
      if (operation === 'delete') state.payment.enrollment_refunds = state.payment.enrollment_refunds.filter((r) => r.id !== filters.id)
      return { data: null, error: null }
    } else throw new Error(`Unexpected mocked table: ${table}`)
    if (operation === 'update') Object.assign(row, patch)
    return { data: single ? copy(row) : [copy(row)], error: null }
  }
  return api
}

const db = {
  from: builder,
  async rpc(name, args) {
    assert.equal(name, 'create_refund_bundle_atomic')
    const results = args.p_refunds.map((r) => {
      const id = state.payment.enrollment_refunds.length + 1
      state.payment.enrollment_refunds.push({ id, payment_id: 100, amount: r.amount, method: r.method, refund_date: '2026-09-05', created_at: '2026-09-05T01:00:00.000Z' })
      return { refund_id: id, payment_id: 100 }
    })
    state.payment.status = 'partial_refunded'
    state.billing.status = 'partial'
    if (state.injectFailure) { state.failures = 1; state.injectFailure = false }
    return { data: results, error: null }
  },
}

Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/auth/operator-sessions') return { validateOperatorSession: async () => state.revoked ? null : {} }
  if (request === '@/lib/auth/session-version') return { DEFAULT_SESSION_VERSION: 1, getSessionVersion: async () => state.version }
  if (request === '@/lib/auth/request-origin') return { validateSameOriginRequest: () => null }
  if (request === '@/lib/auth/verified-auth') return {
    readVerifiedAdminPayload: () => state.payload?.role === 'admin' ? state.payload : null,
    readVerifiedStaffPayload: () => state.payload?.role === 'staff' ? state.payload : null,
    readVerifiedSuperAdminPayload: () => null,
  }
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => undefined }
  if (request === '@/lib/class-pass-data') return { verifyEnrollmentOwnership: async () => ({ valid: true }) }
  return originalLoad.call(this, request, parent, isMain)
}

async function main() {
  const auth = require('../../src/lib/auth/authenticate.ts')
  const req = { cookies: { get: () => undefined }, headers: new Headers(), method: 'GET' }
  for (const role of ['admin', 'staff']) {
    state.payload = { sub: 'mock-revoked-session', accountId: 1, membershipId: 2, role, division: 'police', sessionScope: role === 'admin' ? 'branch_admin' : 'staff' }
    const result = await (role === 'admin' ? auth.authenticateAdminRequest(req) : auth.authenticateStaffRequest(req))
    assert.equal(result.error, null)
    console.log(`REPRO auth: revoked ${role} session accepted when legacy version=1`)
  }
  state.version = 2
  assert.equal((await auth.authenticateStaffRequest(req)).error.status, 401)
  console.log('CONTROL auth: legacy version=2 rejects the same revoked staff session')

  resetPayment()
  state.payment.enrollment_refunds = [{ id: 1, amount: 70000 }]
  const cancel = require('../../src/app/api/enrollments/[id]/refund/route.ts')
  const cancelResponse = await cancel.POST(req, { params: Promise.resolve({ id: '1' }) })
  assert.equal(cancelResponse.status, 409)
  assert.equal(state.enrollment.status, 'active')
  console.log('REPRO cancellation: 100000 paid - 70000 refunded; retained 30000 blocks course cancellation (409), enrollment remains active')

  resetPayment()
  const payments = require('../../src/lib/payments/service.ts')
  state.injectFailure = true
  const refundInput = { refunds: [{ paymentId: 100, amount: 10000, method: 'cash', reasonCategory: 'withdrawal' }] }
  await assert.rejects(payments.createRefundBundle(refundInput, 'police', 1))
  assert.equal(state.payment.enrollment_refunds.length, 1)
  console.log('REPRO refund: caller receives failure after committed 10000 refund; the refund remains in the ledger')
  await payments.createRefundBundle(refundInput, 'police', 1)
  assert.equal(state.payment.enrollment_refunds.reduce((sum, r) => sum + r.amount, 0), 20000)
  console.log('REPRO retry: retrying the same 10000 refund produces total 20000 in two ledger records')

  resetPayment()
  await assert.rejects(payments.updatePayment(100, { amount: 200000, items: [{ label: '수강료', amount: 100000 }] }, 'police', 1))
  assert.equal(state.payment.amount, 200000)
  assert.equal(state.payment.enrollment_payment_items[0].amount, 100000)
  assert.equal(state.events.length, 0)
  console.log('REPRO edit: rejected item-total mismatch still leaves payment amount=200000, items=100000, audit events=0')

  const importing = require('../../src/lib/payments/bulk-import.ts')
  const importRows = importing.previewPaymentImportRows({
    rows: [
      { name: '감사테스트', phone: '01000000000', birthDate: '990101', amount: 60000, method: '카드', cardCompany: '신한', paidAt: '2026-09-05' },
      { name: '감사테스트', phone: '01000000000', birthDate: '990101', amount: 40000, method: '현금', paidAt: '2026-09-05' },
    ],
    enrollments: [],
    createMissingEnrollment: true,
  })
  assert.equal(importRows[0].status, 'create')
  assert.equal(importRows[1].status, 'duplicate')
  console.log('REPRO import: valid mixed payment split into card 60000 + cash 40000; second row rejected as duplicate student')
  console.log('Audit reproductions complete. All persistence was in memory; no real records were modified.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => { Module._load = originalLoad })
