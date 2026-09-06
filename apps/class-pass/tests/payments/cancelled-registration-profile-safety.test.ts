import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, it, type TestContext } from 'node:test'

// These tests catch moving the cancelled preflight below student preparation.
// The real routes, student identity/profile/auth functions, and Supabase client run;
// only request authentication, branch metadata, and external HTTP are isolated.
const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/authenticate') return { authenticateAdminRequest: async () => ({ payload: {}, error: null }) }
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => ({ payload: {}, error: null }) }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/branch-series') {
    const option = { id: 1, group_key: 'public', label: '공채', is_active: true, is_default: true }
    return { listBranchSeriesOptions: async () => [option], resolveBranchSeriesOptionRequestFromOptions: () => ({ option, error: null }) }
  }
  if (request === '@/lib/student-cohorts') return {
    assertCohortOptionBelongsToCurrentBranch: async () => null,
    attachCohortLabelsToEnrollments: async (rows: unknown[]) => rows,
    attachCohortLabelsToStudents: async (rows: unknown[]) => rows,
    normalizeCohortNumber: (value: unknown) => value,
    resolveStudentCohortOptionByNumber: async () => null,
  }
  if (request === '@/lib/class-pass-data') return {
    getCourseById: async (id: number, division: string) => division === 'police' && [101, 102].includes(id)
      ? { id, name: `강좌 ${id}`, division: 'police', status: 'active', tuition_amount: 0 } : null,
    listMaterialsForCourse: async () => [],
  }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => undefined }
  if (request === '@/lib/api/error-response') return {
    handleRouteError: (_scope: string, message: string) => Response.json({ error: message }, { status: 500 }),
  }
  return originalLoad.call(this, request, parent, isMain)
}
after(() => { Module._load = originalLoad })
const routes = {
  single: import('../../src/app/api/enrollments/route'),
  batch: import('../../src/app/api/enrollments/batch/route'),
}

type Row = Record<string, unknown>
const timestamp = '2026-09-05T00:00:00.000Z'
const originalStudent = {
  id: 5, division: 'police', name: '홍길동', phone: '01012345678', exam_number: null,
  birth_date: '990101', auth_method: null, pin_hash: null, photo_url: 'original.jpg',
  cohort_option_id: null, created_at: timestamp, updated_at: timestamp,
}
const originalEnrollment = {
  id: 71, course_id: 101, student_id: 5, name: '홍길동', phone: '01012345678',
  exam_number: null, status: 'cancelled', photo_url: 'original.jpg', created_at: timestamp,
}

function installTransport(t: TestContext, options: { legacy?: boolean; noStudent?: boolean; readError?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    students: options.noStudent ? [] : [structuredClone(originalStudent)],
    enrollments: [{ ...originalEnrollment, student_id: options.legacy ? null : 5 }],
  }
  const before = structuredClone(tables)
  const requests: Array<{ method: string; url: URL }> = []
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cancelled-profile-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  t.after(() => {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
  })
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.equal(url.origin, 'https://cancelled-profile-test.invalid', 'never use a real database')
    const method = init?.method ?? 'GET'
    requests.push({ method, url })
    if (url.pathname.includes('/rpc/')) {
      // Model the final transactional cancelled guard; preflight must avoid reaching it.
      return Response.json({ code: 'P0001', message: '종료된 수강은 재활성화할 수 없습니다.' }, { status: 400 })
    }
    const table = url.pathname.split('/').at(-1)!
    assert.ok(table in tables, `unexpected table ${table}`)
    if (options.readError && table === 'enrollments' && method === 'GET') {
      return Response.json({ code: 'XX000', message: 'test read failed' }, { status: 500 })
    }
    let rows = tables[table].filter((row) => Array.from(url.searchParams).every(([key, value]) => {
      if (['select', 'order', 'limit'].includes(key)) return true
      if (value === 'is.null') return row[key] === null
      if (value === 'not.is.null') return row[key] !== null
      assert.ok(value.startsWith('eq.'), `unexpected filter ${key}=${value}`)
      return String(row[key]) === value.slice(3)
    }))
    if (method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${rows.length}` } })
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init?.body))
      rows.forEach((row) => Object.assign(row, patch))
    } else if (method === 'POST') {
      const row = { id: 99, auth_method: null, pin_hash: null, created_at: timestamp, ...JSON.parse(String(init?.body)) }
      tables[table].push(row)
      rows = [row]
    } else if (method === 'DELETE') {
      tables[table] = tables[table].filter((row) => !rows.includes(row))
      rows = []
    } else {
      assert.equal(method, 'GET')
    }
    const headers = new Headers(init?.headers)
    const singular = headers.get('accept')?.includes('application/vnd.pgrst.object+json')
    return Response.json(singular ? rows[0] ?? null : rows)
  })
  return { tables, before, requests }
}

async function post(kind: keyof typeof routes, changes: Row = {}) {
  const billing = { expectedAmount: 0, payableAmount: 0, discountAmount: 0, tuitionExempt: false }
  const body = {
    name: '홍길동', phone: '01012345678', birth_date: '990101', gender: '남', student_type: 'academy',
    ...(kind === 'single' ? { courseId: 101 } : { registrations: [{ courseId: 102, billing }, { courseId: 101, billing }] }),
    ...changes,
  }
  const { POST } = await routes[kind]
  return POST(new Request(`http://localhost/api/enrollments${kind === 'batch' ? '/batch' : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never)
}

for (const kind of ['single', 'batch'] as const) {
  for (const scenario of [
    { name: 'selected student edits', body: { studentId: 5, updateSelectedStudent: true, photo_url: 'changed.jpg' } },
    { name: 'selected student auth initialization', body: { studentId: 5, updateSelectedStudent: false } },
    { name: 'identity-matched student auth initialization', body: {} },
    { name: 'legacy unlinked enrollment', body: {}, legacy: true },
    { name: 'legacy enrollment without a student master', body: {}, legacy: true, noStudent: true },
  ]) {
    it(`${kind}: cancelled preflight preserves the student and snapshots for ${scenario.name}`, async (t) => {
      const state = installTransport(t, scenario)
      const response = await post(kind, scenario.body)
      assert.deepEqual(state.tables, state.before, 'a rejected registration must not modify shared student/auth/snapshot data')
      assert.equal(response.status, 409)
      assert.match((await response.json()).error, /종료/)
      assert.equal(state.requests.filter((request) => request.method !== 'GET').length, 0, 'no financial or student writes before rejection')
    })
  }

  it(`${kind}: cancelled lookup errors fail closed before student edits`, async (t) => {
    const state = installTransport(t, { readError: true })
    const response = await post(kind, { studentId: 5, updateSelectedStudent: true, photo_url: 'changed.jpg' })
    assert.deepEqual(state.tables, state.before)
    assert.equal(response.status, 500)
    assert.equal(state.requests.filter((request) => request.method !== 'GET').length, 0)
  })

  it(`${kind}: another tenant course is rejected before profile access`, async (t) => {
    const state = installTransport(t)
    const billing = { expectedAmount: 0, payableAmount: 0, discountAmount: 0, tuitionExempt: false }
    const response = await post(kind, kind === 'single'
      ? { courseId: 999, studentId: 5 }
      : { registrations: [{ courseId: 102, billing }, { courseId: 999, billing }], studentId: 5 })
    assert.equal(response.status, 404)
    assert.deepEqual(state.tables, state.before)
    assert.equal(state.requests.length, 0)
  })
}
