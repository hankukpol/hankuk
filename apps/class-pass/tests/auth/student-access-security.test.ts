import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import { hashSync } from 'bcryptjs'
import { SignJWT, decodeJwt } from 'jose'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const originalFetch = global.fetch
process.env.JWT_SECRET = 'student-security-fixture-secret-32-characters-minimum'
const student = { id: 7, division: 'police', name: '검증학생', phone: '01012345678', auth_method: 'pin', pin_hash: hashSync('1234', 4), birth_date: null }
const enrollment = { id: 12, student_id: 7, course_id: 8, name: student.name, phone: student.phone, status: 'active', suspended_at: null, billing_status: 'unpaid' }
const state = { student: { ...student }, enrollment: { ...enrollment }, missingStudent: false, division: 'police', payloadReads: 0, payloadStudentId: 0 }
const db = {
  from(table: string) {
    const filters: Array<[string, unknown]> = []
    const query: any = {
      select() { return query }, eq(key: string, value: unknown) { filters.push([key, value]); return query },
      maybeSingle: async () => {
        const row = table === 'students' ? (state.missingStudent ? null : state.student)
          : table === 'courses' ? { id: 8, division: state.division, status: 'active' }
            : state.enrollment
        return { data: row && filters.every(([key, value]) => !(key in row) || (row as any)[key] === value) ? row : null, error: null }
      },
    }
    return query
  },
}
Module._load = function(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => state.division }
  if (request === '@/lib/app-config') return { getAppConfig: async () => ({ student_login_enabled: true, student_courses_enabled: true, student_pass_enabled: true }) }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/auth/rateLimiter') return { getClientIp: () => 'fixture', peekRateLimit: async () => ({ allowed: true }), checkRateLimit: async () => ({ allowed: true }), resetRateLimit: async () => {}, recordRateLimitFailure: async () => {} }
  if (request === '@/lib/student-profiles') return { findMatchingStudentProfile: async () => state.student, isStudentIdentityConflictError: () => false }
  if (request === '@/lib/class-pass-data') return {
    listStudentCoursesForStudent: async () => [{ course: { id: 8 }, enrollment_id: 12 }],
    buildPassPayload: async (params: { studentId: number }) => { state.payloadReads++; state.payloadStudentId = params.studentId; return { kind: 'ok', payload: { qrToken: 'fixture-private-qr' } } },
    buildArchivedPassPayload: async (params: { studentId: number }) => { state.payloadReads++; state.payloadStudentId = params.studentId; return { kind: 'ok', payload: { receipts: {} } } },
  }
  return originalLoad.call(this, request, parent, isMain)
}
global.fetch = async () => { throw new Error('Network is forbidden in student security tests') }
const lookup = require('../../src/app/api/enrollments/lookup/route').POST
const pass = require('../../src/app/api/enrollments/pass/route').POST
const archivedPass = require('../../src/app/api/enrollments/archived-pass/route').POST
const attendance = require('../../src/lib/attendance/service').verifyStudentAttendanceAccess
const seats = require('../../src/lib/designated-seat/service').verifyStudentSeatAccess
const privateRoutes = [
  ['pass', pass], ['archived-pass', archivedPass],
  ...['attendance/submit', 'designated-seats/auth', 'designated-seats/reserve', 'designated-seats/state', 'designated-seats/scan-events', 'presence/exception-request']
    .map(path => [path, require(`../../src/app/api/${path}/route`).POST]),
] as const
const request = (cookie = '', body: Record<string, unknown> = {}) => new NextRequest('http://localhost/police/api/enrollments/pass', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
  body: JSON.stringify({ enrollmentId: 12, courseId: 8, courseSlug: 'fixture', name: student.name, phone: student.phone, ...body }),
})
beforeEach(() => Object.assign(state, { student: { ...student }, enrollment: { ...enrollment }, missingStudent: false, division: 'police', payloadReads: 0, payloadStudentId: 0 }))
after(() => { Module._load = originalLoad; global.fetch = originalFetch })

for (const [name, handler] of privateRoutes) {
  test(`${name}: identity fields without a verified student session cannot access private routes`, async () => {
    const response = await handler(request())
    assert.equal(response.status, 401)
    assert.equal(state.payloadReads, 0)
  })
}
for (const [name, helper] of [['attendance', attendance], ['seat', seats]] as const) {
  for (const status of ['suspended', 'cancelled', 'refunded']) {
    test(`${name}: ${status} enrollment cannot use student access`, async () => {
      Object.assign(state.enrollment, status === 'suspended' ? { suspended_at: '2026-09-06T00:00:00Z' } : { status })
      assert.equal(await helper({ courseId: 8, enrollmentId: 12, studentId: 7, name: student.name, phone: student.phone, division: 'police' }), null)
    })
  }
  test(`${name}: active unpaid enrollment stays eligible`, async () => {
    assert.ok(await helper({ courseId: 8, enrollmentId: 12, studentId: 7, name: student.name, phone: student.phone, division: 'police' }))
  })
  test(`${name}: a verified different student cannot use an enrollment`, async () => {
    assert.equal(await helper({ courseId: 8, enrollmentId: 12, studentId: 9, name: student.name, phone: student.phone, division: 'police' }), null)
  })
}
test('actual PIN login issues an HttpOnly student cookie, not credential material', async () => {
  const response = await lookup(request('', { verificationCode: '1234' }))
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie') ?? ''
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /class_pass_student_police=/)
  assert.doesNotMatch(JSON.stringify(await response.json()), /pin_hash|birth_date|credential/)
})
test('incorrect PIN cannot issue a session', async () => {
  const response = await lookup(request('', { verificationCode: '9999' }))
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('set-cookie'), null)
})

