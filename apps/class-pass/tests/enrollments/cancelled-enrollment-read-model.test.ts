import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const rows = [
  row(1, 'active'), row(2, 'active', '2026-09-01T00:00:00Z'), row(3, 'refunded'),
  row(4, 'cancelled', '2026-09-01T00:00:00Z'), row(5, 'cancelled'), row(6, 'cancelled', null, 99),
]

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'next/cache') return { unstable_cache: (fn: unknown) => fn }
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
  if (request === '@/lib/app-config') return { getAppConfig: async () => ({}) }
  if (request === '@/lib/attendance/service') return { listAttendanceDeviceStatesForCourse: async () => new Map() }
  if (request === '@/lib/designated-seat/service') return {}
  if (request === '@/lib/class-pass-data-pass') return {}
  if (request === '@/lib/student-profiles') return { mergeEnrollmentStudentSnapshot: (value: unknown) => value }
  if (request === '@/lib/student-cohorts') return { attachCohortLabelsToEnrollments: async (value: unknown) => value, getCohortLabelMap: async () => new Map() }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({ from: (table: string) => query(table === 'enrollments' ? rows : []) }) }
  return originalLoad.call(this, request, parent, isMain)
}
const dataModule = import('../../src/lib/class-pass-data')
const historyModule = import('../../src/app/api/enrollments/[id]/student-history/route')
after(() => { Module._load = originalLoad })

test('cancelled roster filter applies to both result rows and total while summaries retain all lifecycle states', async () => {
  const result = await (await dataModule).listCourseEnrollmentsPaged(10, { status: 'cancelled' as never, limit: 1 })
  assert.deepEqual(result.enrollments.map((entry) => entry.id), [4])
  assert.equal(result.total, 2)
  assert.deepEqual(result.summary, { active: 1, suspended: 1, refunded: 1, cancelled: 2 })
})

test('active and suspended filters never return cancelled rows with old suspension metadata', async () => {
  const data = await dataModule
  assert.deepEqual((await data.listCourseEnrollmentsPaged(10, { status: 'active' })).enrollments.map((entry) => entry.id), [1])
  assert.deepEqual((await data.listCourseEnrollmentsPaged(10, { status: 'suspended' })).enrollments.map((entry) => entry.id), [2])
})

test('student history reports cancelled separately from suspended and includes its termination audit fields', async () => {
  const response = await (await historyModule).GET(new NextRequest('http://localhost/api/enrollments/4/student-history'), { params: Promise.resolve({ id: '4' }) })
  assert.equal(response.status, 200)
  const payload = await response.json()
  const cancelled = payload.history.find((entry: { enrollment_id: number }) => entry.enrollment_id === 4)
  assert.equal(cancelled.lifecycle_status, 'cancelled')
  assert.equal(cancelled.ended_at, '2026-09-05T09:00:00Z')
  assert.equal(cancelled.ended_reason, '개인 사정')
  assert.deepEqual(payload.active.map((entry: { enrollment_id: number }) => entry.enrollment_id), [1])
})

function row(id: number, status: string, suspendedAt: string | null = null, courseId = 10) {
  return {
    id, course_id: courseId, student_id: 501, name: '학생', phone: '01012345678', exam_number: null,
    status, suspended_at: suspendedAt, refunded_at: null, series: null, series_group: 'public',
    student_type: 'academy', created_at: '2026-09-01T00:00:00Z',
    ended_at: status === 'cancelled' ? '2026-09-05T09:00:00Z' : null,
    ended_reason: status === 'cancelled' ? '개인 사정' : null,
    students: null, courses: { id: courseId, name: '강좌', slug: 'course', status: 'active', division: courseId === 99 ? 'fire' : 'police' },
  }
}

function query(source: typeof rows) {
  let selected = source.slice()
  let countOnly = false
  let range: [number, number] | null = null
  const value = (entry: (typeof rows)[number], key: string): unknown => key === 'courses.division' ? entry.courses.division : entry[key as keyof typeof entry]
  const builder = {
    select(_columns: string, options?: { head?: boolean }) { countOnly = Boolean(options?.head); return this },
    eq(key: string, expected: unknown) { selected = selected.filter((entry) => value(entry, key) === expected); return this },
    is(key: string, expected: unknown) { return this.eq(key, expected) },
    not(key: string, _operator: string, expected: unknown) { selected = selected.filter((entry) => value(entry, key) !== expected); return this },
    in(key: string, values: unknown[]) { selected = selected.filter((entry) => values.includes(value(entry, key))); return this },
    order() { return this },
    range(from: number, to: number) { range = [from, to]; return this },
    async maybeSingle() { return { data: selected[0] ?? null, error: null } },
    then(resolve: (result: { data: typeof rows | null; count: number; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: countOnly ? null : range ? selected.slice(range[0], range[1] + 1) : selected, count: selected.length, error: null }))
    },
  }
  return builder
}
