import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const storageOrigin = 'https://photo-test.invalid'
type Row = Record<string, unknown>
const state = {
  division: 'police',
  students: [] as Row[], enrollments: [] as Row[],
  objects: new Map<string, string>(), removed: [] as string[],
  failUpdate: false, loseUpdateResponse: false, failRemoval: false, cacheFails: false,
  beforeUpdate: null as (() => void) | null,
}

function query(table: string) {
  const filters: Array<[string, unknown]> = []
  let patch: Row | null = null
  const execute = () => {
    if (patch && state.beforeUpdate) {
      const before = state.beforeUpdate
      state.beforeUpdate = null
      before()
    }
    const source = table === 'students' ? state.students : state.enrollments
    const rows = source.filter((row) => filters.every(([key, expected]) => row[key] === expected))
    if (patch && state.failUpdate) return { data: null, error: { message: 'database unavailable' } }
    if (patch) rows.forEach((row) => Object.assign(row, patch))
    if (patch && state.loseUpdateResponse) return { data: null, error: { message: 'response lost after commit' } }
    return { data: rows.map((row) => ({ ...row })), error: null }
  }
  return {
    select() { return this },
    eq(key: string, value: unknown) { filters.push([key, value]); return this },
    is(key: string, value: unknown) { filters.push([key, value]); return this },
    update(value: Row) { patch = value; return this },
    async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] ?? null } },
    then(resolve: (value: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve) },
  }
}
const db = {
  from: query,
  async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, 'set_enrollment_photo_atomic')
    if (state.beforeUpdate) { const before = state.beforeUpdate; state.beforeUpdate = null; before() }
    const enrollment = state.enrollments.find((row) => row.id === args.p_enrollment_id && row['courses.division'] === args.p_division)
    if (!enrollment) return { data: null, error: { code: 'P0002' } }
    const owner = enrollment.student_id ? state.students.find((row) => row.id === enrollment.student_id && row.division === args.p_division) : enrollment
    if (!owner) return { data: null, error: { code: 'P0002' } }
    if (enrollment.student_id !== args.p_student_id || owner.photo_url !== args.p_expected_photo_url) return { data: null, error: { code: 'CP002' } }
    if (state.failUpdate) return { data: null, error: { code: '08006' } }
    owner.photo_url = args.p_photo_url
    if (enrollment.student_id) state.enrollments.filter((row) => row.student_id === enrollment.student_id && row['courses.division'] === args.p_division)
      .forEach((row) => { row.photo_url = args.p_photo_url })
    if (state.loseUpdateResponse) return { data: null, error: { code: '08006' } }
    return { data: { success: true, photo_url: args.p_photo_url }, error: null }
  },
}
const bucket = {
  async upload(path: string, body: Buffer, options: { upsert?: boolean }) {
    if (state.objects.has(path) && !options.upsert) return { error: { message: 'exists' } }
    state.objects.set(path, body.toString())
    return { error: null }
  },
  getPublicUrl(path: string) { return { data: { publicUrl: `${storageOrigin}/storage/v1/object/public/enrollment-photos/${path}` } } },
  async remove(paths: string[]) {
    if (state.failRemoval) return { error: { message: 'storage unavailable' } }
    for (const path of paths) { state.removed.push(path); state.objects.delete(path) }
    return { error: null }
  },
}
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@supabase/supabase-js') return { createClient: () => ({ storage: { from: (name: string) => {
    assert.equal(name, 'enrollment-photos'); return bucket
  } } }) }
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => null }
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => state.division }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { if (state.cacheFails) throw new Error('cache failed') } }
  return originalLoad.call(this, request, parent, isMain)
}
const routePromise = import('../../src/app/api/enrollments/[id]/photo/route')
const savedEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = storageOrigin
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'memory-only'
  state.division = 'police'; state.failUpdate = false; state.loseUpdateResponse = false; state.failRemoval = false; state.cacheFails = false; state.beforeUpdate = null
  state.objects.clear(); state.removed = []
  state.students = [
    { id: 501, division: 'police', photo_url: null },
    { id: 502, division: 'fire', photo_url: null },
  ]
  state.enrollments = [
    { id: 101, student_id: 501, course_id: 1, exam_number: '123456', photo_url: null, 'courses.division': 'police' },
    { id: 102, student_id: 502, course_id: 2, exam_number: '123456', photo_url: null, 'courses.division': 'fire' },
    { id: 501, student_id: null, course_id: 1, exam_number: null, photo_url: null, 'courses.division': 'police' },
  ]
})
after(() => {
  Module._load = originalLoad
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key
})

test('same exam number in police and fire stores two independent photos', async () => {
  assert.equal((await upload(101, 'police image')).status, 200)
  const policeUrl = state.students[0].photo_url
  state.division = 'fire'
  assert.equal((await upload(102, 'fire image')).status, 200)
  assert.notEqual(state.students[1].photo_url, policeUrl)
  assert.equal(state.objects.size, 2)
  assert.equal(state.objects.get(pathOf(policeUrl)), 'police image')
})

