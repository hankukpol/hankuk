const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createClient } = require('@supabase/supabase-js')

const DISPLAY_COOKIE_PREFIX = 'class_pass_designated_display_device'
const ROTATION_MS = 15_000
const DEFAULT_STUDENTS = 200
const DEFAULT_SEQUENTIAL = 160
const DEFAULT_CONCURRENT = 20
const DEFAULT_CONFLICT_PAIRS = 10

function readNumberArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = process.argv.find((entry) => entry.startsWith(prefix))
  if (!arg) return fallback
  const value = Number(arg.slice(prefix.length))
  return Number.isInteger(value) && value >= 0 ? value : fallback
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
    sub: 'codex-local-admin',
    division,
    adminId: 'codex-local-admin',
    staffName: 'Codex Local Admin',
    sessionVersion: 1,
    iat: now,
    exp: now + 8 * 60 * 60,
  }))
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function getDesignatedSeatSecret() {
  const secret = (
    process.env.DESIGNATED_SEAT_SECRET
    || process.env.QR_HMAC_SECRET
    || process.env.JWT_SECRET
    || ''
  ).trim()
  if (secret.length < 32) {
    throw new Error('DESIGNATED_SEAT_SECRET, QR_HMAC_SECRET, or JWT_SECRET must be at least 32 characters')
  }
  return secret
}

function hashDisplayRegistrationCode(courseId, code) {
  return crypto
    .createHmac('sha256', getDesignatedSeatSecret())
    .update(`${courseId}:${code.trim()}:designated-seat-display-registration`)
    .digest('hex')
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

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
}

