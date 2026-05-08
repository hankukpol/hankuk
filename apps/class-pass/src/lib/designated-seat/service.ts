import { unstable_cache } from 'next/cache'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import type {
  Course,
  CourseRoom,
  DesignatedSeatAttendanceDashboard,
  DesignatedSeatAttendanceEventType,
  DesignatedSeatAttendanceRecord,
  DesignatedSeatAttendanceStatus,
  DesignatedSeat,
  DesignatedSeatAuthSession,
  DesignatedSeatDisplaySchedule,
  DesignatedSeatDisplaySlotSchedule,
  DesignatedSeatDisplaySession,
  DesignatedSeatEvent,
  DesignatedSeatLayout,
  DesignatedSeatReservation,
  DesignatedSeatStudentState,
  Enrollment,
} from '@/types/database'
import { normalizeName, normalizePhone } from '@/lib/utils'
import { isPresenceLocationEnforced } from '@/lib/presence/shared'
import { createOpaqueDisplayToken, hashToken } from '@/lib/designated-seat/token'

/** Returns today's midnight in KST as ISO string (UTC) for filtering daily reservations. */
export function getTodayStartKST(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  kst.setHours(0, 0, 0, 0)
  // Convert KST midnight back to UTC
  const utcMidnight = new Date(kst.getTime() - 9 * 60 * 60 * 1000)
  return utcMidnight.toISOString()
}

