const assert = require('node:assert/strict')
const { test, beforeEach, after } = require('node:test')
const Module = require('node:module')
require('tsx/cjs')

const originalLoad = Module._load
const clone = (value) => JSON.parse(JSON.stringify(value))
let payment, billing, writes, readFailures, cacheFailure, rpcCalls, enrollmentStatus, rpcFailure, closeBillingAfterRead
const requestId = 'f35a0462-1636-4b37-8a30-328692c778a1'

function query(table) {
  let operation = 'select', patch, excludedStatus
  const chain = {
    select() { return chain }, eq() { return chain }, neq(column, value) { if (column === 'status') excludedStatus = value; return chain },
    limit() { return chain },
    update(value) { operation = 'update'; patch = value; return chain },
    insert(value) { operation = 'insert'; patch = value; return chain },
    delete() { operation = 'delete'; return chain },
    maybeSingle() { return run(true) }, single() { return run(true) },
    then(resolve, reject) { return run(false).then(resolve, reject) },
  }
  async function run(single) {
    if (operation !== 'select') writes.push({ table, operation, patch })
    if (table === 'enrollment_payments') {
      if (operation === 'update') Object.assign(payment, patch)
      if (operation === 'select' && single && readFailures-- > 0) {
        return { data: null, error: { message: 'post-commit read failed' } }
      }
      return { data: single ? clone(payment) : payment.status === excludedStatus ? [] : [clone(payment)], error: null }
    }
    if (table === 'enrollment_billing') {
      if (excludedStatus === billing.status) return { data: null, error: null }
      if (operation === 'update') Object.assign(billing, patch)
      const result = clone(billing)
      if (operation === 'select' && closeBillingAfterRead) { billing.status = 'closed'; closeBillingAfterRead = false }
      return { data: result, error: null }
    }
    if (table === 'enrollments') return { data: { id: 1, course_id: 2, status: enrollmentStatus }, error: null }
    if (table === 'payment_events' || table === 'enrollment_refunds') return { data: null, error: null }
    throw new Error(`Unexpected DB call: ${table} ${operation}`)
  }
  return chain
}

const db = {
  from: query,
  async rpc(name, args) {
    rpcCalls.push({ name, args: clone(args) })
    if (rpcFailure) return { data: null, error: rpcFailure }
    if (name === 'create_refund_bundle_atomic') {
      const refund = { id: 9, payment_id: 100, amount: 10000, method: 'cash' }
      payment.enrollment_refunds.push(refund)
      readFailures = 1
      return { data: [{ refund_id: 9, payment_id: 100 }], error: null }
    }
    if (name === 'create_refund_bundle_idempotent') {
      assert.equal(args.p_request_id, requestId)
      // The transaction returns its committed snapshot; no post-commit read is required.
      const refund = { id: 9, payment_id: 100, amount: 10000, method: 'cash' }
      payment.enrollment_refunds = [refund]
      readFailures = 1
      return { data: { refunds: [refund], payments: [clone(payment)], requestId }, error: null }
    }
    if (name === 'update_payment_atomic') {
      return { data: { ...clone(payment), ...args.p_patch }, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  },
}

Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (cacheFailure) throw new Error('cache unavailable') } }
  return originalLoad.call(this, request, parent, isMain)
}
const { updatePayment, createRefundBundle, createPaymentBundle, voidPayment, getPaymentServiceStatus, getPaymentServiceMessage } = require('../../src/lib/payments/service.ts')
after(() => { Module._load = originalLoad })

beforeEach(() => {
  payment = { id: 100, enrollment_id: 1, course_id: 2, amount: 100000, method: 'cash', category: 'tuition', status: 'paid', card_company: null, enrollment_refunds: [], enrollment_payment_items: [{ label: '수강료', amount: 100000 }], updated_at: '2026-09-05T01:00:00Z' }
  billing = { expected_amount: 100000, payable_amount: 100000, status: 'paid' }
  writes = []; readFailures = 0; cacheFailure = false; rpcCalls = []
  enrollmentStatus = 'active'; rpcFailure = null
  closeBillingAfterRead = false
})

test('an invalid item total leaves payment, items and events untouched', async () => {
  await assert.rejects(updatePayment(100, { amount: 200000, items: [{ label: '수강료', amount: 100000 }] }, 'police', 1))
  assert.equal(payment.amount, 100000)
  assert.deepEqual(writes, [])
})

