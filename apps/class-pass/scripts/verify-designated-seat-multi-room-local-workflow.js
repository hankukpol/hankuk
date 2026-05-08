const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const STUDENT_COUNT = 100
const SEATS_PER_ROOM = 100
const BULK_CONCURRENCY = 12
const DISPLAY_COOKIE_PREFIX = 'class_pass_designated_display_device'

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertLocalUrl(rawValue, label) {
  const parsed = new URL(rawValue)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`${label} must point at localhost/127.0.0.1, got ${parsed.hostname}`)
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signLocalAdminJwt(division) {
  const secret = requireEnv('JWT_SECRET')
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    role: 'admin',
    sub: 'codex-multi-room-admin',
    division,
    adminId: 'codex-multi-room-admin',
    staffName: 'Codex Multi Room Admin',
    sessionVersion: 1,
    iat: now,
    exp: now + 8 * 60 * 60,
  }))
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie()
  const combined = response.headers.get('set-cookie')
  return combined ? [combined] : []
}

function updateCookieJar(jar, response) {
  for (const header of getSetCookieHeaders(response)) {
    const [pair] = header.split(';')
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
}

function cookieHeader(jar, division) {
  const entries = new Map(jar)
  if (division && !entries.has('hankuk_division')) {
    entries.set('hankuk_division', division)
  }
  return Array.from(entries.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
}

function displayCookieName(courseId) {
  return `${DISPLAY_COOKIE_PREFIX}_${courseId}`
}

function normalizePhone(index) {
  return `010${String(92000000 + index).slice(-8)}`
}

function makeDeviceKey(index, label) {
  return `codex_multi_room_${label}_${String(index).padStart(3, '0')}_${crypto.randomBytes(8).toString('hex')}`
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function must(resultPromise, label) {
  const result = await resultPromise
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function requestJson(context, pathValue, options = {}, jar = new Map(), admin = false) {
  const headers = new Headers(options.headers ?? {})
  headers.set('x-hankuk-division', context.division)
  if (options.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (admin && !headers.has('origin')) headers.set('origin', context.baseUrl)

  const cookies = cookieHeader(jar, context.division)
  if (cookies) headers.set('cookie', cookies)

  const response = await fetch(`${context.baseUrl}${pathValue}`, { ...options, headers })
  updateCookieJar(jar, response)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function adminJson(context, pathValue, method, body) {
  return requestJson(
    context,
    pathValue,
    { method, body: body == null ? undefined : JSON.stringify(body) },
    context.adminJar,
    true,
  )
}

async function waitForServer(context) {
  const deadline = Date.now() + 60_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const { response } = await requestJson(context, '/api/config/app')
      if (response.ok) return
      lastError = new Error(`status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(1000)
  }
  throw new Error(`Local server did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

async function seed(context) {
  const { db, division } = context
  const slug = `ds-multi-room-${Date.now().toString(36)}`
  const course = await must(
    db
      .from('courses')
      .insert({
        division,
        name: `Codex multi-room designated-seat ${new Date().toISOString()}`,
        slug,
        course_type: 'lecture',
        status: 'active',
        feature_qr_pass: false,
        feature_qr_distribution: false,
        feature_seat_assignment: false,
        feature_designated_seat: true,
        designated_seat_open: true,
        presence_location_enabled: false,
        presence_required_for_designated_seat: false,
      })
      .select('id,name,slug')
      .single(),
    'seed course',
  )

  const rooms = await must(
    db
      .from('course_rooms')
      .insert([
        { course_id: course.id, name: 'Room A', sort_order: 0, is_active: true, is_open: true },
        { course_id: course.id, name: 'Room B', sort_order: 1, is_active: true, is_open: true },
      ])
      .select('id,course_id,name,sort_order,is_active,is_open')
      .order('sort_order', { ascending: true }),
    'seed rooms',
  )
  const roomA = rooms[0]
  const roomB = rooms[1]

  await must(
    db.from('course_seat_layouts').insert(rooms.map((room) => ({
      course_id: course.id,
      room_id: room.id,
      columns: 10,
      rows: 10,
      aisle_columns: [5],
    }))),
    'seed layouts',
  )

  const seatPayload = rooms.flatMap((room, roomIndex) => {
    const prefix = roomIndex === 0 ? 'A' : 'B'
    return Array.from({ length: SEATS_PER_ROOM }, (_, index) => ({
      course_id: course.id,
      room_id: room.id,
      label: `${prefix}${String(index + 1).padStart(3, '0')}`,
      position_x: (index % 10) + 1,
      position_y: Math.floor(index / 10) + 1,
      is_active: true,
    }))
  })

  const seats = []
  for (const part of chunk(seatPayload, 200)) {
    seats.push(...await must(
      db.from('course_seats').insert(part).select('id,room_id,label,position_x,position_y,is_active'),
      'seed seats',
    ))
  }

  const enrollments = []
  const enrollmentPayload = Array.from({ length: STUDENT_COUNT }, (_, index) => ({
    course_id: course.id,
    name: `Codex Multi Student ${String(index + 1).padStart(3, '0')}`,
    phone: normalizePhone(index + 1),
    exam_number: `MR${String(index + 1).padStart(4, '0')}`,
    status: 'active',
  }))
  for (const part of chunk(enrollmentPayload, 200)) {
    enrollments.push(...await must(
      db.from('enrollments').insert(part).select('id,name,phone,exam_number'),
      'seed enrollments',
    ))
  }

  const seatsByRoom = new Map()
  for (const room of rooms) {
    seatsByRoom.set(room.id, seats.filter((seat) => Number(seat.room_id) === Number(room.id)))
  }

  return {
    course,
    rooms,
    roomA,
    roomB,
    seats,
    seatsByRoom,
    enrollments,
  }
}

async function cleanup(context) {
  if (process.env.KEEP_TEST_DATA === '1') {
    console.log(`KEEP_TEST_DATA=1, left test course in DB: ${context.course?.id}`)
    return
  }
  if (!context.course?.id) return
  await must(context.db.from('courses').delete().eq('id', context.course.id), 'cleanup course')
}

async function createDisplayDevice(context) {
  const codeResult = await adminJson(context, '/api/designated-seats/admin/display-devices', 'POST', {
    courseId: context.course.id,
    deviceName: 'Codex Multi Room Display',
  })
  assert.equal(codeResult.response.ok, true, `display code failed: ${codeResult.response.status} ${JSON.stringify(codeResult.payload)}`)
  assert.match(codeResult.payload.code, /^\d{6}$/)

  const jar = new Map()
  const registerResult = await requestJson(
    context,
    '/api/designated-seats/display/register',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        code: codeResult.payload.code,
      }),
    },
    jar,
  )
  assert.equal(registerResult.response.ok, true, `display register failed: ${registerResult.response.status} ${JSON.stringify(registerResult.payload)}`)
  assert.equal(registerResult.payload.success, true)
  assert.ok(cookieHeader(jar).includes(`${displayCookieName(context.course.id)}=`), 'display cookie missing')
  context.displayJar = jar
}

async function startDisplay(context, room) {
  const result = await adminJson(context, '/api/designated-seats/admin/display', 'POST', {
    courseId: context.course.id,
    roomId: room.id,
    durationHours: 1,
  })
  assert.equal(result.response.ok, true, `start display ${room.name} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.ok(result.payload.displayUrl.includes(`roomId=${room.id}`), `display URL is not room-scoped: ${result.payload.displayUrl}`)
  return result.payload.session
}

async function stopDisplay(context, room) {
  const result = await adminJson(context, '/api/designated-seats/admin/display', 'DELETE', {
    courseId: context.course.id,
    roomId: room.id,
    durationHours: 1,
  })
  assert.equal(result.response.ok, true, `stop display ${room.name} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
}

async function getDisplay(context, room) {
  const result = await requestJson(
    context,
    `/api/designated-seats/display?courseId=${context.course.id}&roomId=${room.id}`,
    { method: 'GET' },
    context.displayJar,
  )
  return result
}

async function getRotationToken(context, room) {
  const result = await getDisplay(context, room)
  assert.equal(result.response.ok, true, `display ${room.name} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.equal(result.payload.status, 'active', `display ${room.name} not active: ${JSON.stringify(result.payload)}`)
  assert.equal(Number(result.payload.room.id), Number(room.id), `display room mismatch for ${room.name}`)
  assert.ok(result.payload.rotationToken?.length > 20, `missing rotation token for ${room.name}`)
  return result.payload.rotationToken
}

async function authenticate(context, enrollment, room, deviceKey, jar, providedRotationToken = null) {
  const rotationToken = providedRotationToken ?? await getRotationToken(context, room)
  const result = await requestJson(
    context,
    '/api/designated-seats/auth',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollment.id,
        roomId: room.id,
        name: enrollment.name,
        phone: enrollment.phone,
        localDeviceKey: deviceKey,
        verificationMethod: 'qr',
        rotationToken,
        deviceSignature: {
          userAgent: 'codex-multi-room-verifier',
          platform: 'node',
          language: 'ko-KR',
          screen: '1920x1080',
          timezone: 'Asia/Seoul',
        },
      }),
    },
    jar,
  )
  assert.equal(result.response.ok, true, `auth ${enrollment.exam_number} ${room.name} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.equal(result.payload.success, true)
  assert.equal(Number(result.payload.state.active_room_id), Number(room.id))
  assert.equal(result.payload.state.verified, true)
  assert.equal(result.payload.state.writable, true)
  assert.equal(result.payload.state.rooms.length, 2)
  return result.payload
}

async function loadStudentState(context, enrollment, room, jar) {
  const result = await requestJson(
    context,
    '/api/designated-seats/state',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollment.id,
        roomId: room?.id ?? null,
        name: enrollment.name,
        phone: enrollment.phone,
      }),
    },
    jar,
  )
  assert.equal(result.response.ok, true, `state failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  return result.payload.state
}

async function reserve(context, enrollment, room, seat, deviceKey, jar) {
  return requestJson(
    context,
    '/api/designated-seats/reserve',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollment.id,
        roomId: room.id,
        seatId: seat.id,
        name: enrollment.name,
        phone: enrollment.phone,
        localDeviceKey: deviceKey,
      }),
    },
    jar,
  )
}

async function expectReserveOk(context, enrollment, room, seat, deviceKey, jar, expectedAction) {
  const result = await reserve(context, enrollment, room, seat, deviceKey, jar)
  assert.equal(result.response.ok, true, `reserve ${enrollment.exam_number} ${seat.label} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.equal(result.payload.success, true)
  if (expectedAction) assert.equal(result.payload.action, expectedAction)
  assert.equal(Number(result.payload.state.reservation.seat_id), Number(seat.id))
  assert.equal(Number(result.payload.state.reservation.room_id), Number(room.id))
  assert.equal(result.payload.state.verified, false)
  assert.equal(result.payload.state.requires_reauth, true)
  await assertReservation(context, enrollment.id, room.id, seat.id, `reserve ${enrollment.exam_number} ${seat.label}`)
  return result.payload
}

async function assertReservation(context, enrollmentId, roomId, seatId, label) {
  const rows = await must(
    context.db
      .from('course_seat_reservations')
      .select('id,room_id,seat_id,enrollment_id,course_seats(id,room_id,label)')
      .eq('course_id', context.course.id)
      .eq('enrollment_id', enrollmentId),
    `${label}: load reservation`,
  )
  assert.equal(rows.length, 1, `${label}: expected one reservation`)
  assert.equal(Number(rows[0].room_id), Number(roomId), `${label}: wrong room`)
  assert.equal(Number(rows[0].seat_id), Number(seatId), `${label}: wrong seat`)
}

async function patchRoomOpen(context, room, isOpen) {
  const result = await adminJson(context, `/api/courses/${context.course.id}/rooms`, 'PATCH', {
    roomId: room.id,
    isOpen,
  })
  assert.equal(result.response.ok, true, `patch room ${room.name} ${isOpen} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  room.is_open = isOpen
}

async function patchMasterOpen(context, isOpen) {
  const result = await adminJson(context, `/api/courses/${context.course.id}`, 'PATCH', {
    designated_seat_open: isOpen,
  })
  assert.equal(result.response.ok, true, `patch master open ${isOpen} failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  context.course = result.payload.course

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const check = await adminJson(context, `/api/courses/${context.course.id}`, 'GET')
    if (check.response.ok && check.payload?.course?.designated_seat_open === isOpen) {
      context.course = check.payload.course
      return
    }
    await sleep(500)
  }
  throw new Error(`course cache did not reflect designated_seat_open=${isOpen}`)
}

async function runCoreStudentFlows(context) {
  const { roomA, roomB, seatsByRoom, enrollments } = context
  const aSeats = seatsByRoom.get(roomA.id)
  const bSeats = seatsByRoom.get(roomB.id)

  const initialState = await loadStudentState(context, enrollments[0], roomA, new Map())
  assert.equal(initialState.rooms.length, 2, 'student should see two open rooms')
  assert.equal(Number(initialState.active_room_id), Number(roomA.id), 'initial active room mismatch')
  assert.equal(initialState.writable, false, 'student should not write before QR')
  assert.equal(initialState.seats.length, SEATS_PER_ROOM, 'room A seat count mismatch')

  const jar0 = new Map()
  const device0 = makeDeviceKey(0, 'move-a')
  await authenticate(context, enrollments[0], roomA, device0, jar0)
  await expectReserveOk(context, enrollments[0], roomA, aSeats[0], device0, jar0, 'reserved')

  const blockedMove = await reserve(context, enrollments[0], roomA, aSeats[1], device0, jar0)
  assert.equal(blockedMove.response.status, 403, `same-room move without QR should be blocked: ${JSON.stringify(blockedMove.payload)}`)
  assert.ok(['AUTH_REQUIRED', 'AUTH_EXPIRED', 'AUTH_ALREADY_USED'].includes(blockedMove.payload?.reason))
  await assertReservation(context, enrollments[0].id, roomA.id, aSeats[0].id, 'blocked same-room move')

  await authenticate(context, enrollments[0], roomA, device0, jar0)
  await expectReserveOk(context, enrollments[0], roomA, aSeats[1], device0, jar0, 'changed')

  const jar1 = new Map()
  const device1 = makeDeviceKey(1, 'cross-room')
  await authenticate(context, enrollments[1], roomA, device1, jar1)
  await expectReserveOk(context, enrollments[1], roomA, aSeats[2], device1, jar1, 'reserved')
  const blockedCrossRoom = await reserve(context, enrollments[1], roomB, bSeats[0], device1, jar1)
  assert.equal(blockedCrossRoom.response.status, 403, `cross-room move without room QR should be blocked: ${JSON.stringify(blockedCrossRoom.payload)}`)
  assert.equal(blockedCrossRoom.payload?.reason, 'AUTH_REQUIRED')
  await assertReservation(context, enrollments[1].id, roomA.id, aSeats[2].id, 'blocked cross-room move')

  await authenticate(context, enrollments[1], roomB, device1, jar1)
  await expectReserveOk(context, enrollments[1], roomB, bSeats[0], device1, jar1, 'changed')

  await authenticate(context, enrollments[1], roomA, device1, jar1)
  const blockedWrongRoomAuth = await reserve(context, enrollments[1], roomB, bSeats[1], device1, jar1)
  assert.equal(blockedWrongRoomAuth.response.status, 403, `room B reserve after room A QR should be blocked: ${JSON.stringify(blockedWrongRoomAuth.payload)}`)
  assert.equal(blockedWrongRoomAuth.payload?.reason, 'AUTH_REQUIRED')
  await assertReservation(context, enrollments[1].id, roomB.id, bSeats[0].id, 'blocked wrong-room auth')

  const jar2 = new Map()
  const device2 = makeDeviceKey(2, 'wrong-room-recover')
  await authenticate(context, enrollments[2], roomA, device2, jar2)
  const blockedNoRoomBAuth = await reserve(context, enrollments[2], roomB, bSeats[1], device2, jar2)
  assert.equal(blockedNoRoomBAuth.response.status, 403)
  assert.equal(blockedNoRoomBAuth.payload?.reason, 'AUTH_REQUIRED')
  await expectReserveOk(context, enrollments[2], roomA, aSeats[3], device2, jar2, 'reserved')

  console.log('core student QR/reserve/move/cross-room guards passed')
}

async function runConflictFlow(context) {
  const { roomA, seatsByRoom, enrollments } = context
  const aSeats = seatsByRoom.get(roomA.id)
  const targetSeat = aSeats[9]
  const fallbackSeat = aSeats[10]
  const first = enrollments[3]
  const second = enrollments[4]
  const firstJar = new Map()
  const secondJar = new Map()
  const firstDevice = makeDeviceKey(3, 'conflict')
  const secondDevice = makeDeviceKey(4, 'conflict')

  await Promise.all([
    authenticate(context, first, roomA, firstDevice, firstJar),
    authenticate(context, second, roomA, secondDevice, secondJar),
  ])

  const [firstResult, secondResult] = await Promise.all([
    reserve(context, first, roomA, targetSeat, firstDevice, firstJar),
    reserve(context, second, roomA, targetSeat, secondDevice, secondJar),
  ])
  const attempts = [
    { enrollment: first, jar: firstJar, device: firstDevice, result: firstResult },
    { enrollment: second, jar: secondJar, device: secondDevice, result: secondResult },
  ]
  const winners = attempts.filter((attempt) => attempt.result.response.ok)
  const losers = attempts.filter((attempt) => attempt.result.response.status === 409 && attempt.result.payload?.reason === 'SEAT_TAKEN')
  assert.equal(winners.length, 1, `same-seat conflict should have one winner: ${JSON.stringify(attempts.map((entry) => entry.result.payload))}`)
  assert.equal(losers.length, 1, 'same-seat conflict should have one loser')
  const loser = losers[0]
  await authenticate(context, loser.enrollment, roomA, loser.device, loser.jar)
  await expectReserveOk(context, loser.enrollment, roomA, fallbackSeat, loser.device, loser.jar, 'reserved')
  console.log('same-seat conflict and loser recovery passed')
}

async function runDeviceLockFlow(context) {
  const { roomB, seatsByRoom, enrollments } = context
  const bSeats = seatsByRoom.get(roomB.id)
  const sharedDevice = makeDeviceKey(5, 'shared-device')
  const sharedJar = new Map()

  await authenticate(context, enrollments[5], roomB, sharedDevice, sharedJar)
  await expectReserveOk(context, enrollments[5], roomB, bSeats[9], sharedDevice, sharedJar, 'reserved')

  await authenticate(context, enrollments[6], roomB, sharedDevice, sharedJar)
  const locked = await reserve(context, enrollments[6], roomB, bSeats[10], sharedDevice, sharedJar)
  assert.equal(locked.response.status, 409, `same-device second student should be blocked: ${JSON.stringify(locked.payload)}`)
  assert.equal(locked.payload?.reason, 'DEVICE_LOCKED')

  const freshJar = new Map()
  const freshDevice = makeDeviceKey(6, 'fresh-device')
  await authenticate(context, enrollments[6], roomB, freshDevice, freshJar)
  await expectReserveOk(context, enrollments[6], roomB, bSeats[10], freshDevice, freshJar, 'reserved')
  console.log('same-device lock and fresh-device recovery passed')
}

async function runRoomCloseAndMasterCloseFlow(context) {
  const { roomA, roomB, seatsByRoom, enrollments } = context
  const bSeats = seatsByRoom.get(roomB.id)

  await patchRoomOpen(context, roomB, false)
  const displayClosed = await getDisplay(context, roomB)
  assert.equal(displayClosed.response.ok, true)
  assert.equal(displayClosed.payload.status, 'inactive')
  assert.equal(displayClosed.payload.reason, 'ROOM_CLOSED')

  const stateWithClosedRoomReservation = await loadStudentState(context, enrollments[1], null, new Map())
  assert.equal(stateWithClosedRoomReservation.rooms.some((room) => Number(room.id) === Number(roomB.id)), false, 'closed room should be hidden from tabs')
  assert.equal(Number(stateWithClosedRoomReservation.reservation.room_id), Number(roomB.id), 'closed-room reservation should remain visible')
  assert.equal(Number(stateWithClosedRoomReservation.active_room_id), Number(roomA.id), 'active room should fall back to open room')

  const jar7 = new Map()
  const device7 = makeDeviceKey(7, 'closed-room')
  const staleToken = await getRotationToken(context, roomA)
  const authClosed = await requestJson(
    context,
    '/api/designated-seats/auth',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollments[7].id,
        roomId: roomB.id,
        name: enrollments[7].name,
        phone: enrollments[7].phone,
        localDeviceKey: device7,
        verificationMethod: 'qr',
        rotationToken: staleToken,
      }),
    },
    jar7,
  )
  assert.equal(authClosed.response.ok, true, 'room A token should still authenticate room A')
  const reserveClosed = await reserve(context, enrollments[7], roomB, bSeats[11], device7, jar7)
  assert.equal(reserveClosed.response.status, 403, `closed room reserve should be blocked: ${JSON.stringify(reserveClosed.payload)}`)
  assert.ok(['ROOM_CLOSED', 'AUTH_REQUIRED'].includes(reserveClosed.payload?.reason))

  await patchRoomOpen(context, roomB, true)
  await startDisplay(context, roomB)
  await authenticate(context, enrollments[7], roomB, device7, jar7)
  await expectReserveOk(context, enrollments[7], roomB, bSeats[11], device7, jar7, 'reserved')

  await patchMasterOpen(context, false)
  const masterClosedState = await loadStudentState(context, enrollments[7], null, jar7)
  assert.equal(masterClosedState.rooms.length, 0, 'master closed should hide all rooms')
  assert.equal(Number(masterClosedState.reservation.room_id), Number(roomB.id), 'reservation should remain visible while master closed')
  assert.equal(masterClosedState.writable, false, 'master closed should not be writable')
  const displayMasterClosed = await getDisplay(context, roomA)
  assert.equal(displayMasterClosed.payload.status, 'inactive')
  assert.equal(displayMasterClosed.payload.reason, 'RESERVATION_CLOSED')
  await patchMasterOpen(context, true)
  await startDisplay(context, roomA)
  await startDisplay(context, roomB)
  console.log('room close/reopen and master close state preservation passed')
}

async function reserveBulkStudent(context, index, room, seat, rotationToken) {
  const enrollment = context.enrollments[index]
  const jar = new Map()
  const device = makeDeviceKey(index, 'bulk')
  await authenticate(context, enrollment, room, device, jar, rotationToken)
  await expectReserveOk(context, enrollment, room, seat, device, jar, 'reserved')
}

async function runBulkHundredStudents(context) {
  const { roomA, roomB, seatsByRoom } = context
  const aSeats = seatsByRoom.get(roomA.id)
  const bSeats = seatsByRoom.get(roomB.id)
  const tasks = []

  for (let index = 8; index < STUDENT_COUNT; index += 1) {
    if (index < 54) {
      tasks.push(({ roomAToken }) => reserveBulkStudent(context, index, roomA, aSeats[20 + (index - 8)], roomAToken))
    } else {
      tasks.push(({ roomBToken }) => reserveBulkStudent(context, index, roomB, bSeats[20 + (index - 54)], roomBToken))
    }
  }

  let completed = 0
  for (const group of chunk(tasks, BULK_CONCURRENCY)) {
    const [roomAToken, roomBToken] = await Promise.all([
      getRotationToken(context, roomA),
      getRotationToken(context, roomB),
    ])
    await Promise.all(group.map((task) => task({ roomAToken, roomBToken })))
    completed += group.length
    console.log(`bulk student reservations passed: ${completed}/${tasks.length}`)
  }
}

async function assertFinalState(context) {
  const rows = await must(
    context.db
      .from('course_seat_reservations')
      .select('id,room_id,seat_id,enrollment_id')
      .eq('course_id', context.course.id),
    'final reservations',
  )
  assert.equal(rows.length, STUDENT_COUNT, `expected ${STUDENT_COUNT} final reservations`)
  assert.equal(new Set(rows.map((row) => Number(row.seat_id))).size, rows.length, 'duplicate seat reservation detected')
  assert.equal(new Set(rows.map((row) => Number(row.enrollment_id))).size, rows.length, 'duplicate enrollment reservation detected')

  const roomACount = rows.filter((row) => Number(row.room_id) === Number(context.roomA.id)).length
  const roomBCount = rows.filter((row) => Number(row.room_id) === Number(context.roomB.id)).length
  assert.equal(roomACount, 50, `expected 50 reservations in Room A, got ${roomACount}`)
  assert.equal(roomBCount, 50, `expected 50 reservations in Room B, got ${roomBCount}`)

  const stateA = await loadStudentState(context, context.enrollments[0], context.roomA, new Map())
  const stateB = await loadStudentState(context, context.enrollments[1], context.roomB, new Map())
  assert.equal(stateA.seats.length, SEATS_PER_ROOM, 'Room A state seat count mismatch')
  assert.equal(stateB.seats.length, SEATS_PER_ROOM, 'Room B state seat count mismatch')
  assert.equal(stateA.occupied_seat_ids.length, 50, 'Room A visible reservation count mismatch')
  assert.equal(stateB.occupied_seat_ids.length, 50, 'Room B visible reservation count mismatch')
}

async function main() {
  loadLocalEnv()
  const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  assertLocalUrl(baseUrl, 'BASE_URL')
  assertLocalUrl(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL')

  const division = `codex-ds-multi-${Date.now().toString(36)}`
  const db = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'class_pass' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const context = {
    baseUrl,
    division,
    db,
    adminJar: new Map([[`cp_admin__${division}`, signLocalAdminJwt(division)]]),
    displayJar: new Map(),
  }

  console.log(`designated-seat multi-room verifier: division=${division}`)
  try {
    await waitForServer(context)
    Object.assign(context, await seed(context))
    console.log(`seeded course=${context.course.id}, rooms=${context.roomA.id}/${context.roomB.id}, students=${context.enrollments.length}`)

    await createDisplayDevice(context)
    const sessionA = await startDisplay(context, context.roomA)
    const sessionB = await startDisplay(context, context.roomB)
    assert.notEqual(Number(sessionA.id), Number(sessionB.id), 'display sessions should be room-scoped')
    console.log('room-scoped display QR sessions passed')

    await runCoreStudentFlows(context)
    await runConflictFlow(context)
    await runDeviceLockFlow(context)
    await runRoomCloseAndMasterCloseFlow(context)
    await runBulkHundredStudents(context)
    await assertFinalState(context)
    await stopDisplay(context, context.roomA)
    await stopDisplay(context, context.roomB)
    console.log('final 100-student, 2-room designated-seat workflow passed')
  } finally {
    await cleanup(context)
    console.log('cleanup complete')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