export function getTodayKSTDateKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getKstDateBounds(dateKey: string) {
  if (!isDateKey(dateKey)) {
    throw new Error('Invalid KST date key.')
  }

  const start = new Date(`${dateKey}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function normalizeAisleColumns(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  ).sort((left, right) => left - right)
}

export { normalizeAisleColumns }

function mapLayoutRow(row: Record<string, unknown> | null): DesignatedSeatLayout | null {
  if (!row) {
    return null
  }

  return {
    course_id: Number(row.course_id),
    room_id: Number(row.room_id),
    columns: Number(row.columns),
    rows: Number(row.rows),
    aisle_columns: normalizeAisleColumns(row.aisle_columns),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapSeatRow(row: Record<string, unknown>): DesignatedSeat {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    room_id: Number(row.room_id),
    label: String(row.label ?? ''),
    position_x: Number(row.position_x),
    position_y: Number(row.position_y),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapReservationRow(row: Record<string, unknown>): DesignatedSeatReservation {
  const seatRow = row.course_seats as Record<string, unknown> | null
  const enrollmentRow = row.enrollments as Record<string, unknown> | null

  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    room_id: Number(row.room_id),
    seat_id: Number(row.seat_id),
    enrollment_id: Number(row.enrollment_id),
    device_key_hash: row.device_key_hash ? String(row.device_key_hash) : null,
    reserved_at: String(row.reserved_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    seat: seatRow
      ? {
        id: Number(seatRow.id),
        room_id: Number(seatRow.room_id),
        label: String(seatRow.label ?? ''),
        position_x: Number(seatRow.position_x),
        position_y: Number(seatRow.position_y),
        is_active: Boolean(seatRow.is_active),
      }
      : undefined,
    enrollments: enrollmentRow
      ? {
        id: Number(enrollmentRow.id),
        name: String(enrollmentRow.name ?? ''),
        exam_number: enrollmentRow.exam_number ? String(enrollmentRow.exam_number) : null,
        status: String(enrollmentRow.status ?? 'active') as Enrollment['status'],
      }
      : undefined,
  }
}

function mapRoomRow(row: Record<string, unknown>): CourseRoom {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    name: String(row.name ?? ''),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    is_open: row.is_open == null ? false : Boolean(row.is_open),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapHistoricalReservationRow(row: Record<string, unknown>): DesignatedSeatReservation | null {
  if (row.enrollment_id == null || row.seat_id == null) {
    return null
  }

  const mapped = mapReservationRow({
    id: row.id,
    course_id: row.course_id,
    room_id: row.room_id ?? (row.course_seats as Record<string, unknown> | null)?.room_id,
    seat_id: row.seat_id,
    enrollment_id: row.enrollment_id,
    device_key_hash: null,
    reserved_at: row.created_at,
    updated_at: row.created_at,
    course_seats: row.course_seats,
    enrollments: row.enrollments,
  })

  return mapped
}

export function getDesignatedSeatRestrictionMessage(state: {
  enabled: boolean
  open: boolean
  verified: boolean
  hasReservation: boolean
  hasLayout: boolean
}) {
  if (!state.enabled) {
    return '지정좌석 기능이 아직 열리지 않았습니다.'
  }

  if (!state.open) {
    return '현재 좌석 신청이 닫혀 있습니다.'
  }

  if (!state.hasLayout) {
    return '관리자가 아직 좌석 배치를 준비하지 않았습니다.'
  }

  if (!state.verified && state.hasReservation) {
    return '좌석을 변경하려면 다시 QR 인증이 필요합니다.'
  }

  if (!state.verified) {
    return '현장 QR 인증 후 좌석을 선택할 수 있습니다.'
  }

  return null
}

const getCachedDesignatedSeatLayout = unstable_cache(
  async (courseId: number, roomId: number) => {
    const db = createServerClient()
    const row = unwrapSupabaseResult(
      'designatedSeat.layout',
      await db
        .from('course_seat_layouts')
        .select('*')
        .eq('course_id', courseId)
        .eq('room_id', roomId)
        .maybeSingle(),
    ) as Record<string, unknown> | null

    return mapLayoutRow(row)
  },
  ['designated-seat-layout'],
  {
    revalidate: 15,
    tags: ['designated-seats'],
  },
)

export async function ensureCourseRooms(courseId: number) {
  const db = createServerClient()
  const existingRows = unwrapSupabaseResult(
    'designatedSeat.rooms',
    await db
      .from('course_rooms')
      .select('*')
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('sort_order')
      .order('id'),
  ) as Array<Record<string, unknown>> | null

  if (existingRows && existingRows.length > 0) {
    return existingRows.map(mapRoomRow)
  }

  const inserted = unwrapSupabaseResult(
    'designatedSeat.createDefaultRoom',
    await db
      .from('course_rooms')
      .upsert({
        course_id: courseId,
        name: '기본 강의실',
        sort_order: 0,
        is_active: true,
        is_open: false,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'course_id,name',
      })
      .select('*')
      .single(),
  ) as Record<string, unknown>

  return [mapRoomRow(inserted)]
}

export function resolveActiveRoomId(rooms: CourseRoom[], requestedRoomId?: number | null) {
  if (requestedRoomId) {
    const room = rooms.find((entry) => entry.id === requestedRoomId)
    if (room) {
      return room.id
    }
  }

  return rooms[0]?.id ?? null
}

function isUsableStudentAuthSession(params: {
  auth: DesignatedSeatAuthSession | null
  deviceKeyHash?: string | null
  requiresEnforcedPresence: boolean
  nowMs?: number
}) {
  return Boolean(
    params.auth
    && params.deviceKeyHash
    && params.auth.device_key_hash === params.deviceKeyHash
    && params.auth.is_active
    && !params.auth.used_for_reservation_at
    && new Date(params.auth.expires_at).getTime() > (params.nowMs ?? Date.now())
    && (!params.requiresEnforcedPresence || params.auth.presence_location_verified)
  )
}

function resolveStudentActiveRoomId(
  rooms: CourseRoom[],
  requestedRoomId?: number | null,
  currentAuthRoomId?: number | null,
  currentReservationRoomId?: number | null,
) {
  if (requestedRoomId) {
    return resolveActiveRoomId(rooms, requestedRoomId)
  }

  if (currentAuthRoomId) {
    const room = rooms.find((entry) => entry.id === currentAuthRoomId)
    if (room) {
      return room.id
    }
  }

  if (currentReservationRoomId) {
    const room = rooms.find((entry) => entry.id === currentReservationRoomId)
    if (room) {
      return room.id
    }
  }

  return rooms.find((room) => room.is_open)?.id ?? null
}

const getCachedDesignatedSeats = unstable_cache(
  async (courseId: number, roomId: number) => {
    const db = createServerClient()
    const rows = unwrapSupabaseResult(
      'designatedSeat.seats',
      await db
        .from('course_seats')
        .select('*')
        .eq('course_id', courseId)
        .eq('room_id', roomId)
        .order('position_y')
        .order('position_x'),
    ) as Array<Record<string, unknown>> | null

    return (rows ?? []).map(mapSeatRow)
  },
  ['designated-seat-seats'],
  {
    revalidate: 15,
    tags: ['designated-seats'],
  },
)

const getCachedDesignatedSeatReservations = unstable_cache(
  async (courseId: number, roomId: number) => {
    const db = createServerClient()
    const todayStart = getTodayStartKST()
    const rows = unwrapSupabaseResult(
      'designatedSeat.reservations',
      await db
        .from('course_seat_reservations')
        .select('*,course_seats(id,room_id,label,position_x,position_y,is_active),enrollments(id,name,exam_number,status)')
        .eq('course_id', courseId)
        .eq('room_id', roomId)
        .gte('updated_at', todayStart)
        .order('updated_at', { ascending: false }),
    ) as Array<Record<string, unknown>> | null

    return (rows ?? []).map(mapReservationRow)
  },
  ['designated-seat-reservations'],
  {
    revalidate: 10,
    tags: ['designated-seats'],
  },
)

const getCachedDesignatedSeatAdminData = unstable_cache(
  async (courseId: number, roomId: number) => {
    const [layout, seats, reservations] = await Promise.all([
      getCachedDesignatedSeatLayout(courseId, roomId),
      getCachedDesignatedSeats(courseId, roomId),
      getCachedDesignatedSeatReservations(courseId, roomId),
    ])

    const db = createServerClient()
    const enrollments = unwrapSupabaseResult(
      'designatedSeat.adminEnrollments',
      await db
        .from('enrollments')
        .select('id,course_id,name,phone,exam_number,status,created_at')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
    ) as Enrollment[] | null

    return {
      layout,
      seats,
      reservations,
      enrollments: enrollments ?? [],
    }
  },
  ['designated-seat-admin-data'],
  {
    revalidate: 10,
    tags: ['designated-seats', 'enrollments'],
  },
)

export async function getDesignatedSeatLayout(courseId: number, roomId: number) {
  return getCachedDesignatedSeatLayout(courseId, roomId)
}

export async function listDesignatedSeats(courseId: number, roomId: number) {
  return getCachedDesignatedSeats(courseId, roomId)
}

export async function listDesignatedSeatReservations(courseId: number, roomId: number) {
  return getCachedDesignatedSeatReservations(courseId, roomId)
}

export async function listDesignatedSeatReservationsForDate(courseId: number, roomId: number, date: string) {
  if (date === getTodayKSTDateKey()) {
    return getCachedDesignatedSeatReservations(courseId, roomId)
  }

  const { startIso, endIso } = getKstDateBounds(date)
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'designatedSeat.reservationsForDate',
    await db
      .from('course_seat_events')
      .select('id,course_id,enrollment_id,seat_id,event_type,details,created_at,course_seats(id,room_id,label,position_x,position_y,is_active),enrollments(id,name,exam_number,status)')
      .eq('course_id', courseId)
      .in('event_type', [
        ...DESIGNATED_SEAT_ATTENDANCE_EVENT_TYPES,
        'admin_seat_cleared',
      ])
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ) as Array<Record<string, unknown>> | null

  const byEnrollment = new Map<number, DesignatedSeatReservation>()
  const seatOwner = new Map<number, number>()

  for (const row of rows ?? []) {
    const seatRow = row.course_seats as Record<string, unknown> | null
    if (seatRow && Number(seatRow.room_id) !== roomId) {
      continue
    }

    const enrollmentId = row.enrollment_id == null ? null : Number(row.enrollment_id)
    const seatId = row.seat_id == null ? null : Number(row.seat_id)
    if (!Number.isFinite(enrollmentId) || enrollmentId == null) {
      continue
    }

    if (row.event_type === 'admin_seat_cleared') {
      const previous = byEnrollment.get(enrollmentId)
      if (previous) {
        seatOwner.delete(previous.seat_id)
      }
      byEnrollment.delete(enrollmentId)
      continue
    }

    const reservation = mapHistoricalReservationRow(row)
    if (!reservation || seatId == null || !Number.isFinite(seatId)) {
      continue
    }

    const previous = byEnrollment.get(enrollmentId)
    if (previous) {
      seatOwner.delete(previous.seat_id)
    }

    const previousSeatOwner = seatOwner.get(seatId)
    if (previousSeatOwner != null && previousSeatOwner !== enrollmentId) {
      byEnrollment.delete(previousSeatOwner)
    }

    byEnrollment.set(enrollmentId, reservation)
    seatOwner.set(seatId, enrollmentId)
  }

  return [...byEnrollment.values()].sort((left, right) => left.updated_at.localeCompare(right.updated_at))
}

export async function getDesignatedSeatAdminData(courseId: number, roomId: number) {
  return getCachedDesignatedSeatAdminData(courseId, roomId)
}


export async function getDesignatedSeatStudentState(params: {
  course: Course
  enrollmentId: number
  roomId?: number | null
  deviceKeyHash?: string | null
}): Promise<DesignatedSeatStudentState> {
  if (!params.course.feature_designated_seat) {
    return {
      enabled: false,
      open: false,
      verified: false,
      writable: false,
      requires_reauth: false,
      restriction_reason: getDesignatedSeatRestrictionMessage({
        enabled: false,
        open: false,
        verified: false,
        hasReservation: false,
        hasLayout: false,
      }),
      auth_expires_at: null,
      rooms: [],
      active_room_id: null,
      layout: null,
      seats: [],
      occupied_seat_ids: [],
      reservation: null,
    }
  }

  const db = createServerClient()
  const todayStart = getTodayStartKST()
  const allRooms = await ensureCourseRooms(params.course.id)
  const rooms = params.course.designated_seat_open
    ? allRooms.filter((room) => room.is_open)
    : []
  const requiresEnforcedPresence = isPresenceLocationEnforced(params.course, 'designated_seat')
  const [existingReservationResult, authResult] = await Promise.all([
    db
      .from('course_seat_reservations')
      .select('*,course_seats(id,room_id,label,position_x,position_y,is_active)')
      .eq('course_id', params.course.id)
      .eq('enrollment_id', params.enrollmentId)
      .gte('updated_at', todayStart)
      .maybeSingle(),
    params.deviceKeyHash
      ? db
        .from('course_seat_auth_sessions')
        .select('*')
        .eq('course_id', params.course.id)
        .eq('enrollment_id', params.enrollmentId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  const existingReservationData = unwrapSupabaseResult(
    'designatedSeat.studentCurrentReservation',
    existingReservationResult,
  ) as Record<string, unknown> | null
  const authData = unwrapSupabaseResult(
    'designatedSeat.studentAuth',
    authResult,
  ) as Record<string, unknown> | null
  const auth = authData as unknown as DesignatedSeatAuthSession | null
  const currentReservation = existingReservationData ? mapReservationRow(existingReservationData) : null
  const visibleReservation = currentReservation && allRooms.some((room) => room.id === currentReservation.room_id)
    ? currentReservation
    : null

  const activeAuthRoomId = isUsableStudentAuthSession({
    auth,
    deviceKeyHash: params.deviceKeyHash,
    requiresEnforcedPresence,
  })
    ? Number(auth?.room_id)
    : null
  const activeRoomId = resolveStudentActiveRoomId(rooms, params.roomId, activeAuthRoomId, visibleReservation?.room_id)
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null
  const roomOpen = Boolean(params.course.designated_seat_open && activeRoom?.is_open)

  if (!activeRoomId) {
    return {
      enabled: params.course.feature_designated_seat,
      open: false,
      verified: false,
      writable: false,
      requires_reauth: false,
      restriction_reason: getDesignatedSeatRestrictionMessage({
        enabled: params.course.feature_designated_seat,
        open: false,
        verified: false,
        hasReservation: Boolean(visibleReservation),
        hasLayout: false,
      }),
      auth_expires_at: null,
      rooms,
      active_room_id: null,
      layout: null,
      seats: [],
      occupied_seat_ids: [],
      reservation: visibleReservation,
    }
  }

  const [layoutRow, seatsRows, occupiedRows] = await Promise.all([
    db
      .from('course_seat_layouts')
      .select('*')
      .eq('course_id', params.course.id)
      .eq('room_id', activeRoomId)
      .maybeSingle(),
    db
      .from('course_seats')
      .select('*')
      .eq('course_id', params.course.id)
      .eq('room_id', activeRoomId)
      .order('position_y')
      .order('position_x'),
    db
      .from('course_seat_reservations')
      .select('seat_id')
      .eq('course_id', params.course.id)
      .eq('room_id', activeRoomId)
      .gte('updated_at', todayStart),
  ])

  const layout = mapLayoutRow(
    unwrapSupabaseResult('designatedSeat.studentLayout', layoutRow) as Record<string, unknown> | null,
  )
  const seats = (
    unwrapSupabaseResult('designatedSeat.studentSeats', seatsRows) as Array<Record<string, unknown>> | null
  )?.map(mapSeatRow) ?? []
  const occupiedSeatIds = (
    unwrapSupabaseResult('designatedSeat.occupiedSeats', occupiedRows) as Array<{ seat_id: number }> | null
  )?.map((row) => Number(row.seat_id)) ?? []

  const nowMs = Date.now()
  const verified = Boolean(
    auth
    && Number(auth.room_id) === activeRoomId
    && isUsableStudentAuthSession({
      auth,
      deviceKeyHash: params.deviceKeyHash,
      requiresEnforcedPresence,
      nowMs,
    })
  )

  const restrictionReason = getDesignatedSeatRestrictionMessage({
    enabled: params.course.feature_designated_seat,
    open: roomOpen,
    verified,
    hasReservation: Boolean(visibleReservation),
    hasLayout: Boolean(layout) && seats.length > 0,
  })

  return {
    enabled: params.course.feature_designated_seat,
    open: roomOpen,
    verified,
    writable: Boolean(roomOpen && verified && layout && seats.length > 0),
    requires_reauth: Boolean(roomOpen && visibleReservation && !verified),
    restriction_reason: restrictionReason,
    auth_expires_at: verified ? auth?.expires_at ?? null : null,
    rooms,
    active_room_id: activeRoomId,
    layout,
    seats,
    occupied_seat_ids: occupiedSeatIds,
    reservation: visibleReservation,
  }
}


export async function verifyStudentSeatAccess(params: {
  courseId: number
  enrollmentId: number
  name: string
  phone: string
  division: string
}) {
  const db = createServerClient()
  const course = unwrapSupabaseResult(
    'designatedSeat.verifyCourse',
    await db
      .from('courses')
      .select('*')
      .eq('id', params.courseId)
      .eq('division', params.division)
      .eq('status', 'active')
      .maybeSingle(),
  ) as Course | null

  if (!course) {
    return null
  }

  const enrollment = unwrapSupabaseResult(
    'designatedSeat.verifyEnrollment',
    await db
      .from('enrollments')
      .select('*')
      .eq('id', params.enrollmentId)
      .eq('course_id', params.courseId)
      .maybeSingle(),
  ) as Enrollment | null

  if (!enrollment) {
    return null
  }

  if (normalizeName(enrollment.name) !== normalizeName(params.name)) {
    return null
  }

  if (normalizePhone(enrollment.phone) !== normalizePhone(params.phone)) {
    return null
  }

  return { course, enrollment }
}

export async function getActiveDisplaySessionForDisplayTarget(courseId: number, slotId?: number | null, roomId?: number | null) {
  const db = createServerClient()
  let query = db
    .from('course_seat_display_sessions')
    .select('*')
    .eq('course_id', courseId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())

  query = slotId
    ? query.eq('display_slot_id', slotId)
    : query.is('display_slot_id', null)
  if (roomId) {
    query = query.eq('room_id', roomId)
  }

  const row = unwrapSupabaseResult(
    'designatedSeat.activeDisplaySessionByDisplayTarget',
    await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as DesignatedSeatDisplaySession | null

  return row
}

export async function getActiveDisplaySessionByHash(courseId: number, displayTokenHash: string) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'designatedSeat.activeDisplaySessionByHash',
    await db
      .from('course_seat_display_sessions')
      .select('*')
      .eq('course_id', courseId)
      .eq('display_token_hash', displayTokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as DesignatedSeatDisplaySession | null

  return row
}

export async function getActiveDisplaySessionById(courseId: number, displaySessionId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'designatedSeat.activeDisplaySessionById',
    await db
      .from('course_seat_display_sessions')
      .select('*')
      .eq('id', displaySessionId)
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as DesignatedSeatDisplaySession | null

  return row
}

function normalizeDbTime(value: string) {
  const [hour = '00', minute = '00', second = '00'] = value.split(':')
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.slice(0, 2).padStart(2, '0')}`
}

function getKstDate(value: Date) {
  return new Date(value.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

function getKstScheduleClock(value: Date) {
  const kst = getKstDate(value)
  const hour = String(kst.getHours()).padStart(2, '0')
  const minute = String(kst.getMinutes()).padStart(2, '0')
  const second = String(kst.getSeconds()).padStart(2, '0')

  return {
    dayOfWeek: kst.getDay(),
    time: `${hour}:${minute}:${second}`,
  }
}

function getKstScheduleEndIso(
  schedule: Pick<DesignatedSeatDisplaySchedule | DesignatedSeatDisplaySlotSchedule, 'end_time'>,
  now: Date,
) {
  const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now)
  return new Date(`${dateKey}T${normalizeDbTime(schedule.end_time)}+09:00`).toISOString()
}

export async function getCurrentDisplaySchedule(courseId: number, now = new Date()) {
  const db = createServerClient()
  const clock = getKstScheduleClock(now)
  const row = unwrapSupabaseResult(
    'designatedSeat.currentDisplaySchedule',
    await db
      .from('course_seat_display_schedules')
      .select('*')
      .eq('course_id', courseId)
      .eq('day_of_week', clock.dayOfWeek)
      .eq('is_active', true)
      .lte('start_time', clock.time)
      .gt('end_time', clock.time)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as DesignatedSeatDisplaySchedule | null

  return row
}

export async function getCurrentDisplaySlotSchedule(slotId: number, now = new Date()) {
  const db = createServerClient()
  const clock = getKstScheduleClock(now)
  const row = unwrapSupabaseResult(
    'designatedSeat.currentDisplaySlotSchedule',
    await db
      .from('course_seat_display_slot_schedules')
      .select('*')
      .eq('slot_id', slotId)
      .eq('day_of_week', clock.dayOfWeek)
      .eq('is_active', true)
      .lte('start_time', clock.time)
      .gt('end_time', clock.time)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as DesignatedSeatDisplaySlotSchedule | null

  return row
}

async function revokeExpiredDisplaySessions(
  db: ReturnType<typeof createServerClient>,
  courseId: number,
  nowIso: string,
) {
  const result = await db
    .from('course_seat_display_sessions')
    .update({
      revoked_at: nowIso,
    })
    .eq('course_id', courseId)
    .is('revoked_at', null)
    .lte('expires_at', nowIso)

  if (result.error) {
    throw result.error
  }
}

export type DisplaySessionAvailability =
  | {
    status: 'active'
    session: DesignatedSeatDisplaySession
    schedule: DesignatedSeatDisplaySchedule | DesignatedSeatDisplaySlotSchedule | null
  }
  | {
    status: 'inactive'
    reason: 'NO_ACTIVE_SESSION_OR_SCHEDULE'
    schedule: null
  }

export async function ensureDisplaySessionForCurrentSchedule(
  courseId: number,
  options: { slotId?: number | null; roomId?: number | null } = {},
): Promise<DisplaySessionAvailability> {
  const db = createServerClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const slotId = options.slotId ?? null
  const roomId = options.roomId ?? null
  if (!roomId) {
    throw new Error('Display room is required.')
  }

  await revokeExpiredDisplaySessions(db, courseId, nowIso)

  const activeSession = await getActiveDisplaySessionForDisplayTarget(courseId, slotId, roomId)
  if (activeSession) {
    return {
      status: 'active',
      session: activeSession,
      schedule: activeSession.display_slot_id
        ? await getCurrentDisplaySlotSchedule(activeSession.display_slot_id, now)
        : activeSession.schedule_id
          ? await getCurrentDisplaySchedule(courseId, now)
          : null,
    }
  }

  const schedule = slotId
    ? await getCurrentDisplaySlotSchedule(slotId, now)
    : await getCurrentDisplaySchedule(courseId, now)
  if (!schedule) {
    return {
      status: 'inactive',
      reason: 'NO_ACTIVE_SESSION_OR_SCHEDULE',
      schedule: null,
    }
  }

  const rawToken = createOpaqueDisplayToken()
  const expiresAt = getKstScheduleEndIso(schedule, now)
  const insertResult = await db
    .from('course_seat_display_sessions')
    .insert({
      course_id: courseId,
      room_id: roomId,
      display_token_hash: hashToken(rawToken),
      created_by: 'schedule',
      expires_at: expiresAt,
      last_seen_at: nowIso,
      source: 'schedule',
      schedule_id: slotId ? null : schedule.id,
      display_slot_id: slotId,
    })
    .select('*')
    .single()

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      const concurrentSession = await getActiveDisplaySessionForDisplayTarget(courseId, slotId, roomId)
      if (concurrentSession) {
        return {
          status: 'active',
          session: concurrentSession,
          schedule,
        }
      }
    }

    throw insertResult.error
  }

  await logDesignatedSeatEvent({
    course_id: courseId,
    enrollment_id: null,
    seat_id: null,
    event_type: 'display_session_started',
    details: {
      display_session_id: insertResult.data.id,
      actor: 'schedule',
      source: 'schedule',
      schedule_id: slotId ? null : schedule.id,
      display_slot_id: slotId,
      room_id: roomId,
    },
  })

  return {
    status: 'active',
    session: insertResult.data as DesignatedSeatDisplaySession,
    schedule,
  }
}

export async function logDesignatedSeatEvent(input: Omit<DesignatedSeatEvent, 'id' | 'created_at'>) {
  const db = createServerClient()
  await db.from('course_seat_events').insert({
    course_id: input.course_id,
    enrollment_id: input.enrollment_id,
    seat_id: input.seat_id,
    event_type: input.event_type,
    details: input.details ?? {},
  })
}

const DESIGNATED_SEAT_ATTENDANCE_EVENT_TYPES: DesignatedSeatAttendanceEventType[] = [
  'seat_reserved',
  'seat_changed',
  'seat_unchanged',
  'admin_seat_reserved',
  'admin_seat_changed',
  'admin_seat_unchanged',
]

const designatedSeatAttendanceEventTypeSet = new Set<DesignatedSeatAttendanceEventType>(
  DESIGNATED_SEAT_ATTENDANCE_EVENT_TYPES,
)

type DesignatedSeatAttendanceMetrics = {
  consecutiveAbsences: number
  lastAttendedDate: string | null
}

function getKstDateKey(value: string | Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(value))
}

function getDateKeyFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getDateKeyAtUtcNoon(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`)
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = getDateKeyAtUtcNoon(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return getDateKeyFromUtcDate(date)
}

function isWeekdayDateKey(dateKey: string) {
  const day = getDateKeyAtUtcNoon(dateKey).getUTCDay()
  return day !== 0 && day !== 6
}

function maxDateKey(left: string | null | undefined, right: string | null | undefined) {
  if (!left) {
    return right ?? null
  }

  if (!right) {
    return left
  }

  return left > right ? left : right
}

function minDateKey(left: string | null | undefined, right: string | null | undefined) {
  if (!left) {
    return right ?? null
  }

  if (!right) {
    return left
  }

  return left < right ? left : right
}

function getKstDayStartIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`).toISOString()
}

