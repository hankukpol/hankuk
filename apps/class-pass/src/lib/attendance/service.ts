import { normalizeName, normalizePhone } from '@/lib/utils'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import type {
  AttendanceDisplaySession,
  AttendanceEvent,
  AttendanceRecord,
  AttendanceStudentState,
  Course,
  Enrollment,
} from '@/types/database'

function getKstDateKey(value: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

export function getAttendanceTodayKey() {
  return getKstDateKey()
}

function mapAttendanceDisplaySessionRow(row: Record<string, unknown>): AttendanceDisplaySession {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    display_token_hash: String(row.display_token_hash ?? ''),
    created_by: String(row.created_by ?? 'admin'),
    expires_at: String(row.expires_at ?? ''),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    last_seen_at: String(row.last_seen_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

function mapAttendanceRecordRow(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    enrollment_id: Number(row.enrollment_id),
    display_session_id: row.display_session_id == null ? null : Number(row.display_session_id),
    device_key_hash: String(row.device_key_hash ?? ''),
    attended_date: String(row.attended_date ?? ''),
    attended_at: String(row.attended_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

async function listActiveEnrollments(courseId: number) {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.activeEnrollments',
    await db
      .from('enrollments')
      .select('id,course_id,name,phone,exam_number,status,created_at')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('created_at'),
  ) as Enrollment[] | null

  return rows ?? []
}

async function listSeatLabelsByEnrollment(courseId: number) {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.seatLabels',
    await db
      .from('course_seat_reservations')
      .select('enrollment_id,updated_at,course_seats(label)')
      .eq('course_id', courseId)
      .order('updated_at', { ascending: false }),
  ) as Array<{
    enrollment_id: number
    updated_at: string
    course_seats?: { label?: string | null } | null
  }> | null

  const seatLabelMap = new Map<number, string>()
  for (const row of rows ?? []) {
    const enrollmentId = Number(row.enrollment_id)
    if (seatLabelMap.has(enrollmentId)) {
      continue
    }

    const label = row.course_seats?.label
    if (label) {
      seatLabelMap.set(enrollmentId, label)
    }
  }

  return seatLabelMap
}

async function listAttendanceRecordsForCourse(courseId: number, options?: { attendedDate?: string }) {
  const db = createServerClient()
  let query = db
    .from('attendance_records')
    .select('id,course_id,enrollment_id,display_session_id,device_key_hash,attended_date,attended_at,created_at')
    .eq('course_id', courseId)
    .order('attended_at', { ascending: false })

  if (options?.attendedDate) {
    query = query.eq('attended_date', options.attendedDate)
  }

  const rows = unwrapSupabaseResult(
    'attendance.records',
    await query,
  ) as Array<Record<string, unknown>> | null

  return (rows ?? []).map(mapAttendanceRecordRow)
}

async function getAttendanceRecordForToday(courseId: number, enrollmentId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.recordForToday',
    await db
      .from('attendance_records')
      .select('id,course_id,enrollment_id,display_session_id,device_key_hash,attended_date,attended_at,created_at')
      .eq('course_id', courseId)
      .eq('enrollment_id', enrollmentId)
      .eq('attended_date', getAttendanceTodayKey())
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceRecordRow(row) : null
}

async function getAttendanceAbsenceMetrics(courseId: number, enrollmentIds: number[]) {
  const result = new Map<number, { consecutiveAbsences: number; lastAttendedDate: string | null }>()
  for (const enrollmentId of enrollmentIds) {
    result.set(enrollmentId, { consecutiveAbsences: 0, lastAttendedDate: null })
  }

  if (enrollmentIds.length === 0) {
    return result
  }

  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.absenceMetrics',
    await db.rpc('get_attendance_absence_metrics', {
      p_course_id: courseId,
      p_enrollment_ids: enrollmentIds,
    }),
  ) as Array<{
    enrollment_id: number
    consecutive_absences: number | null
    last_attended_date: string | null
  }> | null

  for (const row of rows ?? []) {
    result.set(Number(row.enrollment_id), {
      consecutiveAbsences: Number(row.consecutive_absences ?? 0),
      lastAttendedDate: row.last_attended_date ? String(row.last_attended_date) : null,
    })
  }

  return result
}

export async function verifyStudentAttendanceAccess(params: {
  courseId: number
  enrollmentId: number
  name: string
  phone: string
  division: string
}) {
  const db = createServerClient()
  const course = unwrapSupabaseResult(
    'attendance.verifyCourse',
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
    'attendance.verifyEnrollment',
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

export async function getActiveAttendanceDisplaySessionForCourse(courseId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionByCourse',
    await db
      .from('attendance_display_sessions')
      .select('*')
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function getActiveAttendanceDisplaySessionByHash(courseId: number, displayTokenHash: string) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionByHash',
    await db
      .from('attendance_display_sessions')
      .select('*')
      .eq('course_id', courseId)
      .eq('display_token_hash', displayTokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function getActiveAttendanceDisplaySessionById(courseId: number, displaySessionId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionById',
    await db
      .from('attendance_display_sessions')
      .select('*')
      .eq('id', displaySessionId)
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function logAttendanceEvent(input: Omit<AttendanceEvent, 'id' | 'created_at'>) {
  const db = createServerClient()
  await db.from('attendance_events').insert({
    course_id: input.course_id,
    event_type: input.event_type,
    details: input.details ?? {},
  })
}

export async function getAttendanceStudentState(params: {
  course: Course
  enrollmentId: number
}): Promise<AttendanceStudentState> {
  if (!params.course.feature_attendance) {
    return {
      enabled: false,
      open: false,
      attended_today: false,
      attended_at: null,
    }
  }

  const [attendanceRecord, activeDisplaySession] = await Promise.all([
    getAttendanceRecordForToday(params.course.id, params.enrollmentId),
    params.course.attendance_open
      ? getActiveAttendanceDisplaySessionForCourse(params.course.id)
      : Promise.resolve(null),
  ])

  return {
    enabled: true,
    open: Boolean(params.course.attendance_open && activeDisplaySession),
    attended_today: Boolean(attendanceRecord),
    attended_at: attendanceRecord?.attended_at ?? null,
  }
}

export async function getConsecutiveAbsenceMap(courseId: number, enrollmentIds: number[]) {
  const result = new Map<number, number>()
  const metrics = await getAttendanceAbsenceMetrics(courseId, enrollmentIds)
  for (const [enrollmentId, metric] of metrics.entries()) {
    result.set(enrollmentId, metric.consecutiveAbsences)
  }

  return result
}

export async function getAttendanceDashboardData(params: {
  courseId: number
  date?: string
}) {
  const targetDate = params.date ?? getAttendanceTodayKey()
  const [enrollments, records, activeDisplaySession, seatLabelMap] = await Promise.all([
    listActiveEnrollments(params.courseId),
    listAttendanceRecordsForCourse(params.courseId, { attendedDate: targetDate }),
    getActiveAttendanceDisplaySessionForCourse(params.courseId),
    listSeatLabelsByEnrollment(params.courseId),
  ])

  const enrollmentMap = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]))
  const presentEnrollmentIds = new Set(records.map((record) => record.enrollment_id))
  const absentEnrollments = enrollments.filter((enrollment) => !presentEnrollmentIds.has(enrollment.id))
  const consecutiveAbsenceMap = await getConsecutiveAbsenceMap(
    params.courseId,
    absentEnrollments.map((enrollment) => enrollment.id),
  )

  return {
    date: targetDate,
    totalEnrolled: enrollments.length,
    presentCount: records.length,
    absentCount: Math.max(enrollments.length - records.length, 0),
    attendanceRate: enrollments.length === 0
      ? 0
      : Number(((records.length / enrollments.length) * 100).toFixed(1)),
    absentees: absentEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: consecutiveAbsenceMap.get(enrollment.id) ?? 0,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
      }))
      .sort((left, right) => (
        right.consecutiveAbsences - left.consecutiveAbsences
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      )),
    recentRecords: records
      .map((record) => {
        const enrollment = enrollmentMap.get(record.enrollment_id)
        if (!enrollment) {
          return null
        }

        return {
          enrollmentId: record.enrollment_id,
          studentName: enrollment.name,
          examNumber: enrollment.exam_number,
          attendedAt: record.attended_at,
        }
      })
      .filter((value): value is {
        enrollmentId: number
        studentName: string
        examNumber: string | null
        attendedAt: string
      } => Boolean(value)),
    displaySession: {
      id: activeDisplaySession?.id ?? null,
      isActive: Boolean(activeDisplaySession),
      expiresAt: activeDisplaySession?.expires_at ?? null,
    },
  }
}

export async function getAttendanceAbsenceReport(params: {
  courseId: number
  threshold: number
}) {
  const [enrollments, seatLabelMap] = await Promise.all([
    listActiveEnrollments(params.courseId),
    listSeatLabelsByEnrollment(params.courseId),
  ])
  const absenceMetrics = await getAttendanceAbsenceMetrics(
    params.courseId,
    enrollments.map((enrollment) => enrollment.id),
  )

  const flaggedStudents = enrollments
    .map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentName: enrollment.name,
      examNumber: enrollment.exam_number,
      consecutiveAbsences: absenceMetrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
      lastAttendedDate: absenceMetrics.get(enrollment.id)?.lastAttendedDate ?? null,
      seatLabel: seatLabelMap.get(enrollment.id) ?? null,
    }))
    .filter((student) => student.consecutiveAbsences >= params.threshold)
    .sort((left, right) => (
      right.consecutiveAbsences - left.consecutiveAbsences
      || left.studentName.localeCompare(right.studentName, 'ko-KR')
    ))

  return {
    threshold: params.threshold,
    flaggedStudents,
  }
}
