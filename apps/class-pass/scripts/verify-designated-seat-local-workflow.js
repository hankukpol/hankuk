const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_CASES = 100
const DEFAULT_CONCURRENT_UNIQUE = 20
const DEFAULT_CONFLICT_PAIRS = 10

function readNumberArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = process.argv.find((entry) => entry.startsWith(prefix))
  if (!arg) return fallback

  const value = Number(arg.slice(prefix.length))
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

function assertLocalUrl(rawValue, label) {
  const parsed = new URL(rawValue)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`${label} must point at localhost/127.0.0.1, got ${parsed.hostname}`)
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function randomRegistrationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function randomToken(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`
}

function makeDeviceKey(index, phase = 'seq') {
  return `codex_ds_${phase}_${String(index).padStart(4, '0')}_${crypto.randomBytes(12).toString('hex')}`
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie()
  }

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
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
}

function displayCookieName(courseId) {
  return `class_pass_designated_display_device_${courseId}`
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function normalizePhone(index) {
  return `010${String(90000000 + index).slice(-8)}`
}

async function must(resultPromise, label) {
  const result = await resultPromise
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }

  return result.data
}

async function selectAll(buildQuery, label) {
  const rows = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const page = await must(buildQuery().range(offset, offset + pageSize - 1), label)
    rows.push(...(page ?? []))
    if (!page || page.length < pageSize) break
  }

  return rows
}

async function deleteInChunks(db, table, column, ids) {
  const uniqueIds = Array.from(new Set(ids.filter((value) => value != null)))
  for (const idsChunk of chunk(uniqueIds, 500)) {
    await must(db.from(table).delete().in(column, idsChunk), `cleanup ${table}`)
  }
}

async function cleanupDivision(db, division) {
  const courses = await selectAll(
    () => db.from('courses').select('id').eq('division', division).order('id'),
    'cleanup load courses',
  )
  const courseIds = courses.map((course) => course.id)
  if (courseIds.length === 0) return

  await deleteInChunks(db, 'courses', 'id', courseIds)
}

async function seed(db, division, totalEnrollments, totalSeats) {
  const slug = `ds-local-${Date.now().toString(36)}`
  const course = await must(
    db
      .from('courses')
      .insert({
        division,
        name: `Codex 지정좌석 로컬 검증 ${new Date().toISOString()}`,
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

  await must(
    db.from('course_seat_layouts').insert({
      course_id: course.id,
      columns: 25,
      rows: Math.ceil(totalSeats / 25),
      aisle_columns: [5, 10, 15, 20],
    }),
    'seed layout',
  )

  const seatsPayload = Array.from({ length: totalSeats }, (_, index) => ({
    course_id: course.id,
    label: `S${String(index + 1).padStart(3, '0')}`,
    position_x: (index % 25) + 1,
    position_y: Math.floor(index / 25) + 1,
    is_active: true,
  }))

  const enrollmentsPayload = Array.from({ length: totalEnrollments }, (_, index) => ({
    course_id: course.id,
    name: `Codex 학생 ${String(index + 1).padStart(3, '0')}`,
    phone: normalizePhone(index + 1),
    exam_number: `CDX${String(index + 1).padStart(4, '0')}`,
    status: 'active',
  }))

  const seats = []
  for (const part of chunk(seatsPayload, 200)) {
    seats.push(...await must(
      db.from('course_seats').insert(part).select('id,label,position_x,position_y'),
      'seed seats',
    ))
  }

  const enrollments = []
  for (const part of chunk(enrollmentsPayload, 200)) {
    enrollments.push(...await must(
      db.from('enrollments').insert(part).select('id,name,phone,exam_number'),
      'seed enrollments',
    ))
  }

  const displayToken = randomToken('display')
  const displaySession = await must(
    db
      .from('course_seat_display_sessions')
      .insert({
        course_id: course.id,
        display_token_hash: hashToken(displayToken),
        created_by: 'codex-local-workflow',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select('id,expires_at')
      .single(),
    'seed display session',
  )

  return { course, seats, enrollments, displaySession }
}

async function requestJson(baseUrl, division, path, options = {}, jar = new Map()) {
  const headers = new Headers(options.headers ?? {})
  headers.set('x-hankuk-division', division)
  if (options.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const cookies = cookieHeader(jar)
  if (cookies) headers.set('cookie', cookies)

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  })
  updateCookieJar(jar, response)

  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function waitForServer(baseUrl, division) {
  const deadline = Date.now() + 60_000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const { response } = await requestJson(baseUrl, division, '/api/config/app', { method: 'GET' })
      if (response.ok) return
      lastError = new Error(`status ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Local server did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

async function getRotationToken(context) {
  const { response, payload } = await requestJson(
    context.baseUrl,
    context.division,
    `/api/designated-seats/display?courseId=${context.course.id}`,
    { method: 'GET' },
    context.displayJar,
  )

  assert.equal(response.ok, true, `display endpoint failed: ${response.status} ${JSON.stringify(payload)}`)
  assert.equal(payload.status, 'active')
  assert.equal(payload.course.id, context.course.id)
  assert.equal(typeof payload.rotationToken, 'string')
  assert.ok(payload.rotationToken.length > 20)
  return payload.rotationToken
}

async function assertUnregisteredDisplayBlocked(context) {
  const { response, payload } = await requestJson(
    context.baseUrl,
    context.division,
    `/api/designated-seats/display?courseId=${context.course.id}`,
    { method: 'GET' },
  )

  assert.equal(response.status, 401, `unregistered display should be blocked: ${JSON.stringify(payload)}`)
  assert.equal(payload.status, 'registration_required')
}

async function createDisplayRegistrationCode(context) {
  const code = randomRegistrationCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await must(
    context.db
      .from('course_seat_display_registration_codes')
      .insert({
        course_id: context.course.id,
        code_hash: hashDisplayRegistrationCode(context.course.id, code),
        device_name: 'Codex display PC',
        created_by: 'codex-local-workflow',
        expires_at: expiresAt,
      }),
    'seed display registration code',
  )

  return code
}

async function registerDisplayDevice(context) {
  const code = await createDisplayRegistrationCode(context)
  const displayJar = new Map()
  const { response, payload } = await requestJson(
    context.baseUrl,
    context.division,
    '/api/designated-seats/display/register',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.course.id,
        code,
      }),
    },
    displayJar,
  )

  assert.equal(response.ok, true, `display device registration failed: ${response.status} ${JSON.stringify(payload)}`)
  assert.equal(payload.success, true)
  assert.ok(cookieHeader(displayJar).includes(`${displayCookieName(context.course.id)}=`))
  return displayJar
}