function getNextKstDayStartIso(dateKey: string) {
  return getKstDayStartIso(addDaysToDateKey(dateKey, 1))
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return getKstDateKey(trimmed)
  }

  return null
}

function mapDesignatedSeatAttendanceRow(row: Record<string, unknown>): DesignatedSeatAttendanceRecord {
  const statusValue = row.status === 'present' ? 'present' : 'absent'
  const eventTypeValue = typeof row.event_type === 'string'
    && designatedSeatAttendanceEventTypeSet.has(row.event_type as DesignatedSeatAttendanceEventType)
    ? row.event_type as DesignatedSeatAttendanceEventType
    : null

  return {
    enrollmentId: Number(row.enrollment_id),
    studentName: String(row.student_name ?? ''),
    examNumber: row.exam_number ? String(row.exam_number) : null,
    phone: String(row.phone ?? ''),
    status: statusValue as DesignatedSeatAttendanceStatus,
    consecutiveAbsences: Number(row.consecutive_absences ?? 0),
    lastAttendedDate: row.last_attended_date ? String(row.last_attended_date) : null,
    seatId: row.seat_id == null ? null : Number(row.seat_id),
    seatLabel: row.seat_label ? String(row.seat_label) : null,
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : null,
    eventType: eventTypeValue,
  }
}