function displayCookieName(courseId) {
  return `${DISPLAY_COOKIE_PREFIX}_${courseId}`
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function normalizePhone(index) {
  return `010${String(91000000 + index).slice(-8)}`
}

function makeDeviceKey(index, phase) {
  return `codex_ds_200_${phase}_${String(index).padStart(4, '0')}_${crypto.randomBytes(10).toString('hex')}`
}

function randomCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

function getKstClock() {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return {
    dayOfWeek: kst.getDay(),
    minutes: kst.getHours() * 60 + kst.getMinutes(),
  }
}

function currentScheduleWindow() {
  const clock = getKstClock()
  const start = Math.max(0, clock.minutes - 10)
  const end = Math.min(23 * 60 + 59, Math.max(clock.minutes + 120, start + 1))
  return {
    dayOfWeek: clock.dayOfWeek,
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    label: 'Codex active window',
    isActive: true,
  }
}

function futureScheduleWindow() {
  const clock = getKstClock()
  return {
    dayOfWeek: (clock.dayOfWeek + 1) % 7,
    startTime: '06:00',
    endTime: '07:00',
    label: 'Codex future window',
    isActive: true,
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForStableRotationWindow() {
  const offset = Date.now() % ROTATION_MS
  if (offset > ROTATION_MS - 4_000) {
    await sleep(ROTATION_MS - offset + 500)
  }
}

async function must(resultPromise, label) {
  const result = await resultPromise
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function requestJson(context, path, options = {}, jar = new Map(), admin = false) {
  const headers = new Headers(options.headers ?? {})
  headers.set('x-hankuk-division', context.division)
  if (options.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (admin && !headers.has('origin')) headers.set('origin', context.baseUrl)

  const cookies = cookieHeader(jar)
  if (cookies) headers.set('cookie', cookies)

  const response = await fetch(`${context.baseUrl}${path}`, { ...options, headers })
  updateCookieJar(jar, response)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function waitForServer(context) {
  const deadline = Date.now() + 60_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const { response } = await requestJson(context, '/api/config/app', { method: 'GET' })
      if (response.ok) return
      lastError = new Error(`status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(1000)
  }
  throw new Error(`Local server did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

async function seed(db, division, studentCount, seatCount) {
  const course = await must(
    db
      .from('courses')
      .insert({
        division,
        name: `Codex designated-seat 200 local ${new Date().toISOString()}`,
        slug: `ds-200-${Date.now().toString(36)}`,
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

  await must(
    db.from('course_seat_layouts').insert({
      course_id: course.id,
      columns: 30,
      rows: Math.ceil(seatCount / 30),
      aisle_columns: [6, 12, 18, 24],
    }),
    'seed layout',
  )

  const seatsPayload = Array.from({ length: seatCount }, (_, index) => ({
    course_id: course.id,
    label: `T${String(index + 1).padStart(3, '0')}`,
    position_x: (index % 30) + 1,
    position_y: Math.floor(index / 30) + 1,
    is_active: true,
  }))
  const enrollmentPayload = Array.from({ length: studentCount }, (_, index) => ({
    course_id: course.id,
    name: `Codex Student ${String(index + 1).padStart(3, '0')}`,
    phone: normalizePhone(index + 1),
    exam_number: `CDX200-${String(index + 1).padStart(4, '0')}`,
    status: 'active',
  }))

  const seats = []
  for (const part of chunk(seatsPayload, 200)) {
    seats.push(...await must(db.from('course_seats').insert(part).select('id,label,position_x,position_y'), 'seed seats'))
  }

  const enrollments = []
  for (const part of chunk(enrollmentPayload, 200)) {
    enrollments.push(...await must(db.from('enrollments').insert(part).select('id,name,phone,exam_number'), 'seed enrollments'))
  }

  return { course, seats, enrollments }
}

async function cleanupDivision(db, division) {
  const courses = await must(db.from('courses').select('id').eq('division', division), 'cleanup load courses')
  if (!courses?.length) return
  await must(db.from('courses').delete().in('id', courses.map((course) => course.id)), 'cleanup courses')
}

function makeAdminJar(division) {
  return new Map([[`cp_admin__${division}`, signLocalAdminJwt(division)]])
}

async function adminJson(context, path, method, body) {
  return requestJson(
    context,
    path,
    {
      method,
      body: body == null ? undefined : JSON.stringify(body),
    },
    context.adminJar,
    true,
  )
}

async function expectDisplayStatus(context, jar, expectedStatus, label, expectedHttpOk = true) {
  const { response, payload } = await requestJson(
    context,
    `/api/designated-seats/display?courseId=${context.course.id}`,
    { method: 'GET' },
    jar,
  )
  if (expectedHttpOk) assert.equal(response.ok, true, `${label}: ${response.status} ${JSON.stringify(payload)}`)
  assert.equal(payload?.status, expectedStatus, `${label}: unexpected display status ${JSON.stringify(payload)}`)
  return { response, payload }
}

async function createDisplayDeviceThroughStaffFlow(context, deviceName) {
  const codeResult = await adminJson(context, '/api/designated-seats/admin/display-devices', 'POST', {
    courseId: context.course.id,
    deviceName,
  })
  assert.equal(codeResult.response.ok, true, `create display code failed: ${codeResult.response.status} ${JSON.stringify(codeResult.payload)}`)
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
  assert.equal(registerResult.response.ok, true, `register display device failed: ${registerResult.response.status} ${JSON.stringify(registerResult.payload)}`)
  assert.equal(registerResult.payload.success, true)
  assert.ok(cookieHeader(jar).includes(`${displayCookieName(context.course.id)}=`), 'display device cookie was not set')
  return { jar, device: registerResult.payload.device }
}

async function saveSchedules(context, schedules) {
  const result = await adminJson(context, '/api/designated-seats/admin/display-schedules', 'PUT', {
    courseId: context.course.id,
    schedules,
  })
  assert.equal(result.response.ok, true, `save schedules failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
}

async function startManualDisplay(context) {
  const result = await adminJson(context, '/api/designated-seats/admin/display', 'POST', {
    courseId: context.course.id,
    durationHours: 1,
  })
  assert.equal(result.response.ok, true, `manual display start failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.ok(result.payload.displayUrl.includes(`/designated-seat-display/${context.course.id}`))
  assert.equal(result.payload.displayUrl.includes('token='), false, 'manual display URL should not include token')
  return result.payload.session
}

async function stopManualDisplay(context) {
  const result = await adminJson(context, '/api/designated-seats/admin/display', 'DELETE', {
    courseId: context.course.id,
    durationHours: 1,
  })
  assert.equal(result.response.ok, true, `manual display stop failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
}

async function getSynchronizedDisplayPayloads(context) {
  await waitForStableRotationWindow()
  const results = await Promise.all(context.displayJars.map((jar) => (
    requestJson(context, `/api/designated-seats/display?courseId=${context.course.id}`, { method: 'GET' }, jar)
  )))
  for (const result of results) {
    assert.equal(result.response.ok, true, `display sync failed: ${result.response.status} ${JSON.stringify(result.payload)}`)
    assert.equal(result.payload.status, 'active')
  }
  const payloads = results.map((result) => result.payload)
  assert.equal(new Set(payloads.map((payload) => payload.session.id)).size, 1, 'display devices did not share one session')
  assert.equal(new Set(payloads.map((payload) => payload.rotationToken)).size, 1, 'display devices did not receive identical rotation token')
  return payloads
}

async function getRotationToken(context, index = 0) {
  const jar = context.displayJars[index % context.displayJars.length]
  const { payload } = await expectDisplayStatus(context, jar, 'active', `rotation token ${index}`)
  assert.ok(payload.rotationToken?.length > 20)
  return payload.rotationToken
}

async function authenticate(context, enrollment, deviceKey, jar, index) {
  const rotationToken = await getRotationToken(context, index)
  const result = await requestJson(
    context,
    '/api/designated-seats/auth',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollment.id,
        name: enrollment.name,
        phone: enrollment.phone,
        localDeviceKey: deviceKey,
        verificationMethod: 'qr',
        rotationToken,
        deviceSignature: {
          userAgent: 'codex-designated-seat-200',
          platform: 'node',
          language: 'ko-KR',
          screen: '1920x1080',
          timezone: 'Asia/Seoul',
        },
      }),
    },
    jar,
  )
  assert.equal(result.response.ok, true, `auth failed for ${enrollment.exam_number}: ${result.response.status} ${JSON.stringify(result.payload)}`)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.state.verified, true)
  assert.equal(result.payload.state.writable, true)
  return result.payload
}

async function reserve(context, enrollment, seatId, deviceKey, jar) {
  return requestJson(
    context,
    '/api/designated-seats/reserve',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        enrollmentId: enrollment.id,
        seatId,
        name: enrollment.name,
        phone: enrollment.phone,
        localDeviceKey: deviceKey,
      }),
    },
    jar,
  )
}

async function assertReservation(context, enrollmentId, expectedSeatId, label) {
  const rows = await must(
    context.db
      .from('course_seat_reservations')
      .select('id,seat_id,enrollment_id')
      .eq('course_id', context.course.id)
      .eq('enrollment_id', enrollmentId),
    `${label}: load reservation`,
  )
  assert.equal(rows.length, 1, `${label}: expected one reservation`)
  assert.equal(Number(rows[0].seat_id), Number(expectedSeatId), `${label}: wrong seat`)
}

async function runSequentialMove(context, index) {
  const enrollment = context.enrollments[index]
  const firstSeat = context.seats[index]
  const secondSeat = context.seats[200 + index]
  const deviceKey = makeDeviceKey(index, 'seq')
  const jar = new Map()

  await authenticate(context, enrollment, deviceKey, jar, index)
  const first = await reserve(context, enrollment, firstSeat.id, deviceKey, jar)
  assert.equal(first.response.ok, true, `initial reserve failed ${index}: ${first.response.status} ${JSON.stringify(first.payload)}`)
  assert.equal(first.payload.action, 'reserved')
  assert.equal(first.payload.state.verified, false)
  assert.equal(first.payload.state.requires_reauth, true)
  await assertReservation(context, enrollment.id, firstSeat.id, `student ${index + 1} initial`)

  const blockedMove = await reserve(context, enrollment, secondSeat.id, deviceKey, jar)
  assert.equal(blockedMove.response.status, 403, `move without QR should be blocked ${index}`)
  assert.ok(['AUTH_REQUIRED', 'AUTH_EXPIRED', 'AUTH_ALREADY_USED'].includes(blockedMove.payload?.reason))
  await assertReservation(context, enrollment.id, firstSeat.id, `student ${index + 1} blocked move`)

  await authenticate(context, enrollment, deviceKey, jar, index)
  const moved = await reserve(context, enrollment, secondSeat.id, deviceKey, jar)
  assert.equal(moved.response.ok, true, `move failed ${index}: ${moved.response.status} ${JSON.stringify(moved.payload)}`)
  assert.equal(moved.payload.action, 'changed')
  await assertReservation(context, enrollment.id, secondSeat.id, `student ${index + 1} moved`)
}

async function runConcurrentUnique(context) {
  const start = context.sequentialCount
  const tasks = Array.from({ length: context.concurrentCount }, async (_, offset) => {
    const index = start + offset
    const enrollment = context.enrollments[index]
    const seat = context.seats[index]
    const deviceKey = makeDeviceKey(index, 'unique')
    const jar = new Map()
    await authenticate(context, enrollment, deviceKey, jar, index)
    const result = await reserve(context, enrollment, seat.id, deviceKey, jar)
    assert.equal(result.response.ok, true, `concurrent unique failed ${offset}: ${result.response.status} ${JSON.stringify(result.payload)}`)
    await assertReservation(context, enrollment.id, seat.id, `concurrent unique ${offset + 1}`)
  })
  await Promise.all(tasks)
}

async function runConflictPairWithRecovery(context, pairIndex) {
  const firstIndex = context.sequentialCount + context.concurrentCount + pairIndex * 2
  const secondIndex = firstIndex + 1
  const firstEnrollment = context.enrollments[firstIndex]
  const secondEnrollment = context.enrollments[secondIndex]
  const targetSeat = context.seats[context.sequentialCount + context.concurrentCount + pairIndex]
  const fallbackSeat = context.seats[context.sequentialCount + context.concurrentCount + context.conflictPairs + pairIndex]
  const firstDeviceKey = makeDeviceKey(firstIndex, 'conflict')
  const secondDeviceKey = makeDeviceKey(secondIndex, 'conflict')
  const firstJar = new Map()
  const secondJar = new Map()

  await Promise.all([
    authenticate(context, firstEnrollment, firstDeviceKey, firstJar, firstIndex),
    authenticate(context, secondEnrollment, secondDeviceKey, secondJar, secondIndex),
  ])

  const [firstResult, secondResult] = await Promise.all([
    reserve(context, firstEnrollment, targetSeat.id, firstDeviceKey, firstJar),
    reserve(context, secondEnrollment, targetSeat.id, secondDeviceKey, secondJar),
  ])

  const attempts = [
    { enrollment: firstEnrollment, deviceKey: firstDeviceKey, jar: firstJar, result: firstResult },
    { enrollment: secondEnrollment, deviceKey: secondDeviceKey, jar: secondJar, result: secondResult },
  ]
  const successes = attempts.filter((attempt) => attempt.result.response.ok && attempt.result.payload?.success)
  const conflicts = attempts.filter((attempt) => attempt.result.response.status === 409 && attempt.result.payload?.reason === 'SEAT_TAKEN')
  assert.equal(successes.length, 1, `pair ${pairIndex + 1}: expected one winner`)
  assert.equal(conflicts.length, 1, `pair ${pairIndex + 1}: expected one seat conflict`)

  const loser = conflicts[0]
  await authenticate(context, loser.enrollment, loser.deviceKey, loser.jar, secondIndex)
  const recovered = await reserve(context, loser.enrollment, fallbackSeat.id, loser.deviceKey, loser.jar)
  assert.equal(recovered.response.ok, true, `pair ${pairIndex + 1}: loser recovery failed ${recovered.response.status} ${JSON.stringify(recovered.payload)}`)
  await assertReservation(context, loser.enrollment.id, fallbackSeat.id, `conflict loser ${pairIndex + 1}`)
}

async function runAdminManualSeatFlow(context) {
  const occupiedSeatId = context.seats[200].id
  const targetEnrollment = context.enrollments[0]
  const otherEnrollment = context.enrollments[1]
  const freeSeat = context.seats[0]

  const conflict = await adminJson(context, '/api/designated-seats/admin/manual', 'POST', {
    courseId: context.course.id,
    enrollmentId: otherEnrollment.id,
    seatId: occupiedSeatId,
  })
  assert.equal(conflict.response.status, 409, `manual occupied-seat conflict should fail: ${JSON.stringify(conflict.payload)}`)
  assert.equal(conflict.payload.reason, 'SEAT_TAKEN')

  const cleared = await adminJson(context, '/api/designated-seats/admin/manual', 'DELETE', {
    courseId: context.course.id,
    enrollmentId: targetEnrollment.id,
  })
  assert.equal(cleared.response.ok, true, `manual clear failed: ${cleared.response.status} ${JSON.stringify(cleared.payload)}`)

  const reassigned = await adminJson(context, '/api/designated-seats/admin/manual', 'POST', {
    courseId: context.course.id,
    enrollmentId: targetEnrollment.id,
    seatId: freeSeat.id,
  })
  assert.equal(reassigned.response.ok, true, `manual reassign failed: ${reassigned.response.status} ${JSON.stringify(reassigned.payload)}`)
  await assertReservation(context, targetEnrollment.id, freeSeat.id, 'manual reassign')
}

async function runDisplayAndScheduleStaffFlow(context) {
  await expectDisplayStatus(context, new Map(), 'registration_required', 'copied URL without cookie', false)

  const firstDevice = await createDisplayDeviceThroughStaffFlow(context, 'Classroom PC 1')
  context.displayJars.push(firstDevice.jar)
  await expectDisplayStatus(context, firstDevice.jar, 'inactive', 'registered device before schedule')

  const copiedBrowser = new Map()
  await expectDisplayStatus(context, copiedBrowser, 'registration_required', 'URL copied to another browser', false)

  const devicesBeforeRevoke = await adminJson(context, `/api/designated-seats/admin/display-devices?courseId=${context.course.id}`, 'GET')
  assert.equal(devicesBeforeRevoke.response.ok, true)
  assert.equal(devicesBeforeRevoke.payload.devices.length, 1)

  const revoked = await adminJson(context, '/api/designated-seats/admin/display-devices', 'DELETE', {
    courseId: context.course.id,
    deviceId: firstDevice.device.id,
  })
  assert.equal(revoked.response.ok, true, `device revoke failed: ${revoked.response.status} ${JSON.stringify(revoked.payload)}`)
  await expectDisplayStatus(context, firstDevice.jar, 'registration_required', 'revoked device blocked', false)
  context.displayJars = []

  for (let index = 0; index < 4; index += 1) {
    const device = await createDisplayDeviceThroughStaffFlow(context, `Classroom PC ${index + 1}`)
    context.displayJars.push(device.jar)
  }

  const devices = await adminJson(context, `/api/designated-seats/admin/display-devices?courseId=${context.course.id}`, 'GET')
  assert.equal(devices.response.ok, true)
  assert.equal(devices.payload.devices.length, 4)

  await saveSchedules(context, [futureScheduleWindow()])
  await expectDisplayStatus(context, context.displayJars[0], 'inactive', 'future schedule is inactive')

  await startManualDisplay(context)
  await expectDisplayStatus(context, context.displayJars[0], 'active', 'manual session overrides schedule')
  await stopManualDisplay(context)
  await expectDisplayStatus(context, context.displayJars[0], 'inactive', 'manual stop returns inactive')

  await saveSchedules(context, [currentScheduleWindow()])
  const synced = await getSynchronizedDisplayPayloads(context)
  console.log(`display sync passed: session=${synced[0].session.id}, devices=4`)
}

async function assertFinalReservations(context, expectedCount) {
  const reservations = await must(
    context.db
      .from('course_seat_reservations')
      .select('id,seat_id,enrollment_id')
      .eq('course_id', context.course.id),
    'final reservations',
  )
  assert.equal(reservations.length, expectedCount, `expected ${expectedCount} final reservations`)
  assert.equal(new Set(reservations.map((row) => Number(row.seat_id))).size, reservations.length, 'duplicate seat reservation detected')
  assert.equal(new Set(reservations.map((row) => Number(row.enrollment_id))).size, reservations.length, 'duplicate enrollment reservation detected')
}

async function main() {
  const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:3107').replace(/\/+$/, '')
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  assertLocalUrl(baseUrl, 'BASE_URL')
  assertLocalUrl(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL')

  const studentCount = readNumberArg('students', DEFAULT_STUDENTS)
  const sequentialCount = readNumberArg('sequential', DEFAULT_SEQUENTIAL)
  const concurrentCount = readNumberArg('concurrent', DEFAULT_CONCURRENT)
  const conflictPairs = readNumberArg('conflict-pairs', DEFAULT_CONFLICT_PAIRS)
  const conflictStudents = conflictPairs * 2
  assert.equal(sequentialCount + concurrentCount + conflictStudents, studentCount, 'scenario counts must add up to students')
  assert.equal(studentCount, 200, 'this verifier is intentionally fixed to 200 students')

  const division = `codex-ds-200-${Date.now().toString(36)}`
  const db = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'class_pass' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const context = {
    baseUrl,
    division,
    db,
    adminJar: makeAdminJar(division),
    displayJars: [],
    sequentialCount,
    concurrentCount,
    conflictPairs,
  }

  console.log(`designated-seat 200 verifier: division=${division}`)
  try {
    await waitForServer(context)
    Object.assign(context, await seed(db, division, studentCount, 420))

    await runDisplayAndScheduleStaffFlow(context)
    console.log('staff display/device/schedule workflow passed')

    for (let index = 0; index < sequentialCount; index += 1) {
      await runSequentialMove(context, index)
      if ((index + 1) % 20 === 0) console.log(`student scan/reserve/move passed: ${index + 1}/${sequentialCount}`)
    }

    await runConcurrentUnique(context)
    console.log(`concurrent unique student reservations passed: ${concurrentCount}`)

    for (let pairIndex = 0; pairIndex < conflictPairs; pairIndex += 1) {
      await runConflictPairWithRecovery(context, pairIndex)
    }
    console.log(`same-seat conflict and recovery pairs passed: ${conflictPairs}`)

    await runAdminManualSeatFlow(context)
    console.log('staff manual seat conflict/clear/reassign workflow passed')

    await assertFinalReservations(context, studentCount)
    console.log(`final 200 reservations verified`)
  } finally {
    await cleanupDivision(db, division)
    console.log(`cleanup complete: ${division}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