test('deleting police photo leaves the same-exam fire photo intact', async () => {
  await upload(101, 'police image')
  state.division = 'fire'; await upload(102, 'fire image')
  const fireUrl = state.students[1].photo_url
  state.division = 'police'
  assert.equal((await remove(101)).status, 200)
  assert.equal(state.students[0].photo_url, null)
  assert.equal(state.students[1].photo_url, fireUrl)
  assert.equal(state.objects.get(pathOf(fireUrl)), 'fire image')
  assert.equal(state.objects.size, 1)
})

test('a shared legacy exam-key photo is detached but never physically deleted', async () => {
  const path = 'by-exam/123456.jpg'
  const url = bucket.getPublicUrl(path).data.publicUrl
  state.objects.set(path, 'legacy shared')
  state.students.forEach((row) => { row.photo_url = url })
  state.enrollments[0].photo_url = url
  assert.equal((await remove(101)).status, 200)
  assert.equal(state.students[0].photo_url, null)
  assert.equal(state.students[1].photo_url, url)
  assert.equal(state.objects.get(path), 'legacy shared')
  assert.deepEqual(state.removed, [])
})

test('student-less enrollment ID cannot collide with a student ID', async () => {
  state.enrollments[0].exam_number = null
  await upload(101, 'student photo')
  await upload(501, 'unlinked enrollment photo')
  assert.equal(state.objects.size, 2)
  assert.notEqual(state.students[0].photo_url, state.enrollments[2].photo_url)
})

test('linked student must belong to the course tenant before photo mutation', async () => {
  state.enrollments[0].student_id = 502
  assert.equal((await upload(101, 'wrong tenant')).status, 404)
  assert.equal((await remove(101)).status, 404)
  assert.equal(state.objects.size, 0)
  assert.equal(state.students[1].photo_url, null)
})

test('another tenant enrollment cannot be uploaded or deleted', async () => {
  assert.equal((await upload(102, 'not allowed')).status, 404)
  assert.equal((await remove(102)).status, 404)
  assert.equal(state.objects.size, 0)
})

test('delete uses the current student photo, not a stale enrollment snapshot', async () => {
  await upload(101, 'current photo')
  state.enrollments[0].photo_url = bucket.getPublicUrl('by-exam/old.jpg').data.publicUrl
  await remove(101)
  assert.equal(state.objects.size, 0)
  assert.equal(state.removed.some((path) => path.startsWith('by-exam/')), false)
})

test('failed DB detachment cannot remove the still-referenced photo', async () => {
  await upload(101, 'keep me')
  const oldUrl = state.students[0].photo_url
  state.failUpdate = true
  assert.equal((await remove(101)).status, 500)
  assert.equal(state.students[0].photo_url, oldUrl)
  assert.equal(state.objects.get(pathOf(oldUrl)), 'keep me')
})

test('delete cannot clear a concurrent replacement or remove its file', async () => {
  await upload(101, 'old photo')
  const newPath = 'police/students/501/00000000-0000-4000-8000-000000000099.jpg'
  const newUrl = bucket.getPublicUrl(newPath).data.publicUrl
  state.objects.set(newPath, 'new photo')
  state.beforeUpdate = () => { state.students[0].photo_url = newUrl }
  assert.equal((await remove(101)).status, 409)
  assert.equal(state.students[0].photo_url, newUrl)
  assert.equal(state.objects.get(newPath), 'new photo')
  assert.deepEqual(state.removed, [])
})

test('an uploaded replacement never overwrites a preexisting object', async () => {
  await upload(101, 'old photo')
  const oldUrl = state.students[0].photo_url
  state.failUpdate = true
  assert.equal((await upload(101, 'new photo')).status, 500)
  assert.equal(state.students[0].photo_url, oldUrl)
  assert.equal(state.objects.get(pathOf(oldUrl)), 'old photo')
})

test('uncertain database outcome never deletes a possibly committed upload', async () => {
  state.loseUpdateResponse = true
  assert.equal((await upload(101, 'committed photo')).status, 500)
  assert.equal(state.objects.get(pathOf(state.students[0].photo_url)), 'committed photo')
  assert.deepEqual(state.removed, [])
})

test('cache failure after upload is reported as a saved photo', async () => {
  state.cacheFails = true
  const response = await upload(101, 'saved')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).photo_url, state.students[0].photo_url)
})

test('unsafe or foreign stored URL is detached without deleting a foreign object', async () => {
  const foreign = 'fire/students/502/00000000-0000-4000-8000-000000000099.jpg'
  state.students[0].photo_url = bucket.getPublicUrl(foreign).data.publicUrl
  state.objects.set(foreign, 'belongs to fire')
  assert.equal((await remove(101)).status, 200)
  assert.deepEqual(state.removed, [])
  assert.equal(state.objects.get(foreign), 'belongs to fire')
})

function pathOf(value: unknown) {
  return new URL(String(value)).pathname.split('/enrollment-photos/')[1]
}
async function upload(id: number, contents: string) {
  const body = new FormData()
  body.set('photo', new File([contents], 'photo.jpg', { type: 'image/jpeg' }))
  return (await routePromise).POST(new NextRequest(`http://localhost/api/enrollments/${id}/photo`, { method: 'POST', body }), { params: Promise.resolve({ id: String(id) }) })
}
async function remove(id: number) {
  return (await routePromise).DELETE(new NextRequest(`http://localhost/api/enrollments/${id}/photo`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(id) }) })
}