async function getDesignatedSeatAbsenceMetrics(params: {
  courseId: number
  date: string
  records: DesignatedSeatAttendanceRecord[]
}) {
  const result = new Map<number, DesignatedSeatAttendanceMetrics>()
  for (const record of params.records) {
    result.set(record.enrollmentId, {
      consecutiveAbsences: 0,
      lastAttendedDate: null,
    })
  }

  const absentRecords = params.records.filter((record) => record.status === 'absent')
  if (absentRecords.length === 0) {
    return result
  }

  const db = createServerClient()
  const [courseResult, enrollmentsResult] = await Promise.all([
    db
      .from('courses')
      .select('enrolled_from')
      .eq('id', params.courseId)
      .maybeSingle(),
    db
      .from('enrollments')
      .select('id,created_at')
      .eq('course_id', params.courseId)
      .eq('status', 'active'),
  ])

  const courseRow = unwrapSupabaseResult(
    'designatedSeat.absenceMetrics.course',
    courseResult,
  ) as { enrolled_from?: string | null } | null
  const enrollmentRows = unwrapSupabaseResult(
    'designatedSeat.absenceMetrics.enrollments',
    enrollmentsResult,
  ) as Array<{ id: number; created_at: string | null }> | null

  const courseStartDate = normalizeDateKey(courseRow?.enrolled_from)
  const enrollmentStartDateMap = new Map<number, string | null>()
  let earliestStartDate: string | null = courseStartDate ?? params.date

  for (const enrollment of enrollmentRows ?? []) {
    const enrollmentStartDate = maxDateKey(courseStartDate, normalizeDateKey(enrollment.created_at))
    enrollmentStartDateMap.set(Number(enrollment.id), enrollmentStartDate)
    earliestStartDate = minDateKey(earliestStartDate, enrollmentStartDate)
  }

  const startDate = earliestStartDate && earliestStartDate <= params.date ? earliestStartDate : params.date
  const startIso = getKstDayStartIso(startDate)
  const endIso = getNextKstDayStartIso(params.date)

  const [eventsResult, displaySessionsResult] = await Promise.all([
    db
      .from('course_seat_events')
      .select('enrollment_id,created_at')
      .eq('course_id', params.courseId)
      .in('event_type', DESIGNATED_SEAT_ATTENDANCE_EVENT_TYPES)
      .not('enrollment_id', 'is', null)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    db
      .from('course_seat_display_sessions')
      .select('created_at')
      .eq('course_id', params.courseId)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
  ])

  const eventRows = unwrapSupabaseResult(
    'designatedSeat.absenceMetrics.events',
    eventsResult,
  ) as Array<{ enrollment_id: number | null; created_at: string }> | null
  const displaySessionRows = unwrapSupabaseResult(
    'designatedSeat.absenceMetrics.displaySessions',
    displaySessionsResult,
  ) as Array<{ created_at: string }> | null

  const operatedWeekdayDateSet = new Set<string>()
  if (isWeekdayDateKey(params.date)) {
    operatedWeekdayDateSet.add(params.date)
  }

  for (const row of displaySessionRows ?? []) {
    const dateKey = getKstDateKey(row.created_at)
    if (isWeekdayDateKey(dateKey)) {
      operatedWeekdayDateSet.add(dateKey)
    }
  }

  const attendanceDateMap = new Map<number, Set<string>>()
  for (const row of eventRows ?? []) {
    const enrollmentId = Number(row.enrollment_id)
    if (!Number.isFinite(enrollmentId)) {
      continue
    }

    const dateKey = getKstDateKey(row.created_at)
    if (!isWeekdayDateKey(dateKey)) {
      continue
    }

    operatedWeekdayDateSet.add(dateKey)
    if (!attendanceDateMap.has(enrollmentId)) {
      attendanceDateMap.set(enrollmentId, new Set<string>())
    }
    attendanceDateMap.get(enrollmentId)?.add(dateKey)
  }

  const operatedWeekdayDates = [...operatedWeekdayDateSet]
    .filter((dateKey) => dateKey >= startDate && dateKey <= params.date)
    .sort((left, right) => right.localeCompare(left))

  for (const record of params.records) {
    if (record.status === 'present') {
      result.set(record.enrollmentId, {
        consecutiveAbsences: 0,
        lastAttendedDate: params.date,
      })
      continue
    }

    const enrollmentStartDate = enrollmentStartDateMap.get(record.enrollmentId) ?? startDate
    const attendedDates = attendanceDateMap.get(record.enrollmentId) ?? new Set<string>()
    const lastAttendedDate = operatedWeekdayDates.find((dateKey) => (
      dateKey >= enrollmentStartDate && attendedDates.has(dateKey)
    )) ?? null
    let consecutiveAbsences = 0

    for (const dateKey of operatedWeekdayDates) {
      if (dateKey < enrollmentStartDate) {
        break
      }

      if (attendedDates.has(dateKey)) {
        break
      }

      consecutiveAbsences += 1
    }

    result.set(record.enrollmentId, {
      consecutiveAbsences,
      lastAttendedDate,
    })
  }

  return result
}