async function loginCookie() {
  const response = await lookup(request('', { verificationCode: state.student.auth_method === 'birth_date' ? '990101' : '1234' }))
  assert.equal(response.status, 200)
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

test('verified PIN session can retrieve a pass with server-bound student identity', async () => {
  assert.equal((await pass(request(await loginCookie(), { studentId: 99 }))).status, 200)
  assert.equal(state.payloadReads, 1)
  assert.equal(state.payloadStudentId, 7, 'ignore client-supplied student identity')
})
for (const mutation of ['tampered', 'wrong-division', 'deleted', 'pin-reset', 'auth-removed', 'auth-method-changed'] as const) {
  test(`student session rejects ${mutation} before private payload retrieval`, async () => {
    let cookie = await loginCookie()
    if (mutation === 'tampered') cookie = cookie.slice(0, -8) + 'aaaaaaaa'
    if (mutation === 'wrong-division') { state.division = 'fire'; cookie = cookie.replace('_police=', '_fire=') }
    if (mutation === 'deleted') state.missingStudent = true
    if (mutation === 'pin-reset') state.student.pin_hash = hashSync('1234', 4)
    if (mutation === 'auth-removed') state.student.auth_method = null as any
    if (mutation === 'auth-method-changed') state.student.auth_method = 'birth_date'
    const response = await pass(request(cookie))
    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, 'STUDENT_SESSION_REQUIRED')
    assert.equal(state.payloadReads, 0)
  })
}
for (const invalidClaim of ['expired', 'wrong-role', 'wrong-audience', 'wrong-issuer', 'missing-expiry'] as const) {
  test(`student session rejects signed ${invalidClaim} token`, async () => {
    const cookie = await loginCookie()
    const payload = decodeJwt(cookie.split('=')[1])
    if (invalidClaim === 'expired') payload.exp = Math.floor(Date.now() / 1000) - 1
    if (invalidClaim === 'wrong-role') payload.role = 'admin'
    if (invalidClaim === 'wrong-audience') payload.aud = 'staff-api'
    if (invalidClaim === 'wrong-issuer') payload.iss = 'staff-login'
    if (invalidClaim === 'missing-expiry') delete payload.exp
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.JWT_SECRET))
    assert.equal((await pass(request(`${cookie.split('=')[0]}=${token}`))).status, 401)
    assert.equal(state.payloadReads, 0)
  })
}
test('birth-date login issues a usable session and changing birth date revokes it', async () => {
  Object.assign(state.student, { auth_method: 'birth_date', pin_hash: null, birth_date: '990101' })
  const cookie = await loginCookie()
  assert.equal((await pass(request(cookie))).status, 200)
  state.student.birth_date = '990102' as any
  assert.equal((await pass(request(cookie))).status, 401)
})
test('student cookie discloses no raw PIN hash or birth date', async () => {
  const cookie = await loginCookie()
  const payload = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString())
  assert.equal(payload.sub, '7')
  assert.equal(payload.division, 'police')
  assert.equal(payload.role, 'student')
  assert.equal(payload.exp - payload.iat, 3600)
  assert.doesNotMatch(JSON.stringify(payload), /\$2[aby]\$|1234|990101|birth_date|pin_hash/)
})
test('student logout removes only the current division cookie', async () => {
  const response = await require('../../src/app/api/auth/student/logout/route').POST(request())
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie') ?? '', /class_pass_student_police=;/)
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/)
  assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /class_pass_student_fire/)
})

for (const [name, handler] of [['lookup', lookup], ['pass', pass], ['logout', (req: NextRequest) => require('../../src/app/api/auth/student/logout/route').POST(req)]] as const) {
  test(`${name}: cross-origin cookie requests cannot issue, use or clear a student session`, async () => {
    const req = request(await loginCookie(), { verificationCode: '1234' })
    req.headers.set('origin', 'https://other.example.com')
    const response = await handler(req)
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(state.payloadReads, 0)
  })
}
test('private receipt polling requires student session even with identity query', async () => {
  const get = require('../../src/app/api/enrollments/[id]/receipts/route').GET
  const response = await get(new NextRequest('http://localhost/police/api/enrollments/12/receipts?name=fixture&phone=01012345678'), { params: Promise.resolve({ id: '12' }) })
  assert.equal(response.status, 401)
})
test('receipt polling cannot read another student enrollment with valid own cookie and matching name/phone', async () => {
  state.student.id = 9
  const cookie = await loginCookie()
  const get = require('../../src/app/api/enrollments/[id]/receipts/route').GET
  const response = await get(new NextRequest('http://localhost/police/api/enrollments/12/receipts?name=검증학생&phone=01012345678', { headers: { cookie } }), { params: Promise.resolve({ id: '12' }) })
  assert.equal(response.status, 403)
})
for (const archived of [false, true]) {
  test(`${archived ? 'archived' : 'live'} real pass data refuses another verified student with matching identity`, async () => {
    const data = require('../../src/lib/class-pass-data')
    const result = await (archived ? data.buildArchivedPassPayload : data.buildPassPayload)({ division: 'police', studentId: 9, enrollmentId: 12, courseSlug: 'fixture', name: student.name, phone: student.phone })
    assert.deepEqual(result, { kind: 'not_found' })
  })
}