async function authenticate(context, enrollment, deviceKey, jar) {
  const rotationToken = await getRotationToken(context)
  const { response, payload } = await requestJson(
    context.baseUrl,
    context.division,
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
          userAgent: 'codex-local-workflow',
          platform: 'node',
          language: 'ko-KR',
          screen: '1920x1080',
          timezone: 'Asia/Seoul',
        },
      }),
    },
    jar,
  )

  assert.equal(response.ok, true, `auth failed: ${response.status} ${JSON.stringify(payload)}`)
  assert.equal(payload.success, true)
  assert.equal(payload.state.verified, true)
  assert.equal(payload.state.writable, true)
  assert.ok(payload.expiresAt)
  return payload
}

async function reserve(context, enrollment, seatId, deviceKey, jar) {
  return requestJson(
    context.baseUrl,
    context.division,
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

async function assertReservation(db, courseId, enrollmentId, expectedSeatId, label) {
  const rows = await must(
    db
      .from('course_seat_reservations')
      .select('id,seat_id,enrollment_id')
      .eq('course_id', courseId)
      .eq('enrollment_id', enrollmentId),
    `${label}: load reservation`,
  )

  assert.equal(rows.length, 1, `${label}: expected exactly one reservation`)
  assert.equal(Number(rows[0].seat_id), Number(expectedSeatId), `${label}: reservation seat mismatch`)
}

async function runSequentialCase(context, index) {
  const enrollment = context.enrollments[index]
  const firstSeat = context.seats[index]
  const secondSeat = context.seats[index + context.caseCount]
  const deviceKey = makeDeviceKey(index, 'seq')
  const jar = new Map()

  await authenticate(context, enrollment, deviceKey, jar)

  const firstReserve = await reserve(context, enrollment, firstSeat.id, deviceKey, jar)
  assert.equal(
    firstReserve.response.ok,
    true,
    `case ${index + 1}: initial reserve failed ${firstReserve.response.status} ${JSON.stringify(firstReserve.payload)}`,
  )
  assert.equal(firstReserve.payload.success, true)
  assert.equal(firstReserve.payload.action, 'reserved')
  assert.equal(firstReserve.payload.state.reservation.seat_id, firstSeat.id)
  assert.equal(firstReserve.payload.state.verified, false)
  assert.equal(firstReserve.payload.state.requires_reauth, true)
  await assertReservation(context.db, context.course.id, enrollment.id, firstSeat.id, `case ${index + 1} initial`)

  const noReauthMove = await reserve(context, enrollment, secondSeat.id, deviceKey, jar)
  assert.equal(noReauthMove.response.ok, false, `case ${index + 1}: move without reauth unexpectedly succeeded`)
  assert.equal(noReauthMove.response.status, 403)
  assert.ok(
    ['AUTH_REQUIRED', 'AUTH_EXPIRED', 'AUTH_ALREADY_USED'].includes(noReauthMove.payload?.reason),
    `case ${index + 1}: unexpected no-reauth reason ${JSON.stringify(noReauthMove.payload)}`,
  )
  await assertReservation(context.db, context.course.id, enrollment.id, firstSeat.id, `case ${index + 1} no-reauth`)

  await authenticate(context, enrollment, deviceKey, jar)

  const moved = await reserve(context, enrollment, secondSeat.id, deviceKey, jar)
  assert.equal(
    moved.response.ok,
    true,
    `case ${index + 1}: move after reauth failed ${moved.response.status} ${JSON.stringify(moved.payload)}`,
  )
  assert.equal(moved.payload.success, true)
  assert.equal(moved.payload.action, 'changed')
  assert.equal(moved.payload.state.reservation.seat_id, secondSeat.id)
  assert.equal(moved.payload.state.verified, false)
  assert.equal(moved.payload.state.requires_reauth, true)
  await assertReservation(context.db, context.course.id, enrollment.id, secondSeat.id, `case ${index + 1} moved`)
}

async function runConcurrentUniqueBatch(context) {
  const startEnrollment = context.caseCount
  const startSeat = context.caseCount * 2

  const tasks = Array.from({ length: context.concurrentUniqueCount }, async (_, offset) => {
    const enrollment = context.enrollments[startEnrollment + offset]
    const seat = context.seats[startSeat + offset]
    const deviceKey = makeDeviceKey(offset, 'unique')
    const jar = new Map()

    await authenticate(context, enrollment, deviceKey, jar)
    const reserved = await reserve(context, enrollment, seat.id, deviceKey, jar)
    assert.equal(
      reserved.response.ok,
      true,
      `concurrent unique ${offset + 1}: reserve failed ${reserved.response.status} ${JSON.stringify(reserved.payload)}`,
    )
    assert.equal(reserved.payload.success, true)
    await assertReservation(context.db, context.course.id, enrollment.id, seat.id, `concurrent unique ${offset + 1}`)
  })

  await Promise.all(tasks)
}

async function runConflictPair(context, pairIndex) {
  const startEnrollment = context.caseCount + context.concurrentUniqueCount + pairIndex * 2
  const firstEnrollment = context.enrollments[startEnrollment]
  const secondEnrollment = context.enrollments[startEnrollment + 1]
  const targetSeat = context.seats[context.caseCount * 2 + context.concurrentUniqueCount + pairIndex]
  const firstDeviceKey = makeDeviceKey(pairIndex * 2, 'conflict')
  const secondDeviceKey = makeDeviceKey(pairIndex * 2 + 1, 'conflict')
  const firstJar = new Map()
  const secondJar = new Map()

  await Promise.all([
    authenticate(context, firstEnrollment, firstDeviceKey, firstJar),
    authenticate(context, secondEnrollment, secondDeviceKey, secondJar),
  ])

  const [firstResult, secondResult] = await Promise.all([
    reserve(context, firstEnrollment, targetSeat.id, firstDeviceKey, firstJar),
    reserve(context, secondEnrollment, targetSeat.id, secondDeviceKey, secondJar),
  ])

  const results = [firstResult, secondResult]
  const successes = results.filter((result) => result.response.ok && result.payload?.success)
  const conflicts = results.filter((result) => result.response.status === 409 && result.payload?.reason === 'SEAT_TAKEN')
  assert.equal(successes.length, 1, `conflict pair ${pairIndex + 1}: expected one success, got ${JSON.stringify(results.map((r) => ({ status: r.response.status, payload: r.payload })))}`)
  assert.equal(conflicts.length, 1, `conflict pair ${pairIndex + 1}: expected one SEAT_TAKEN conflict`)

  const rows = await must(
    context.db
      .from('course_seat_reservations')
      .select('id,seat_id,enrollment_id')
      .eq('course_id', context.course.id)
      .eq('seat_id', targetSeat.id),
    `conflict pair ${pairIndex + 1}: load target seat`,
  )
  assert.equal(rows.length, 1, `conflict pair ${pairIndex + 1}: target seat should have one reservation`)
}

async function runConflictPairs(context) {
  for (let index = 0; index < context.conflictPairCount; index += 1) {
    await runConflictPair(context, index)
  }
}

async function main() {
  const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:3107').replace(/\/+$/, '')
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  assertLocalUrl(baseUrl, 'BASE_URL')
  assertLocalUrl(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL')

  const caseCount = readNumberArg('cases', DEFAULT_CASES)
  const concurrentUniqueCount = readNumberArg('concurrent-unique', DEFAULT_CONCURRENT_UNIQUE)
  const conflictPairCount = readNumberArg('conflict-pairs', DEFAULT_CONFLICT_PAIRS)
  const totalEnrollments = caseCount + concurrentUniqueCount + conflictPairCount * 2
  const totalSeats = caseCount * 2 + concurrentUniqueCount + conflictPairCount + 10
  const division = `codex-ds-${Date.now().toString(36)}`
  const db = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'class_pass' },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`local designated-seat workflow: division=${division}`)
  console.log(`cases=${caseCount}, concurrentUnique=${concurrentUniqueCount}, conflictPairs=${conflictPairCount}`)

  let seeded = null
  try {
    await waitForServer(baseUrl, division)
    seeded = await seed(db, division, totalEnrollments, totalSeats)

    const context = {
      ...seeded,
      baseUrl,
      division,
      db,
      displayJar: new Map(),
      caseCount,
      concurrentUniqueCount,
      conflictPairCount,
    }

    await assertUnregisteredDisplayBlocked(context)
    context.displayJar = await registerDisplayDevice(context)

    for (let index = 0; index < caseCount; index += 1) {
      await runSequentialCase(context, index)
      if ((index + 1) % 10 === 0) {
        console.log(`sequential workflows passed: ${index + 1}/${caseCount}`)
      }
    }

    await runConcurrentUniqueBatch(context)
    console.log(`concurrent unique reservations passed: ${concurrentUniqueCount}`)

    await runConflictPairs(context)
    console.log(`same-seat conflict pairs passed: ${conflictPairCount}`)

    const reservations = await must(
      db.from('course_seat_reservations').select('id,seat_id,enrollment_id').eq('course_id', seeded.course.id),
      'final reservations',
    )
    const uniqueSeats = new Set(reservations.map((row) => Number(row.seat_id)))
    const uniqueEnrollments = new Set(reservations.map((row) => Number(row.enrollment_id)))
    assert.equal(uniqueSeats.size, reservations.length, 'final duplicate seat reservation detected')
    assert.equal(uniqueEnrollments.size, reservations.length, 'final duplicate enrollment reservation detected')
    assert.equal(reservations.length, caseCount + concurrentUniqueCount + conflictPairCount)

    console.log(`final reservations verified: ${reservations.length}`)
  } finally {
    await cleanupDivision(db, division)
    console.log(`cleanup complete: ${division}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
