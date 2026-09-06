import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)

test('committed results survive cache failures and later RPC rejection', async () => {
  const Module = require('node:module')
  const original = Module._load
  let failSecond = false
  let throwSecond = false
  let calls = 0
  const db = {
    async rpc() {
      calls++
      if (throwSecond && calls === 2) throw new Error('fixture transport failure')
      return { error: null, data: failSecond && calls === 2 ? { success: false, reason: 'NOT_ASSIGNED' } : { success: true, log_id: calls, material_name: `자료${calls}`, distributed_at: '2026-09-05T01:00:00Z' } }
    },
    from() {
      const query = { select() { return query }, in: async () => ({ data: null, error: new Error('fixture follow-up read failure') }) }
      return query
    },
  }
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { throw new Error('fixture cache failure') } }
    if (request === '@/lib/supabase/server') return { createServerClient: () => db }
    if (request === '@/lib/class-pass-data') return { getUnreceivedMaterialsForEnrollment: async () => [], verifyEnrollmentOwnership: async () => ({ valid: true, courseId: 8 }) }
    if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
    return original.call(this, request, parent, isMain)
  }
  try {
    const { distributeMaterialsToEnrollment } = require('../../src/lib/distribution/service')
    const params = { enrollmentId: 1, studentName: '검증학생', materials: [10, 11].map(id => ({ id, name: `자료${id}`, material_type: 'handout' })) }
    const success = await distributeMaterialsToEnrollment(params)
    assert.equal(success.kind, 'distributed')
    assert.deepEqual(success.materials.map((row: { id: number }) => row.id), [10, 11])
    assert.equal(success.refreshRequired, true)
    failSecond = true; calls = 0
    const partial = await distributeMaterialsToEnrollment(params)
    assert.equal(partial.kind, 'partial')
    assert.equal(partial.reason, 'NOT_ASSIGNED')
    assert.deepEqual(partial.materials.map((row: { id: number }) => row.id), [10])
    assert.equal(partial.refreshRequired, true)
    throwSecond = true; calls = 0
    const interrupted = await distributeMaterialsToEnrollment(params)
    assert.equal(interrupted.kind, 'partial')
    assert.deepEqual(interrupted.materials.map((row: { id: number }) => row.id), [10])
    assert.equal(interrupted.refreshRequired, true)
    throwSecond = false; calls = 0
    const { POST } = require('../../src/app/api/distribution/manual/route')
    const response = await POST(new NextRequest('http://localhost/api/distribution/manual', { method: 'POST', body: JSON.stringify({ enrollmentId: 1, materialIds: [10, 11] }) }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.success_count, 1)
    assert.equal(payload.failed_count, 1)
    assert.equal(payload.refreshRequired, true)
    assert.equal(payload.logs[0].distributed_at, '2026-09-05T01:00:00Z', 'use committed timestamp, never fabricate one after a failed read')
  } finally { Module._load = original }
})
