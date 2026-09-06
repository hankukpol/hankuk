import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import { getUserErrorMessage } from '../../src/lib/user-error-message'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const state = {
  error: null as { code: string; message: string; details?: string } | null,
  denied: false, wrongTenant: false, disabled: false, rpcCalls: 0, courseWrites: 0, cacheCalls: 0,
}
const db = {
  from(table: string) {
    const query = {
      select() { return query }, eq() { return query }, order() { return query }, gte() { return query },
      update() { state.courseWrites++; return query },
      then(resolve: (value: unknown) => unknown) {
        assert.ok(['course_seats', 'course_seat_reservations', 'courses'].includes(table))
        return Promise.resolve(resolve({ data: table === 'course_seats' ? [{ id: 7, label: 'A1' }] : [], error: null }))
      },
    }
    return query
  },
  async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, 'save_course_room_seat_layout')
    assert.equal(args.p_course_id, 8)
    assert.equal(args.p_room_id, 9)
    state.rpcCalls++
    return { data: state.error ? null : { success: true }, error: state.error }
  },
}
// Keep the route and error sanitizer real; no external database/auth/cache calls.
Module._load = function(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/require-admin-api') return { requireAdminApi: async () => state.denied ? NextResponse.json({ error: '인증 필요' }, { status: 401 }) : null }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => state.disabled ? NextResponse.json({ error: '기능 비활성' }, { status: 403 }) : null }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  if (request === '@/lib/class-pass-data') return { getCourseById: async () => state.wrongTenant ? null : { id: 8, division: 'police' } }
  if (request === '@/lib/supabase/server') return { createServerClient: () => db }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => { state.cacheCalls++ } }
  if (request === '@/lib/designated-seat/service') return {
    ensureCourseRooms: async () => [{ id: 9 }], resolveActiveRoomId: () => 9,
    normalizeAisleColumns: (columns: number[]) => columns, getTodayStartKST: () => '2026-09-05T15:00:00Z',
    getDesignatedSeatAdminData: async () => ({ seats: [{ id: 7, label: 'A1' }], reservations: [] }),
  }
  return originalLoad.call(this, request, parent, isMain)
}
const put = require('../../src/app/api/designated-seats/admin/route').PUT as typeof import('../../src/app/api/designated-seats/admin/route').PUT
after(() => { Module._load = originalLoad })
beforeEach(() => Object.assign(state, { error: null, denied: false, wrongTenant: false, disabled: false, rpcCalls: 0, courseWrites: 0, cacheCalls: 0 }))
const request = () => new NextRequest('http://localhost/api/designated-seats/admin', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 8, roomId: 9, rows: 2, columns: 2, featureDesignatedSeat: true, seats: [{ id: 7, label: 'A1', position_x: 1, position_y: 1, is_active: true }] }),
})

const cases: Array<[string, number, RegExp]> = [
  ['INVALID_LAYOUT_SIZE', 400, /행.*열|열.*행/],
  ['INVALID_SEATS', 400, /좌석.*(입력|위치)/],
  ['ROOM_NOT_FOUND', 404, /강의실.*(없|찾|확인)/],
  ['SEAT_NOT_FOUND', 404, /좌석.*(없|찾|확인)/],
  ['DUPLICATE_SEAT_LABEL', 409, /좌석.*(이름|번호|라벨).*중복/],
  ['DUPLICATE_SEAT_POSITION', 409, /좌석.*위치.*중복/],
  ['RESERVED_SEAT_INACTIVE', 409, /배정.*비활성화/],
  ['RESERVED_SEAT_DELETE', 409, /배정.*삭제/],
  ['HISTORICAL_SEAT_DELETE', 409, /이력.*삭제.*비활성화/],
]
for (const [reason, status, meaning] of cases) {
  test(`layout RPC ${reason} explains the failure without committing later settings`, async () => {
    state.error = { code: 'P0001', message: reason, details: 'private SQL context' }
    const response = await put(request())
    const payload = await response.json()
    assert.equal(response.status, status)
    assert.match(payload.error, meaning)
    assert.equal(getUserErrorMessage(payload.error), payload.error)
    assert.equal(payload.reason, reason)
    assert.doesNotMatch(payload.error, /[A-Z]+_[A-Z]+|private/)
    assert.equal(state.courseWrites, 0)
    assert.equal(state.cacheCalls, 0)
  })
}
for (const error of [
  { code: 'P0001', message: '한국어 SELECT secret FROM private' },
  { code: 'P0001', message: 'constructor' },
  { code: 'P0001', message: '__proto__' },
  { code: '23505', message: 'DUPLICATE_SEAT_LABEL' },
]) {
  test(`unrecognized SQL error remains a safe 500: ${error.message}`, async () => {
    state.error = error
    const response = await put(request())
    const payload = await response.json()
    assert.equal(response.status, 500)
    assert.match(payload.error, /좌석.*저장.*못/)
    assert.doesNotMatch(JSON.stringify(payload), /SELECT|secret|constructor|__proto__|DUPLICATE_SEAT_LABEL/)
  })
}
for (const [key, status] of [['denied', 401], ['disabled', 403], ['wrongTenant', 404]] as const) {
  test(`layout ${key} never calls the saving RPC`, async () => {
    state[key] = true
    assert.equal((await put(request())).status, status)
    assert.equal(state.rpcCalls, 0)
  })
}
test('successful layout still saves requested settings and returns refreshed seats', async () => {
  const response = await put(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).seats[0].label, 'A1')
  assert.equal(state.rpcCalls, 1)
  assert.equal(state.courseWrites, 1)
  assert.equal(state.cacheCalls, 2)
})
