const assert = require('node:assert/strict')
const { test, after } = require('node:test')
const Module = require('node:module')
require('tsx/cjs')
const originalLoad = Module._load
let calls = [], rows = {}, serverCap = 1000
function query(table) {
  let ids, idColumn, from = 0, to = Infinity
  const chain = {
    select() { return chain }, eq() { return chain }, gte() { return chain }, lte() { return chain }, order() { return chain },
    in(column, values) { idColumn = column; ids = values; return chain },
    range(start, end) { from = start; to = end; return chain },
    then(resolve, reject) {
      calls.push({ table, ids, from, to })
      const selected = (rows[table] ?? []).filter(row => !ids || ids.includes(row[idColumn]))
      return Promise.resolve({ data: selected.slice(from, Math.min(to + 1, from + serverCap)), error: null }).then(resolve, reject)
    },
  }
  return chain
}
Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({ from: query }) }
  return originalLoad.call(this, request, parent, isMain)
}
const { listSettlementDetailPayments } = require('../../src/lib/payments/service.ts')
after(() => { Module._load = originalLoad })

for (const cap of [1000, 75]) {
  test(`settlement keeps all billing and confirmations with server cap ${cap}`, async () => {
    serverCap = cap; calls = []
    rows = {
      enrollment_payments: Array.from({ length: 1205 }, (_, i) => ({ id: i + 1, enrollment_id: i + 1, paid_at: '2026-09-05T00:00:00Z', enrollment_refunds: [] })),
      enrollment_billing: Array.from({ length: 1205 }, (_, i) => ({ enrollment_id: i + 1, expected_amount: 100000, payable_amount: 100000, discount_amount: 0, created_by_staff_id: null })),
      settlement_entry_confirmations: Array.from({ length: 1205 }, (_, i) => ({ id: i + 1, payment_id: i + 1, entry_kind: 'payment', status: 'confirmed' })),
      enrollment_refunds: [],
    }
    const result = await listSettlementDetailPayments({}, 'police')
    assert.equal(result.length, 1205)
    assert.ok(result.every(row => row.enrollment_billing?.payable_amount === 100000))
    assert.ok(result.every(row => row.settlement_confirmation?.status === 'confirmed'))
    assert.ok(calls.filter(call => call.table === 'enrollment_billing').every(call => call.ids.length <= 200))
  })
}