export async function getDesignatedSeatAttendanceDashboardData(params: {
  courseId: number
  date: string
}): Promise<DesignatedSeatAttendanceDashboard> {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'designatedSeat.attendanceDashboard',
    await db.rpc('get_designated_seat_attendance_dashboard', {
      p_course_id: params.courseId,
      p_date: params.date,
    }),
  ) as Array<Record<string, unknown>> | null

  const baseRecords = (rows ?? []).map(mapDesignatedSeatAttendanceRow)
  const absenceMetrics = await getDesignatedSeatAbsenceMetrics({
    courseId: params.courseId,
    date: params.date,
    records: baseRecords,
  })
  const records = baseRecords.map((record) => {
    const metric = absenceMetrics.get(record.enrollmentId)
    return {
      ...record,
      consecutiveAbsences: metric?.consecutiveAbsences ?? 0,
      lastAttendedDate: metric?.lastAttendedDate ?? null,
    }
  })
  const targetCount = records.length
  const presentCount = records.filter((row) => row.status === 'present').length
  const absentCount = Math.max(targetCount - presentCount, 0)
  const attendanceRate = targetCount > 0
    ? Number(((presentCount / targetCount) * 100).toFixed(1))
    : 0

  return {
    date: params.date,
    courseId: params.courseId,
    stats: {
      targetCount,
      presentCount,
      absentCount,
      attendanceRate,
    },
    records,
  }
}
