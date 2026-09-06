import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const state = { writes: [] as Array<Record<string, unknown>>, pendingCount: 1, failSecond: false, cacheFails: false }
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/require-staff-api') return { requireStaffApi: async () => null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (state.cacheFails) throw new Error('cache unavailable') } }
  if (request === '@/lib/class-pass-data') return {
    getCourseById: async () => ({ id: 8, division: 'police' }),
    findEnrollmentForQuickDistribution: async () => ({ id: 101, name: '검증학생 A' }),
    getUnreceivedMaterialsForEnrollment: async () => Array.from({ length: state.pendingCount }, (_, index) => ({ id: 20 + index, name: `자료${index + 1}`, material_type: 'handout' })),
  }
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({ rpc: async (_name: string, args: Record<string, unknown>) => {
    if (state.failSecond && args.p_material_id === 21) return { data: { success: false, reason: 'NOT_ASSIGNED' }, error: null }
    state.writes.push(args)
    return { data: { success: true, student_name: '검증학생 A', material_name: '자료1' }, error: null }
  } }) }
  return originalLoad.call(this, request, parent, isMain)
}
const { POST } = require('../../src/app/api/distribution/quick/route') as typeof import('../../src/app/api/distribution/quick/route')
beforeEach(() => { state.writes = []; state.pendingCount = 1; state.failSecond = false; state.cacheFails = false })
after(() => { Module._load = originalLoad })
const post = (selection: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/distribution/quick', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 8, phone: '01011111111', ...selection }),
}))

test('initial quick lookup returns the only eligible material without writing a receipt', async () => {
  const response = await post()
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.needsSelection, true)
  assert.deepEqual(payload.available_materials, [{ id: 20, name: '자료1', material_type: 'handout' }])
  assert.equal(state.writes.length, 0)
})

test('empty materialIds is still a lookup, while explicit materialId writes once', async () => {
  assert.equal((await (await post({ materialIds: [] })).json()).needsSelection, true)
  assert.equal(state.writes.length, 0)
  assert.equal((await (await post({ materialId: 20 })).json()).success, true)
  assert.deepEqual(state.writes, [{ p_division: 'police', p_enrollment_id: 101, p_material_id: 20 }])
})

test('partial NOT_ASSIGNED response retains already committed material IDs', async () => {
  state.pendingCount = 2
  state.failSecond = true
  const response = await post({ materialIds: [20, 21] })
  const payload = await response.json()
  assert.equal(response.status, 400)
  assert.deepEqual(payload.distributed_materials, [{ id: 20, name: '자료1', material_type: 'handout' }])
  assert.equal(state.writes.length, 1)
})

test('a committed quick receipt reports cache refresh failure as a warning, not a failed write', async () => {
  state.cacheFails = true
  const response = await post({ materialId: 20 })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.success, true)
  assert.equal(payload.refreshRequired, true)
  assert.equal(typeof payload.warning, 'string')
  assert.equal(state.writes.length, 1)
})
