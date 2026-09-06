import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const state = {
  authStatus: 0, featureStatus: 0, cacheFails: false,
  rpcError: null as { code: string; message: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/authenticate') return {
    authenticateAdminRequest: async () => ({ payload: { accountId: 41 }, error: state.authStatus ? Response.json({}, { status: state.authStatus }) : null }),
  }
  if (request === '@/lib/app-feature-guard') return {
    requireAppFeature: async () => state.featureStatus ? Response.json({}, { status: state.featureStatus }) : null,
  }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (state.cacheFails) throw new Error('cache unavailable') } }
  if (request === '@/lib/api/error-response') return { handleRouteError: () => Response.json({ error: '저장 오류' }, { status: 500 }) }
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (state.rpcError) return { data: null, error: state.rpcError }
      if (args.p_division !== 'police' || args.p_enrollment_id !== 101) return { data: null, error: { code: 'P0002', message: 'ENROLLMENT_NOT_FOUND' } }
      return { data: { id: 101, course_id: 10, status: 'cancelled', ended_at: '2026-09-05T09:00:00Z', ended_reason: args.p_reason }, error: null }
    },
  }) }
  return originalLoad.call(this, request, parent, isMain)
}

const routeModule = import('../../src/app/api/enrollments/[id]/end/route').catch(() => null)
beforeEach(() => {
  state.authStatus = 0; state.featureStatus = 0; state.cacheFails = false
  state.rpcError = null; state.rpcCalls = []
})
after(() => { Module._load = originalLoad })

test('ending enrollment uses the tenant-scoped atomic RPC and returns the separate lifecycle state', async () => {
  const response = await post('101', { reason: '  개인 사정  ' })
  assert.equal(response.status, 200)
  assert.deepEqual(state.rpcCalls, [{ name: 'end_enrollment_atomic', args: {
    p_division: 'police', p_enrollment_id: 101, p_reason: '개인 사정', p_actor_staff_id: 41,
  } }])
  assert.deepEqual((await response.json()).enrollment, {
    id: 101, course_id: 10, status: 'cancelled', ended_at: '2026-09-05T09:00:00Z', ended_reason: '개인 사정',
  })
})

for (const [label, id, body] of [
  ['zero ID', '0', { reason: '종료' }],
  ['unsafe ID', '9007199254740992', { reason: '종료' }],
  ['missing reason', '101', {}],
  ['blank reason', '101', { reason: '   ' }],
  ['overlong reason', '101', { reason: '가'.repeat(1001) }],
] as const) {
  test(`rejects ${label} before any lifecycle write`, async () => {
    assert.equal((await post(id, body)).status, 400)
    assert.equal(state.rpcCalls.length, 0)
  })
}

test('authentication and feature gates run before lifecycle mutation', async () => {
  state.authStatus = 401
  assert.equal((await post('101', { reason: '종료' })).status, 401)
  state.authStatus = 0; state.featureStatus = 403
  assert.equal((await post('101', { reason: '종료' })).status, 403)
  assert.equal(state.rpcCalls.length, 0)
})

test('a missing or another-tenant enrollment is not exposed', async () => {
  assert.equal((await post('202', { reason: '종료' })).status, 404)
})

test('RPC conflicts are reported without a successful enrollment payload', async () => {
  state.rpcError = { code: 'P0001', message: 'INVALID_ENROLLMENT_STATE' }
  const response = await post('101', { reason: '종료' })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).enrollment, undefined)
})

test('post-commit cache failure does not turn a saved lifecycle change into an error', async () => {
  state.cacheFails = true
  const response = await post('101', { reason: '종료' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).enrollment.status, 'cancelled')
})

async function post(id: string, body: unknown) {
  const route = await routeModule
  assert.equal(typeof route?.POST, 'function', 'the lifecycle endpoint must exist')
  return route!.POST(new NextRequest('http://localhost/api/enrollments/' + id + '/end', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) })
}
