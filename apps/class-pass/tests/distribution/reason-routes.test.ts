import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import { getScanReasonMessage } from '../../src/app/(staff)/scan/scan-page-utils'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const state = { reason: 'NO_SEAT_FOR_SUBJECT', rpcError: false, laterRpcError: false, partial: false, calls: 0, authDenied: false, featureDenied: false, wrongTenant: false }
const db = {
  async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, 'distribute_material_atomic', 'never fall back to an unsafe legacy RPC')
    assert.equal(args.p_division, 'police')
    state.calls++
    if (state.partial && args.p_material_id === 10) return { data: { success: true, log_id: 91, material_name: '자료1', student_name: '검증학생', distributed_at: '2026-09-06T00:00:00Z' }, error: null }
    const rpcError = state.rpcError || (state.laterRpcError && args.p_material_id === 11)
    return { data: rpcError ? null : { success: false, reason: state.reason }, error: rpcError ? new Error('private database detail') : null }
  },
  from(table: string) {
    assert.equal(table, 'distribution_logs')
    return { select() { return { in: async () => ({ data: [{ id: 91, material_id: 10, distributed_at: '2026-09-06T00:00:00Z' }], error: null }) } } }
  },
}
// Real routes and distribution service; all external DB/auth/config boundaries stay in memory.
Module._load = function(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => state.authDenied ? NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) : null }
  if (request === '@/lib/auth/require-staff-api') return { requireStaffApi: async () => state.authDenied ? NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) : null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => state.featureDenied ? NextResponse.json({ error: '비활성 기능입니다.' }, { status: 403 }) : null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/distribution/cache') return { invalidateDistributionCache: async () => ({}) }
  if (request === '@/lib/class-pass-data') return {
    verifyEnrollmentOwnership: async () => ({ valid: !state.wrongTenant }),
    getCourseById: async () => state.wrongTenant ? null : { id: 8, division: 'police' },
    findEnrollmentForQuickDistribution: async () => ({ id: 12, name: '검증학생' }),
    getUnreceivedMaterialsForEnrollment: async () => [10, 11].map(id => ({ id, name: `자료${id}`, material_type: 'handout' })),
  }
  return originalLoad.call(this, request, parent, isMain)
}
const manual = require('../../src/app/api/distribution/manual/route').POST as typeof import('../../src/app/api/distribution/manual/route').POST
const quick = require('../../src/app/api/distribution/quick/route').POST as typeof import('../../src/app/api/distribution/quick/route').POST
after(() => { Module._load = originalLoad })
beforeEach(() => Object.assign(state, { reason: 'NO_SEAT_FOR_SUBJECT', rpcError: false, laterRpcError: false, partial: false, calls: 0, authDenied: false, featureDenied: false, wrongTenant: false }))
const request = () => new NextRequest('http://localhost/api/distribution/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId: 12, courseId: 8, phone: '01000000012', materialIds: [10, 11] }) })

for (const [name, post] of [['manual', manual], ['quick', quick]] as const) {
  for (const reason of ['NO_SEAT_FOR_SUBJECT', 'NOT_ASSIGNED', 'ALREADY_DISTRIBUTED', 'STUDENT_INACTIVE', 'STUDENT_NOT_FOUND', 'COURSE_INACTIVE', 'MATERIAL_NOT_FOUND', 'COURSE_MISMATCH']) {
    test(`${name} returns the same Korean reason as staff scan for ${reason}`, async () => {
      state.reason = reason
      const response = await post(request())
      const payload = await response.json()
      assert.equal(response.status, 400)
      assert.match(payload.error, /[가-힣]/)
      assert.equal(payload.error, getScanReasonMessage(reason))
      assert.equal(payload.reason, reason, 'known machine-readable reasons stay compatible')
      assert.doesNotMatch(payload.error, /[A-Z]+_[A-Z]+/)
    })
  }
  test(`${name} keeps server errors at 500 and asks to inspect receipts before retrying`, async () => {
    state.rpcError = true
    const response = await post(request())
    const payload = await response.json()
    assert.equal(response.status, 500)
    assert.match(payload.error, /수령 내역.*확인/)
    assert.doesNotMatch(payload.error, /private database detail/)
  })
  for (const reason of ['NEW_PRIVATE_ERROR', '한국어 오류 SELECT secret FROM internal', '<html>gateway</html>', 'constructor', '__proto__']) {
    test(`${name} never returns an unknown server value in any response field: ${reason}`, async () => {
      state.reason = reason
      const response = await post(request())
      const payload = await response.json()
      assert.equal(response.status, 500)
      assert.equal(payload.reason, 'DISTRIBUTION_FAILED')
      assert.match(payload.error, /수령 내역.*확인/)
      assert.doesNotMatch(JSON.stringify(payload), /NEW_PRIVATE_ERROR|SELECT|secret|<html>|constructor|__proto__/)
    })
  }
  test(`${name} partial failures preserve already committed material IDs`, async () => {
    state.partial = true
    const response = await post(request())
    const payload = await response.json()
    if (name === 'manual') {
      assert.equal(response.status, 200)
      assert.equal(payload.success_count, 1)
      assert.equal(payload.failed_count, 1)
      assert.deepEqual(payload.logs.map((row: { material_id: number }) => row.material_id), [10])
    } else {
      assert.equal(response.status, 400)
      assert.deepEqual(payload.distributed_materials.map((row: { id: number }) => row.id), [10])
      assert.match(payload.error, /좌석.*배정/)
    }
  })
  for (const [condition, status] of [['authDenied', 401], ['featureDenied', 403], ['wrongTenant', 404]] as const) {
    test(`${name} does not invoke a distribution RPC when ${condition}`, async () => {
      state[condition] = true
      assert.equal((await post(request())).status, status)
      assert.equal(state.calls, 0)
    })
  }
}

test('manual does not hide a later server failure behind the first eligibility rejection', async () => {
  state.laterRpcError = true
  const response = await manual(request())
  const payload = await response.json()
  assert.equal(state.calls, 2)
  assert.equal(response.status, 500)
  assert.equal(payload.reason, 'DISTRIBUTION_FAILED')
  assert.match(payload.error, /수령 내역.*확인/)
})
