import { unstable_cache } from 'next/cache'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import type {
  Course,
  DesignatedSeat,
  DesignatedSeatAuthSession,
  DesignatedSeatDisplaySession,
  DesignatedSeatEvent,
  DesignatedSeatLayout,
  DesignatedSeatReservation,
  DesignatedSeatStudentState,
  Enrollment,
} from '@/types/database'
import { normalizeName, normalizePhone } from '@/lib/utils'

/** Returns today's midnight in KST as ISO string (UTC) for filtering daily reservations. */
export function getTodayStartKST(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  kst.setHours(0, 0, 0, 0)
  // Convert KST midnight back to UTC
  const utcMidnight = new Date(kst.getTime() - 9 * 60 * 60 * 1000)
  return utcMidnight.toISOString()
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
    seat_id: Number(row.seat_id),
    enrollment_id: Number(row.enrollment_id),
    device_key_hash: row.device_key_hash ? String(row.device_key_hash) : null,
    reserved_at: String(row.reserved_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    seat: seatRow
      ? {
        id: Number(seatRow.id),
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

  if (!state.hasLayout) {
    return '관리자가 아직 좌석 배치를 준비하지 않았습니다.'
  }

  if (!state.open) {
    return '현재 좌석 신청이 닫혀 있습니다.'
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
  async (courseId: number) => {
    const db = createServerClient()
    const row = unwrapSupabaseResult(
      'designatedSeat.layout',
      await db
        .from('course_seat_layouts')
        .select('*')
        .eq('course_id', courseId)
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

const getCachedDesignatedSeats = unstable_cache(
  async (courseId: number) => {
    const db = createServerClient()
    const rows = unwrapSupabaseResult(
      'designatedSeat.seats',
      await db
        .from('course_seats')
        .select('*')
        .eq('course_id', courseId)
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
  async (courseId: number) => {
    const db = createServerClient()
    const todayStart = getTodayStartKST()
    const rows = unwrapSupabaseResult(
      'designatedSeat.reservations',
      await db
        .from('course_seat_reservations')
        .select('*,course_seats(id,label,position_x,position_y,is_active),enrollments(id,name,exam_number,status)')
        .eq('course_id', courseId)
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
  async (courseId: number) => {
    const [layout, seats, reservations] = await Promise.all([
      getCachedDesignatedSeatLayout(courseId),
      getCachedDesignatedSeats(courseId),
      getCachedDesignatedSeatReservations(courseId),
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

export async function getDesignatedSeatLayout(courseId: number) {
  return getCachedDesignatedSeatLayout(courseId)
}

export async function listDesignatedSeats(courseId: number) {
  return getCachedDesignatedSeats(courseId)
}

export async function listDesignatedSeatReservations(courseId: number) {
  return getCachedDesignatedSeatReservations(courseId)
}

export async function getDesignatedSeatAdminData(courseId: number) {
  return getCachedDesignatedSeatAdminData(courseId)
}


export async function getDesignatedSeatStudentState(params: {
  course: Course
  enrollmentId: number
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
      layout: null,
      seats: [],
      occupied_seat_ids: [],
      reservation: null,
    }
  }

  const db = createServerClient()
  const todayStart = getTodayStartKST()
  const [layoutRow, seatsRows, reservationRow, authRow, occupiedRows] = await Promise.all([
    db
      .from('course_seat_layouts')
      .select('*')
      .eq('course_id', params.course.id)
      .maybeSingle(),
    db
      .from('course_seats')
      .select('*')
      .eq('course_id', params.course.id)
      .order('position_y')
      .order('position_x'),
    db
      .from('course_seat_reservations')
      .select('*,course_seats(id,label,position_x,position_y,is_active)')
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
    db
      .from('course_seat_reservations')
      .select('seat_id')
      .eq('course_id', params.course.id)
      .gte('updated_at', todayStart),
  ])

  const layout = mapLayoutRow(
    unwrapSupabaseResult('designatedSeat.studentLayout', layoutRow) as Record<string, unknown> | null,
  )
  const seats = (
    unwrapSupabaseResult('designatedSeat.studentSeats', seatsRows) as Array<Record<string, unknown>> | null
  )?.map(mapSeatRow) ?? []
  const reservationData = unwrapSupabaseResult(
    'designatedSeat.studentReservation',
    reservationRow,
  ) as Record<string, unknown> | null
  const reservation = reservationData ? mapReservationRow(reservationData) : null
  const authData = unwrapSupabaseResult(
    'designatedSeat.studentAuth',
    authRow,
  ) as Record<string, unknown> | null
  const auth = authData as unknown as DesignatedSeatAuthSession | null
  const occupiedSeatIds = (
    unwrapSupabaseResult('designatedSeat.occupiedSeats', occupiedRows) as Array<{ seat_id: number }> | null
  )?.map((row) => Number(row.seat_id)) ?? []

  const verified = Boolean(
    auth
    && params.deviceKeyHash
    && auth.device_key_hash === params.deviceKeyHash
    && auth.is_active
    && !auth.used_for_reservation_at
    && new Date(auth.expires_at).getTime() > Date.now(),
  )

  const restrictionReason = getDesignatedSeatRestrictionMessage({
    enabled: params.course.feature_designated_seat,
    open: params.course.designated_seat_open,
    verified,
    hasReservation: Boolean(reservation),
    hasLayout: Boolean(layout) && seats.length > 0,
  })

  return {
    enabled: params.course.feature_designated_seat,
    open: params.course.designated_seat_open,
    verified,
    writable: Boolean(params.course.designated_seat_open && verified && layout && seats.length > 0),
    requires_reauth: Boolean(params.course.designated_seat_open && reservation && !verified),
    restriction_reason: restrictionReason,
    auth_expires_at: verified ? auth?.expires_at ?? null : null,
    layout,
    seats,
    occupied_seat_ids: occupiedSeatIds,
    reservation,
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

export async function getActiveDisplaySessionForCourse(courseId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'designatedSeat.activeDisplaySessionByCourse',
    await db
      .from('course_seat_display_sessions')
      .select('*')
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
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
