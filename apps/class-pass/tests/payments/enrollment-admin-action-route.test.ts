import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test, beforeEach, after } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
const require = createRequire(import.meta.url)
const Module = require('node:module')
const original = Module._load
const state = { denied: false, disabled: false, writes: 0, cacheFailure: false, rpcError: null as null | { code: string; message: string } }
const db = {
  from(table: string) {
    assert.equal(table, 'enrollment_admin_actions')
    const q = { select() { return q }, eq() { return q }, async maybeSingle() { return { data: null, error: null } } }
    return q
  },
  async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(args.p_division, 'police'); assert.equal(args.p_enrollment_id, 77)
    if (name === 'enrollment_admin_action_preview') return { data: { enrollmentId: 77, name: '검증 학생', examNumber: 'TEST-77', revision: 'a'.repeat(32), blockers: ['private_table'] }, error: null }
    assert.equal(name, 'manage_enrollment_atomic'); assert.equal(args.p_actor_staff_id, 9)
    state.writes++
    return { data: { success: true, action: args.p_action, enrollmentId: 77 }, error: state.rpcError }
  },
}
Module._load = function(name: string, parent: unknown, main: boolean) {
  if (name === '@/lib/auth/authenticate') return { authenticateAdminRequest: async () => ({ error: state.denied ? NextResponse.json({}, { status: 401 }) : null, payload: { accountId: 9 } }) }
  if (name === '@/lib/app-feature-guard') return { requireAppFeature: async () => state.disabled ? NextResponse.json({}, { status: 403 }) : null }
  if (name === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (name === '@/lib/supabase/server') return { createServerClient: () => db }
  if (name === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (state.cacheFailure) throw new Error('cache offline') } }
  return original.call(this, name, parent, main)
}
const route = require('../../src/app/api/enrollments/[id]/admin-action/route')
after(() => { Module._load = original })
beforeEach(() => Object.assign(state, { denied: false, disabled: false, writes: 0, cacheFailure: false, rpcError: null }))
const params = { params: Promise.resolve({ id: '77' }) }
const input = { action: 'resume', reason: '오종료 복구', requestId: '00000000-0000-4000-8000-000000000007', revision: 'a'.repeat(32) }
const request = (patch = {}) => new NextRequest('http://localhost/api/enrollments/77/admin-action', { method: 'POST', body: JSON.stringify({ ...input, ...patch }) })
test('authentication and feature checks prevent mutations', async () => {
  state.denied = true; assert.equal((await route.POST(request(), params)).status, 401)
  state.denied = false; state.disabled = true; assert.equal((await route.POST(request(), params)).status, 403)
  assert.equal(state.writes, 0)
})
test('empty reason and unconfirmed purge are rejected before mutation', async () => {
  assert.equal((await route.POST(request({ reason: ' ' }), params)).status, 400)
  assert.equal((await route.POST(request({ action: 'purge' }), params)).status, 400)
  assert.equal(state.writes, 0)
})
test('wrong student confirmation cannot delete a record', async () => {
  assert.equal((await route.POST(request({ action: 'purge', confirmText: 'TEST-88 다른 학생', mistakenPaymentConfirmed: true }), params)).status, 400)
  assert.equal(state.writes, 0)
})
test('confirmed purge routes to tenant scoped atomic command', async () => {
  const response = await route.POST(request({ action: 'purge', confirmText: 'TEST-77 검증 학생', mistakenPaymentConfirmed: true }), params)
  assert.equal(response.status, 200); assert.equal((await response.json()).result.action, 'purge'); assert.equal(state.writes, 1)
})
test('cache failure never misreports a committed operation as failure', async () => {
  state.cacheFailure = true
  const response = await route.POST(request(), params)
  assert.equal(response.status, 200); assert.equal((await response.json()).refreshRequired, true)
})
test('stale preview yields conflict without exposing SQL', async () => {
  state.rpcError = { code: '40001', message: 'private SQL' }
  const response = await route.POST(request(), params)
  assert.equal(response.status, 409); assert.doesNotMatch(JSON.stringify(await response.json()), /private SQL/)
})
test('preview omits internal table names', async () => {
  const response = await route.GET(new NextRequest('http://localhost/api/enrollments/77/admin-action'), params)
  assert.equal(response.status, 200); assert.doesNotMatch(JSON.stringify(await response.json()), /private_table|blockers/)
})
