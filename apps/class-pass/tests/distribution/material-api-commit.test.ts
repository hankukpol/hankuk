import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
const require = createRequire(import.meta.url)

test('committed assignment and unassignment remain successful when cache refresh fails', async () => {
  const Module = require('node:module'), original = Module._load
  const assignment = { id: 90, enrollment_id: 8, material_id: 10 }
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (id === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (id === '@/lib/tenant.server') return { getServerTenantType: async () => 'fire' }
    if (id === '@/lib/cache/revalidate') return { invalidateCache: async () => { throw new Error('injected postcommit cache failure') } }
    if (id === '@/lib/class-pass-data') return {
      verifyEnrollmentOwnership: async () => ({ valid: true }), verifyMaterialOwnership: async () => true,
      assignTextbook: async () => assignment, unassignTextbook: async () => undefined,
      bulkAssignTextbooks: async () => [assignment], isTextbookAssignmentError: () => false,
    }
    return original.call(this, id, parent, isMain)
  }
  try {
    const single = require('../../src/app/api/textbook-assignments/route')
    const bulk = require('../../src/app/api/textbook-assignments/bulk/route')
    for (const [handler, method, body] of [[single.POST, 'POST', { enrollmentId: 8, materialId: 10 }],
      [single.DELETE, 'DELETE', { enrollmentId: 8, materialId: 10 }], [bulk.POST, 'POST', { enrollmentId: 8, materialIds: [10] }]] as const) {
      const response = await handler(new NextRequest('http://localhost/api/textbook-assignments', { method, body: JSON.stringify(body) }))
      assert.equal(response.status, 200)
      const payload = await response.json()
      assert.equal(payload.refreshRequired, true)
      assert.equal(typeof payload.warning, 'string')
      assert.ok(payload.assignment || payload.assignments || payload.success)
    }
  } finally { Module._load = original }
})

test('material DELETE uses tenant-aware atomic RPC and retains committed success after cache failure', async () => {
  const Module = require('node:module'), original = Module._load
  let reason: string | undefined
  const calls: unknown[] = []
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (id === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (id === '@/lib/tenant.server') return { getServerTenantType: async () => 'fire' }
    if (id === '@/lib/class-pass-data') return { verifyMaterialOwnership: async () => true }
    if (id === '@/lib/cache/revalidate') return { invalidateCache: async () => { throw new Error('injected postcommit cache failure') } }
    if (id === '@/lib/supabase/server') return { createServerClient: () => ({ rpc: async (name: string, args: unknown) => {
      calls.push([name, args]); return { data: { success: !reason, reason }, error: null }
    } }) }
    return original.call(this, id, parent, isMain)
  }
  try {
    const { DELETE } = require('../../src/app/api/materials/[id]/route')
    const remove = () => DELETE(new NextRequest('http://localhost/api/materials/10', { method: 'DELETE' }), { params: Promise.resolve({ id: '10' }) })
    const response = await remove()
    assert.equal(response.status, 200)
    assert.deepEqual(calls[0], ['delete_material_atomic', { p_division: 'fire', p_material_id: 10 }])
    const payload = await response.json()
    assert.equal(payload.success, true); assert.equal(payload.refreshRequired, true)
    reason = 'HAS_RECEIPTS'; assert.equal((await remove()).status, 400)
    reason = 'HAS_ASSIGNMENTS'; assert.equal((await remove()).status, 400)
    reason = 'MATERIAL_NOT_FOUND'; assert.equal((await remove()).status, 404)
  } finally { Module._load = original }
})
