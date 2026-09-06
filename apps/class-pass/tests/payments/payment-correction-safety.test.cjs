const assert = require('node:assert/strict')
const { test, beforeEach, after } = require('node:test')
const Module = require('node:module')
require('tsx/cjs')

// Only external persistence/cache/auth boundaries are doubled; service and route are real.
const originalLoad = Module._load
const clone = value => JSON.parse(JSON.stringify(value))
const requestId = 'c7996768-a355-4eee-af9b-a1ef484b5d13'
let rows, billing, requests, rpcCalls, failRead, failCache, loseResponse, commits
function query(table) {
  const filters = {}
  const chain = {
    select() { return chain }, eq(key, value) { filters[key] = value; return chain }, neq() { return chain },
    maybeSingle() { return run(true) }, then(resolve, reject) { return run(false).then(resolve, reject) },
  }
  async function run(single) {
    if (table === 'enrollment_payments') {
      if (single && failRead && commits > 0) return { data: null, error: { message: 'INJECTED_POST_COMMIT_READ_FAILURE' } }
      const values = filters.id ? rows.filter(row => row.id === filters.id) : rows
      return { data: clone(single ? values[0] : values), error: null }
    }
    if (table === 'enrollments') return { data: { id: 1, course_id: 2, status: 'active' }, error: null }
    if (table === 'enrollment_billing') return { data: clone(billing), error: null }
    throw new Error(`Unexpected table ${table}`)
  }
  return chain
}
const db = {
  from: query,
  async rpc(name, args) {
    rpcCalls.push(clone(args))
    const durable = name === 'create_payment_correction_idempotent'
    assert.ok(durable || name === 'create_payment_correction_atomic')
    const fingerprint = JSON.stringify(args)
    const prior = requests.get(args.p_request_id)
    if (durable && prior) return prior.fingerprint === fingerprint
      ? { data: clone(prior.result), error: null }
      : { data: null, error: { code: 'CP002', message: 'request changed' } }
    const original = rows[0]
    if (args.p_refund.amount > original.amount - original.enrollment_refunds.reduce((n, r) => n + r.amount, 0)) {
      return { data: null, error: { message: 'refund amount exceeds remaining payment amount' } }
    }
    const refund = { id: 50 + commits, payment_id: 100, amount: args.p_refund.amount, method: 'cash' }
    original.enrollment_refunds.push(refund)
    const payment = { ...clone(original), id: 101 + commits, amount: args.p_payment.amount, enrollment_refunds: [] }
    rows.push(payment)
    commits++
    billing.payable_amount = durable && args.p_tuition_billing_mode === 'match_net'
      ? rows.reduce((n, p) => n + p.amount - p.enrollment_refunds.reduce((s, r) => s + r.amount, 0), 0)
      : args.p_billing?.payableAmount ?? billing.payable_amount
    const result = { requestId: args.p_request_id, refunds: [refund], refundedPayments: [clone(original)], payments: [clone(payment)] }
    if (durable) requests.set(args.p_request_id, { fingerprint, result })
    if (loseResponse) { loseResponse = false; throw new Error('RESPONSE_LOST_AFTER_COMMIT') }
    return { data: durable ? result : [{ refund_id: refund.id, payment_id: payment.id }], error: null }
  },
}
Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (failCache) throw new Error('CACHE_FAILURE') } }
  if (request === '@/lib/auth/authenticate') return { authenticateAdminRequest: async () => ({ payload: { role: 'admin' } }) }
  if (request === '@/lib/auth/actor') return { getActorStaffId: () => null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  return originalLoad.call(this, request, parent, isMain)
}
const { createPaymentCorrection } = require('../../src/lib/payments/service.ts')
const { POST } = require('../../src/app/api/payments/corrections/route.ts')
after(() => { Module._load = originalLoad })
beforeEach(() => {
  rows = [{ id: 100, enrollment_id: 1, course_id: 2, amount: 100000, category: 'tuition', method: 'cash', status: 'paid', enrollment_refunds: [] }]
  billing = { expected_amount: 100000, payable_amount: 100000, status: 'paid' }
  requests = new Map(); rpcCalls = []; commits = 0; failRead = false; failCache = false; loseResponse = false
})
function input() { return { requestId, enrollmentId: 1, courseId: 2, refund: { paymentId: 100, amount: 20000, method: 'cash' }, payment: { amount: 10000, method: 'cash', category: 'tuition' }, tuitionBillingMode: 'match_net' } }
function post(body) { return POST(new Request('http://localhost/api/payments/corrections', { method: 'POST', body: JSON.stringify(body) })) }

test('committed correction succeeds even when post-commit payment reads fail', async () => {
  failRead = true
  const result = await createPaymentCorrection(input(), 'police', null)
  assert.equal(result.refunds[0].id, 50)
  assert.equal(commits, 1)
  assert.equal(billing.payable_amount, 90000)
})
test('cache outage reports committed correction with refreshRequired', async () => {
  failCache = true
  const result = await createPaymentCorrection(input(), 'police', null)
  assert.equal(result.refreshRequired, true)
  assert.equal(result.requestId, requestId)
})
test('lost response retry returns original result without reducing tuition twice', async () => {
  loseResponse = true
  await assert.rejects(createPaymentCorrection(input(), 'police', null), /RESPONSE_LOST/)
  const result = await createPaymentCorrection(input(), 'police', null)
  assert.equal(result.refunds[0].id, 50)
  assert.equal(commits, 1)
  assert.equal(billing.payable_amount, 90000)
  assert.deepEqual(rpcCalls[0], rpcCalls[1])
  assert.equal(rpcCalls[0].p_refund.refundedAt, null)
  assert.equal(rpcCalls[0].p_payment.paidAt, null)
})
test('full refund replay reaches durable lookup before reduced-balance validation', async () => {
  const full = input(); full.refund.amount = 100000
  const first = await createPaymentCorrection(full, 'police', null)
  const second = await createPaymentCorrection(full, 'police', null)
  assert.deepEqual(second, first)
  assert.equal(commits, 1)
})
test('route requires UUID before financial writes', async () => {
  const body = input(); delete body.requestId
  const response = await post(body)
  assert.equal(response.status, 400)
  assert.equal(commits, 0)
})
test('route preserves UUID and changed-payload retry returns 409', async () => {
  assert.equal((await post(input())).status, 201)
  const changed = input(); changed.payment.amount = 11000
  const response = await post(changed)
  assert.equal(response.status, 409)
  assert.equal(commits, 1)
  assert.equal(billing.payable_amount, 90000)
})
