import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
const require = createRequire(import.meta.url)

test('single material POST preserves committed success and binds retry identity to tenant and payload', async () => {
  const Module = require('node:module'), original = Module._load
  const calls: unknown[] = []
  const material = { id: 92, course_id: 8, name: '프린트', material_type: 'handout' }
  let conflict = false
  const db = {
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: material, error: null }) }) }) }),
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args])
      return { data: conflict ? { success: false, reason: 'IDEMPOTENCY_CONFLICT' } : { success: true, material }, error: null }
    },
  }
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (id === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (id === '@/lib/tenant.server') return { getServerTenantType: async () => 'fire' }
    if (id === '@/lib/class-pass-data') return { getCourseById: async () => ({ id: 8 }) }
    if (id === '@/lib/cache/revalidate') return { invalidateCache: async () => { throw new Error('injected cache failure') } }
    if (id === '@/lib/supabase/server') return { createServerClient: () => db }
    return original.call(this, id, parent, isMain)
  }
  try {
    const { POST } = require('../../src/app/api/materials/route')
    const body = { courseId: 8, name: '프린트', requestId: '4e22727a-9ac3-48e4-8a54-136c5f51cb84' }
    const send = (value = body) => POST(new NextRequest('http://localhost/api/materials', { method: 'POST', body: JSON.stringify(value) }))
    const response = await send()
    assert.equal(response.status, 201)
    const payload = await response.json()
    assert.deepEqual(payload.material, material)
    assert.equal(payload.refreshRequired, true)
    assert.equal(typeof payload.warning, 'string')
    assert.deepEqual(calls[0], ['create_material_atomic', {
      p_division: 'fire', p_request_id: body.requestId, p_course_id: 8,
      p_payload: { name: '프린트', description: null, is_active: true, sort_order: 0, material_type: 'handout', subject_id: null },
    }])
    assert.equal((await send()).status, 201)
    assert.deepEqual(calls[1], calls[0], 'retry must address the same persisted logical request')
    conflict = true
    assert.equal((await send({ ...body, name: '다른 내용' })).status, 409)
    assert.equal((await send({ ...body, requestId: 'invalid' })).status, 400)
  } finally { Module._load = original }
})