test('valid edits delegate payment and item persistence to one atomic operation', async () => {
  const result = await updatePayment(100, { memo: '수납 확인' }, 'police', 1)
  assert.equal(result.memo, '수납 확인')
  assert.deepEqual(writes, [])
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'update_payment_atomic')
  assert.equal(rpcCalls[0].args.p_expected_updated_at, '2026-09-05T01:00:00Z')
})

test('committed refund succeeds without a fragile post-commit payment read', async () => {
  const result = await createRefundBundle({ requestId, refunds: [{ paymentId: 100, amount: 10000, method: 'cash' }] }, 'police', 1)
  assert.equal(result.refunds[0].id, 9)
  assert.equal(result.requestId, requestId)
  assert.deepEqual(writes, [])
})

test('cache failure does not turn a committed refund into a failed or deleted refund', async () => {
  cacheFailure = true
  const result = await createRefundBundle({ requestId, refunds: [{ paymentId: 100, amount: 10000, method: 'cash' }] }, 'police', 1)
  assert.equal(result.refunds[0].id, 9)
  assert.deepEqual(writes, [])
})

test('refund retries use stable logical timestamps and the same request identifier', async () => {
  const input = { requestId, refunds: [{ paymentId: 100, amount: 10000, method: 'cash' }] }
  await createRefundBundle(input, 'police', 1)
  readFailures = 0
  await createRefundBundle(input, 'police', 1)
  assert.deepEqual(rpcCalls[0].args, rpcCalls[1].args)
  assert.equal(rpcCalls[0].args.p_refunds[0].refundedAt, null)
})

test('ended enrollment rejects collection before financial writes', async () => {
  enrollmentStatus = 'cancelled'
  await assert.rejects(createPaymentBundle({ enrollmentId: 1, payments: [{ amount: 100000, method: 'cash' }] }, 'police', 1), /종료된/)
  assert.deepEqual(writes, [])
  assert.deepEqual(rpcCalls, [])
})

test('voiding a payment never reopens a closed billing record', async () => {
  enrollmentStatus = 'cancelled'
  billing.status = 'closed'
  await voidPayment(100, 'police', 1)
  assert.equal(billing.status, 'closed')
})

test('a concurrent termination cannot be overwritten by a stale billing recalculation', async () => {
  billing.status = 'paid'
  closeBillingAfterRead = true
  await voidPayment(100, 'police', 1)
  assert.equal(billing.status, 'closed')
})

test('free-payment void cannot change exemption or payable amount after concurrent termination', async () => {
  payment.method = 'free'; payment.amount = 0
  billing.status = 'exempt'; billing.tuition_exempt = true; billing.payable_amount = 0
  closeBillingAfterRead = true
  await voidPayment(100, 'police', 1)
  assert.equal(billing.status, 'closed')
  assert.equal(billing.tuition_exempt, true)
  assert.equal(billing.payable_amount, 0)
})

test('known refund request conflict is returned as actionable 409, not generic 500', async () => {
  rpcFailure = { code: 'P0001', message: '같은 환불 요청번호의 내용이 변경되었습니다. 기존 처리 결과를 먼저 확인해 주세요.' }
  try {
    await createRefundBundle({ requestId, refunds: [{ paymentId: 100, amount: 10000, method: 'cash' }] }, 'police', 1)
    assert.fail('expected conflict')
  } catch (error) {
    assert.equal(getPaymentServiceStatus(error), 409)
    assert.match(getPaymentServiceMessage(error, 'generic'), /요청/)
  }
})

for (const code of ['CP001', 'CP002', 'CP003', 'CP004']) {
  test(`${code} financial policy conflict has a safe actionable message`, async () => {
    rpcFailure = { code, message: 'private database detail' }
    try {
      await updatePayment(100, { memo: '확인' }, 'police', 1)
      assert.fail('expected conflict')
    } catch (error) {
      assert.equal(getPaymentServiceStatus(error), 409)
      assert.notEqual(getPaymentServiceMessage(error, 'generic'), 'generic')
      assert.doesNotMatch(getPaymentServiceMessage(error, 'generic'), /private database/)
    }
  })
}
