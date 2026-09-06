import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import { normalizeTenantType } from '../../src/lib/tenant'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const rows = [
  { id: 1, status: 'active', suspended_at: null },
  { id: 2, status: 'active', suspended_at: '2026-09-01T00:00:00Z' },
  { id: 3, status: 'refunded', suspended_at: null },
  { id: 4, status: 'cancelled', suspended_at: null },
  { id: 5, status: 'cancelled', suspended_at: '2026-09-01T00:00:00Z' },
].map((entry) => ({ ...entry, course_id: 10, student_id: entry.id, name: '학생' + entry.id, phone: '01012345678', courses: { division: 'police' } }))
const state = { refundStatus: 'cancelled', cancelBeforeUpdate: false, writes: 0 }

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => undefined }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/class-pass-data') return { verifyEnrollmentOwnership: async () => ({ valid: true, courseId: 10 }) }
  if (request === '@/lib/student-profiles') return { getPendingStudentAuthStats: async () => ({ total: 0, birthDateReadyCount: 0, pinRequiredCount: 0 }) }
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({ from: query }) }
  return originalLoad.call(this, request, parent, isMain)
}
const dashboard = import('../../src/lib/dashboard-stats')
const refund = import('../../src/app/api/enrollments/[id]/refund/route')
beforeEach(() => { state.refundStatus = 'cancelled'; state.cancelBeforeUpdate = false; state.writes = 0 })
after(() => { Module._load = originalLoad })

test('dashboard active and suspended KPIs exclude terminated registrations', async () => {
  const result = await (await dashboard).getDashboardStats(normalizeTenantType('police')!)
  assert.equal(result.overview.activeEnrollmentCount, 1)
  assert.equal(result.overview.activeUniqueStudents, 1)
  assert.equal(result.overview.suspendedEnrollmentCount, 1)
  assert.equal(result.courses[0].activeStudents, 1)
  assert.equal(result.courses[0].refundedStudents, 1)
})

test('legacy refund endpoint cannot overwrite a cancelled lifecycle even with zero paid balance', async () => {
  const response = await postRefund()
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /수강종료/)
  assert.equal(state.refundStatus, 'cancelled')
  assert.equal(state.writes, 0)
})

test('a concurrent cancellation is not overwritten after the legacy refund check', async () => {
  state.refundStatus = 'active'; state.cancelBeforeUpdate = true
  const response = await postRefund()
  assert.equal(response.status, 409)
  assert.equal(state.refundStatus, 'cancelled')
  assert.equal(state.writes, 0)
})

async function postRefund() {
  return (await refund).POST(new NextRequest('http://localhost/api/enrollments/4/refund', { method: 'POST' }), { params: Promise.resolve({ id: '4' }) })
}

function query(table: string) {
  let updating = false
  let excludeCancelled = false
  return {
    select() { return this }, eq() { return this }, in() { return this }, is() { return this }, gt() { return this }, order() { return this },
    neq(key: string, value: unknown) { excludeCancelled = key === 'status' && value === 'cancelled'; return this },
    update() { updating = true; if (state.cancelBeforeUpdate) state.refundStatus = 'cancelled'; return this },
    async maybeSingle() {
      if (!updating) return { data: { id: 4, status: state.refundStatus, course_id: 10 }, error: null }
      if (excludeCancelled && state.refundStatus === 'cancelled') return { data: null, error: null }
      state.writes++; state.refundStatus = 'refunded'
      return { data: { id: 4, status: 'refunded' }, error: null }
    },
    then(resolve: (value: unknown) => unknown) {
      const data = table === 'courses' ? [{ id: 10, name: '강좌', course_type: 'lecture' }] : table === 'enrollments' ? rows : []
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
}
