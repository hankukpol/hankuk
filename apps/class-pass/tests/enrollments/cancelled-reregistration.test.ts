import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const student = { id: 501, name: '종료 학생', phone: '01012345678', birth_date: '990101', exam_number: 'A101', cohort_option_id: null, photo_url: null }
const enrollment = { id: 101, course_id: 10, student_id: 501, name: student.name, phone: student.phone, exam_number: student.exam_number,
  status: 'cancelled', series: '공채', series_option_id: 1, series_group: 'public', custom_data: {}, refunded_at: null, created_at: '2026-09-01T00:00:00Z' }
const course = { id: 10, enrollment_fields: [], division: 'police', tuition_amount: 0 }
const seriesOption = { id: 1, label: '공채', group_key: 'public', is_active: true, is_default: true }
let writes = 0
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/authenticate') return { authenticateAdminRequest: async () => ({ payload: { accountId: 41 }, error: null }) }
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => undefined }
  if (request === '@/lib/api/error-response') return { handleRouteError: () => Response.json({ error: 'unexpected error' }, { status: 500 }) }
  if (request === '@/lib/class-pass-data') return { getCourseById: async () => course, listMaterialsForCourse: async () => [] }
  if (request === '@/lib/payments/service') return {}
  if (request === '@/lib/branch-series') return {
    listBranchSeriesOptions: async () => [seriesOption], resolveBranchSeriesOptionRequestFromOptions: () => ({ option: seriesOption, error: null }),
    resolveBranchSeriesOptionFromOptions: () => seriesOption, findBranchSeriesOptionByLabel: () => seriesOption,
  }
  if (request === '@/lib/student-cohorts') return {
    assertCohortOptionBelongsToCurrentBranch: async () => null, normalizeCohortNumber: () => undefined,
    attachCohortLabelsToStudents: async (value: unknown) => value, attachCohortLabelsToEnrollments: async (value: unknown) => value,
  }
  if (request === '@/lib/student-profiles') return {
    getStudentProfileById: async () => student, findMatchingStudentProfile: async () => student,
    ensureStudentProfile: async () => ({ student, created: false, changed: false }),
    initializeStudentAuth: async () => ({ student, generatedPin: null }), getLatestStudentEnrollmentGender: async () => null,
    getStudentAuthProfile: () => null, isStudentIdentityConflictError: () => false,
    inspectStudentProfilesBatch: async (_db: unknown, inputs: Array<{ key: string }>) => new Map(inputs.map((input) => [input.key, { student, conflict: null }])),
    ensureStudentProfilesBatch: async (_db: unknown, inputs: Array<{ key: string }>) => new Map(inputs.map((input) => [input.key, { student, changed: false, created: false }])),
    initializeStudentAuthBatch: async (_db: unknown, inputs: Array<{ key: string }>) => ({ results: new Map(inputs.map((input) => [input.key, { student }])), generatedPins: [] }),
    syncStudentEnrollmentSnapshotsBatch: async () => undefined,
  }
  if (request === '@/lib/supabase/server') return { createServerClient: () => ({ from: (table: string) => {
    const query = {
      select() { return this }, eq() { return this }, is() { return this }, order() { return this },
      insert() { writes++; return this }, upsert() { writes++; return this }, update() { writes++; return this },
      async single() { return { data: enrollment, error: null } },
      async maybeSingle() { return { data: table === 'courses' ? course : enrollment, error: null } },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [enrollment], error: null })) },
    }
    return query
  } }) }
  return originalLoad.call(this, request, parent, isMain)
}
const singleModule = import('../../src/app/api/enrollments/route')
const bulkModule = import('../../src/app/api/enrollments/bulk/route')
beforeEach(() => { writes = 0 })
after(() => { Module._load = originalLoad })

test('single registration gives a clear conflict for a cancelled registration without a new enrollment write', async () => {
  const response = await (await singleModule).POST(request({ courseId: 10, studentId: 501, name: student.name, phone: student.phone, student_type: 'academy' }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /수강종료.*복구/)
  assert.equal(writes, 0)
})

test('bulk roster import returns an actionable row error for a cancelled enrollment without updating it', async () => {
  const response = await (await bulkModule).POST(request({ courseId: 10, rows: [{ sourceLineNumber: 2, name: student.name, phone: student.phone, examNumber: 'A101', birthDate: '990101' }] }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.count, 0)
  assert.match(JSON.stringify(result.rowErrors), /수강종료.*복구/)
  assert.equal(writes, 0)
})

function request(body: unknown) {
  return new NextRequest('http://localhost/api/enrollments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
