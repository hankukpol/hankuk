import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { readAllPages } from '../../src/lib/distribution/read-all-pages'
import { isPendingHandout } from '../../src/lib/distribution/handout-eligibility'
import { buildMaterialSeriesNames, suggestNextMaterialSeries } from '../../src/lib/distribution/material-series'

const require = createRequire(import.meta.url)

test('assignment pagination keeps all 1200 rows, including a lower server cap', async () => {
  for (const cap of [1000, 300]) {
    const source = Array.from({ length: 1200 }, (_, id) => ({ id }))
    const offsets: number[] = []
    const result = await readAllPages(async (offset, size) => {
      offsets.push(offset)
      return source.slice(offset, offset + Math.min(cap, size))
    })
    assert.deepEqual(result, source)
    assert.equal(offsets.at(-1), 1200)
  }
})

test('pagination does not return silently incomplete data on a later failure', async () => {
  await assert.rejects(readAllPages(async (offset) => {
    if (offset) throw new Error('read failed')
    return [{ id: 1 }]
  }), /read failed/)
})

test('unreceived handouts exclude non-target students but include unrestricted materials', () => {
  const row = { receipts: { 1: { id: 100 } }, seatSubjects: { 9: true as const } }
  assert.equal(isPendingHandout(row, { id: 1, subject_id: 9 }), false)
  assert.equal(isPendingHandout(row, { id: 2, subject_id: 9 }), true)
  assert.equal(isPendingHandout(row, { id: 2, subject_id: 8 }), false)
  assert.equal(isPendingHandout(row, { id: 2, subject_id: null }), true)
})

test('weekly material names retain subject text and increment only the round', () => {
  assert.deepEqual(suggestNextMaterialSeries('2026 경찰학 3회차 프린트'), { pattern: '2026 경찰학 {회차}회차 프린트', start: 4, end: 4 })
  assert.equal(suggestNextMaterialSeries('경찰학 5주차').start, 6)
  assert.equal(suggestNextMaterialSeries('경찰학 자료').pattern, '경찰학 자료 {회차}회차')
  assert.deepEqual(buildMaterialSeriesNames(' 경찰학 {회차}회차 ', 2, 4), ['경찰학 2회차', '경찰학 3회차', '경찰학 4회차'])
})

test('material series rejects invalid ranges, missing placeholders and long generated names', () => {
  for (const [start, end] of [[0, 3], [3, 2], [1, 53], [1.5, 2], [1, 1000], [NaN, 2]]) {
    assert.throws(() => buildMaterialSeriesNames('자료 {회차}', start, end))
  }
  assert.throws(() => buildMaterialSeriesNames('자료', 1, 2))
  assert.throws(() => buildMaterialSeriesNames(`${'가'.repeat(99)}{회차}`, 10, 10))
  assert.equal(buildMaterialSeriesNames('자료 {회차}', 1, 52).length, 52)
})

test('bulk assignment reports partial failures, invalidates cache and authorizes before writes', async () => {
  const Module = require('node:module')
  const original = Module._load
  const calls: string[] = []
  let invalidOwnership = false
  let cacheFails = false
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
    if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
    if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
    if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { calls.push('cache'); if (cacheFails) throw new Error('fixture cache failure') } }
    if (request === '@/lib/class-pass-data') return {
      verifyMaterialOwnership: async () => true,
      getMaterialSnapshotById: async () => ({ id: 10, course_id: 8, material_type: 'textbook' }),
      verifyEnrollmentOwnership: async (id: number) => { calls.push(`check:${id}`); return { valid: !invalidOwnership, courseId: 8 } },
      assignTextbook: async (id: number) => { calls.push(`write:${id}`); if (id === 2) throw new Error('fixture write failure'); return { enrollment_id: id, material_id: 10 } },
      isTextbookAssignmentError: () => false,
    }
    return original.call(this, request, parent, isMain)
  }
  try {
    const { POST } = require('../../src/app/api/textbook-assignments/bulk-by-material/route')
    const request = () => new NextRequest('http://localhost/api/textbook-assignments/bulk-by-material', { method: 'POST', body: JSON.stringify({ materialId: 10, enrollmentIds: [1, 2, 3, 1] }) })
    const response = await POST(request())
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(payload.assignments.map((item: { enrollment_id: number }) => item.enrollment_id), [1, 3])
    assert.deepEqual(payload.failures.map((item: { enrollmentId: number }) => item.enrollmentId), [2])
    assert.equal(payload.success_count, 2)
    assert.equal(payload.failed_count, 1)
    assert.deepEqual(calls, ['check:1', 'check:2', 'check:3', 'write:1', 'write:2', 'write:3', 'cache'])
    cacheFails = true
    assert.match((await (await POST(request())).json()).warning, /반영이 늦으면/)
    calls.length = 0
    invalidOwnership = true
    assert.equal((await POST(request())).status, 404)
    assert.equal(calls.some((call) => call.startsWith('write')), false)
  } finally { Module._load = original }
})

