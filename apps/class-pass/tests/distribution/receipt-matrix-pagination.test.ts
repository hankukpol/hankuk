import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)

test('receipt matrix reads every row under normal and lower caps, failing closed on page errors', async () => {
  const Module = require('node:module')
  const original = Module._load
  let cap = 300
  let failPage = false
  let allowed = true
  const offsets: Record<string, number[]> = { distribution_logs: [], seat_assignments: [] }
  const fixture = Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, enrollment_id: i + 1, material_id: 10, subject_id: 9, distributed_at: '2026-09-05T00:00:00Z' }))
  const db = { from(table: string) {
    const query = {
      select() { return query }, in() { return query }, eq() { return query }, order() { return query },
      async range(start: number, end: number) {
        offsets[table].push(start)
        if (failPage && start > 0) return { data: null, error: new Error('fixture later page failure') }
        return { data: fixture.slice(start, Math.min(end + 1, start + cap)), error: null }
      },
    }
    return query
  } }
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
    if (request === '@/lib/class-pass-data') return {
      verifyCourseOwnership: async () => allowed,
      listMaterialsForCourse: async () => [{ id: 10, subject_id: 9, material_type: 'handout' }],
      getTextbookAssignmentsByCourse: async () => [],
    }
    if (request === '@/lib/supabase/server') return { createServerClient: () => db }
    return original.call(this, request, parent, isMain)
  }
  try {
    const { GET } = require('../../src/app/api/distribution/receipt-matrix/route')
    const request = () => new NextRequest('http://localhost/api/distribution/receipt-matrix?courseId=8&materialType=handout')
    for (const limit of [300, 1000]) {
      cap = limit
      offsets.distribution_logs = []; offsets.seat_assignments = []
      const response = await GET(request())
      const payload = await response.json()
      assert.equal(response.status, 200)
      assert.equal(payload.logs.length, 1200, `receipt rows with cap ${cap}`)
      assert.equal(payload.seatAssignments.length, 1200, `seat rows with cap ${cap}`)
      assert.equal(new Set(payload.logs.map((row: { id: number }) => row.id)).size, 1200)
      assert.deepEqual(offsets.distribution_logs, cap === 300 ? [0, 300, 600, 900, 1200] : [0, 1000, 1200])
      assert.deepEqual(offsets.seat_assignments, offsets.distribution_logs)
    }
    failPage = true
    assert.equal((await GET(request())).status, 500, 'never return a successful truncated matrix')
    allowed = false
    offsets.distribution_logs = []
    assert.equal((await GET(request())).status, 404)
    assert.deepEqual(offsets.distribution_logs, [], 'foreign course must not query receipts')
  } finally { Module._load = original }
})
