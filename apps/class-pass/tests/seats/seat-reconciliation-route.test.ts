import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)

test('fresh seat recovery bypasses stale cache, reads every page, and retains course/tenant guards', async () => {
  const Module = require('node:module'), originalLoad = Module._load
  let authorized = true, owned = true, reads = 0
  const offsets: number[] = []
  const rows = [
    { id: 10, enrollment_id: 1, subject_id: 2, seat_number: 'A-8', course_subjects: { id: 2, course_id: 8, name: '형사법', sort_order: 1 } },
    { id: 11, enrollment_id: 2, subject_id: 2, seat_number: 'A-9', course_subjects: { id: 2, course_id: 8, name: '형사법', sort_order: 1 } },
  ]
  const db = createClient('http://127.0.0.1:9999', 'local-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      reads++
      const url = new URL(String(input))
      assert.equal(url.pathname, '/rest/v1/seat_assignments')
      assert.equal(url.searchParams.get('course_subjects.course_id'), 'eq.8')
      assert.match(url.searchParams.get('select') ?? '', /course_subjects!inner/)
      assert.equal(url.searchParams.get('order'), 'id.asc')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      offsets.push(offset)
      // A server-side cap below the requested range must not truncate recovery.
      return Response.json(rows.slice(offset, offset + 1))
    } },
  })
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => authorized ? null : Response.json({ error: 'unauthorized' }, { status: 401 }) }
    if (id === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
    if (id === '@/lib/supabase/server') return { createServerClient: () => db }
    if (id === '@/lib/class-pass-data') return {
      verifyCourseOwnership: async (courseId: number, tenant: string) => { assert.equal(courseId, 8); assert.equal(tenant, 'police'); return owned },
      listCourseSubjects: async () => [rows[0].course_subjects],
      listSeatAssignmentsForCourse: async () => [{ ...rows[0], seat_number: 'STALE' }],
    }
    return originalLoad.call(this, id, parent, isMain)
  }
  try {
    const { GET } = require('../../src/app/api/seats/route')
    const response = await GET(new NextRequest('http://localhost/api/seats?courseId=8&fresh=1'))
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(result.seatAssignments.map((row: { seat_number: string }) => row.seat_number), ['A-8', 'A-9'])
    assert.deepEqual(offsets, [0, 1, 2])
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    const before = reads
    owned = false
    assert.equal((await GET(new NextRequest('http://localhost/api/seats?courseId=8&fresh=1'))).status, 404)
    authorized = false
    assert.equal((await GET(new NextRequest('http://localhost/api/seats?courseId=8&fresh=1'))).status, 401)
    assert.equal(reads, before, 'rejected requests must never read privileged seat rows')
  } finally { Module._load = originalLoad }
})