test('series API limits ownership, copies settings only and inserts inactive rows once', async () => {
  const Module = require('node:module')
  const original = Module._load
  const writes: Array<Record<string, unknown>[]> = []
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = []
  let allowed = true
  let sourceExists = true
  let subjectExists = true
  let duplicate = false
  let lastOrder = 8
  let insertFails = false
  let cacheFails = false
  let authError: Response | null = null
  let featureError: Response | null = null
  let cacheCalls = 0
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {}
    let columns = ''
    let insert: Record<string, unknown>[] | null = null
    const result = () => {
      reads.push({ table, filters: { ...filters } })
      if (insert) {
        writes.push(insert)
        return insertFails ? { data: null, error: { message: 'fixture failure' } } : { data: insert.map((row, i) => ({ ...row, id: 100 + i })), error: null }
      }
      if (table === 'course_subjects') return { data: subjectExists ? { id: 9 } : null, error: null }
      if (columns.includes('description')) return { data: sourceExists ? { id: 10, description: '지난 설명', subject_id: 9 } : null, error: null }
      if (columns === 'sort_order') return { data: { sort_order: lastOrder }, error: null }
      return { data: duplicate ? [{ id: 10 }] : [], error: null }
    }
    const query = {
      select(value: string) { columns = value; return query },
      eq(key: string, value: unknown) { filters[key] = value; return query },
      in() { return query }, limit() { return query }, order() { return query },
      insert(rows: Record<string, unknown>[]) { insert = rows; return query },
      maybeSingle: async () => result(),
      then(resolve: (value: unknown) => void) { return Promise.resolve(result()).then(resolve) },
    }
    return query
  } }
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => authError }
    if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => featureError }
    if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
    if (request === '@/lib/class-pass-data') return { verifyCourseOwnership: async (id: number, division: string) => { assert.equal(id, 8); assert.equal(division, 'police'); return allowed } }
    if (request === '@/lib/supabase/server') return { createServerClient: () => db }
    if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { cacheCalls++; if (cacheFails) throw new Error('fixture cache failure') } }
    return original.call(this, request, parent, isMain)
  }
  try {
    const { POST } = require('../../src/app/api/materials/series/route')
    const body = { courseId: 8, sourceMaterialId: 10, namePattern: '경찰학 {회차}회차', startRound: 2, endRound: 4, subjectId: 77, description: '변조된 설명', is_active: true }
    const send = (override = {}) => POST(new NextRequest('http://localhost/api/materials/series', { method: 'POST', body: JSON.stringify({ ...body, ...override }) }))
    const response = await send()
    assert.equal(response.status, 201)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].length, 3)
    assert.equal(cacheCalls, 1)
    for (const [index, row] of writes[0].entries()) {
      assert.deepEqual(row, { course_id: 8, name: `경찰학 ${index + 2}회차`, description: '지난 설명', subject_id: 9, material_type: 'handout', is_active: false, sort_order: 9 + index })
    }
    assert.deepEqual(new Set(reads.map((entry) => entry.table)), new Set(['materials', 'course_subjects']))
    assert.ok(reads.some((entry) => entry.filters.id === 10 && entry.filters.course_id === 8 && entry.filters.material_type === 'handout'))
    assert.equal((await send({ endRound: 60 })).status, 400)
    allowed = false
    assert.equal((await send()).status, 404)
    allowed = true; sourceExists = false
    assert.equal((await send()).status, 404)
    sourceExists = true; subjectExists = false
    assert.equal((await send()).status, 400)
    subjectExists = true; duplicate = true
    assert.equal((await send()).status, 409)
    duplicate = false; lastOrder = 998
    assert.equal((await send()).status, 400)
    lastOrder = 8; authError = Response.json({}, { status: 401 })
    assert.equal((await send()).status, 401)
    authError = null; featureError = Response.json({}, { status: 403 })
    assert.equal((await send()).status, 403)
    assert.equal(writes.length, 1, 'invalid requests must never insert')
    featureError = null; insertFails = true
    assert.equal((await send()).status, 500)
    assert.equal(cacheCalls, 1)
    insertFails = false; cacheFails = true
    const saved = await send({ sourceMaterialId: undefined, subjectId: null, description: '공통 설명' })
    assert.equal(saved.status, 201)
    assert.match((await saved.json()).warning, /저장됐습니다/)
    assert.equal(writes.at(-1)?.[0].description, '공통 설명')
    assert.equal(writes.at(-1)?.[0].subject_id, null)
  } finally { Module._load = original }
})
