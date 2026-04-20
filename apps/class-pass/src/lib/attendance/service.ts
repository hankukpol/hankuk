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

function getKstDateRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export function getAttendanceTodayKey() {
  return getKstDateKey()
}

function hasAttendanceStartedForDate(targetDate: string, attendanceStartDate?: string | null) {
  if (!attendanceStartDate) {
    return true
  }

  return targetDate >= attendanceStartDate.slice(0, 10)
}

export function hasCourseAttendanceStarted(
  course: Pick<Course, 'enrolled_from'>,
  targetDate = getAttendanceTodayKey(),
) {
  return hasAttendanceStartedForDate(targetDate, course.enrolled_from)
}

function getEffectiveAttendanceStartDate(
  courseAttendanceStartDate?: string | null,
  enrollmentCreatedAt?: string | null,
) {
  const normalizedCourseDate = courseAttendanceStartDate?.slice(0, 10) ?? null
  const normalizedEnrollmentDate = enrollmentCreatedAt
    ? getKstDateKey(enrollmentCreatedAt)
    : null

  if (!normalizedCourseDate) {
    return normalizedEnrollmentDate
  }

  if (!normalizedEnrollmentDate) {
    return normalizedCourseDate
  }

  return normalizedEnrollmentDate > normalizedCourseDate
    ? normalizedEnrollmentDate
    : normalizedCourseDate
}

export function getEnrollmentAttendanceStartDate(
  course: Pick<Course, 'enrolled_from'>,
  enrollment: Pick<Enrollment, 'created_at'>,
) {
  return getEffectiveAttendanceStartDate(course.enrolled_from, enrollment.created_at)
}

export function hasEnrollmentAttendanceStarted(params: {
  course: Pick<Course, 'enrolled_from'>
  enrollment: Pick<Enrollment, 'created_at'>
  targetDate?: string
}) {
  return hasAttendanceStartedForDate(
    params.targetDate ?? getAttendanceTodayKey(),
    getEnrollmentAttendanceStartDate(params.course, params.enrollment),
  )
}

function mapAttendanceDisplaySessionRow(row: Record<string, unknown>): AttendanceDisplaySession {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
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
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
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

async function listSeatLabelsByEnrollment(courseId: number, subjectId?: number | null) {
  const db = createServerClient()

  if (subjectId != null) {
    const rows = unwrapSupabaseResult(
      'attendance.subjectSeatLabels',
      await db
        .from('seat_assignments')
        .select('enrollment_id,seat_number')
        .eq('subject_id', subjectId),
    ) as Array<{
      enrollment_id: number
      seat_number: string | null
    }> | null

    const seatLabelMap = new Map<number, string>()
    for (const row of rows ?? []) {
      const label = normalizeAttendanceSeatNumber(row.seat_number)
      if (!label) {
        continue
      }

      seatLabelMap.set(Number(row.enrollment_id), label)
    }

    return seatLabelMap
  }

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

async function listAttendanceSubjects(courseId: number) {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.subjects',
    await db
      .from('course_subjects')
      .select('id,name,sort_order')
      .eq('course_id', courseId)
      .order('sort_order')
      .order('id'),
  ) as Array<{ id: number; name: string; sort_order: number }> | null

  return rows ?? []
}

async function listAttendanceDisplaySessionsForDate(courseId: number, targetDate: string) {
  const db = createServerClient()
  const { startIso, endIso } = getKstDateRange(targetDate)
  const rows = unwrapSupabaseResult(
    'attendance.displaySessionsForDate',
    await db
      .from('attendance_display_sessions')
      .select('id,subject_id,created_at,expires_at,revoked_at')
      .eq('course_id', courseId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false }),
  ) as Array<{
    id: number
    subject_id: number | null
    created_at: string
    expires_at: string
    revoked_at: string | null
  }> | null

  return rows ?? []
}

function normalizeAttendanceSeatNumber(value: string | null | undefined) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    return null
  }

  return /^-+$/.test(trimmed) ? null : trimmed
}

async function listEligibleSubjectSeatEnrollmentIds(subjectIds: number[]) {
  const uniqueSubjectIds = [...new Set(subjectIds.filter((subjectId) => Number.isInteger(subjectId) && subjectId > 0))]
  if (uniqueSubjectIds.length === 0) {
    return new Map<number, Set<number>>()
  }

  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.subjectSeatAssignments',
    await db
      .from('seat_assignments')
      .select('enrollment_id,subject_id,seat_number')
      .in('subject_id', uniqueSubjectIds),
  ) as Array<{
    enrollment_id: number
    subject_id: number
    seat_number: string | null
  }> | null

  const result = new Map<number, Set<number>>()
  for (const subjectId of uniqueSubjectIds) {
    result.set(subjectId, new Set<number>())
  }

  for (const row of rows ?? []) {
    const normalizedSeatNumber = normalizeAttendanceSeatNumber(row.seat_number)
    if (!normalizedSeatNumber) {
      continue
    }

    const subjectId = Number(row.subject_id)
    const enrollmentId = Number(row.enrollment_id)
    if (!result.has(subjectId)) {
      result.set(subjectId, new Set<number>())
    }

    result.get(subjectId)?.add(enrollmentId)
  }

  return result
}

function filterAttendanceEligibleEnrollments(params: {
  enrollments: Enrollment[]
  targetDate: string
  attendanceStartDate?: string | null
  allowedEnrollmentIds?: Set<number> | null
}) {
  return params.enrollments.filter((enrollment) => {
    if (!hasAttendanceStartedForDate(
      params.targetDate,
      getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
    )) {
      return false
    }

    if (!params.allowedEnrollmentIds) {
      return true
    }

    return params.allowedEnrollmentIds.has(enrollment.id)
  })
}

async function listAttendanceRecordsForCourse(
  courseId: number,
  options?: { attendedDate?: string; subjectId?: number | null },
) {
  const db = createServerClient()
  let query = db
    .from('attendance_records')
    .select('id,course_id,enrollment_id,display_session_id,subject_id,device_key_hash,attended_date,attended_at,created_at')
    .eq('course_id', courseId)
    .order('attended_at', { ascending: false })

  if (options?.attendedDate) {
    query = query.eq('attended_date', options.attendedDate)
  }

  if (options?.subjectId !== undefined) {
    query = options.subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', options.subjectId)
  }

  const rows = unwrapSupabaseResult(
    'attendance.records',
    await query,
  ) as Array<Record<string, unknown>> | null

  return (rows ?? []).map(mapAttendanceRecordRow)
}

async function getAttendanceRecordForToday(
  courseId: number,
  enrollmentId: number,
  subjectId?: number | null,
) {
  const db = createServerClient()
  let query = db
    .from('attendance_records')
    .select('id,course_id,enrollment_id,display_session_id,subject_id,device_key_hash,attended_date,attended_at,created_at')
    .eq('course_id', courseId)
    .eq('enrollment_id', enrollmentId)
    .eq('attended_date', getAttendanceTodayKey())

  if (subjectId !== undefined) {
    query = subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', subjectId)
  }

  const row = unwrapSupabaseResult(
    'attendance.recordForToday',
    await query
      .order('attended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceRecordRow(row) : null
}

async function listAttendanceSessionDates(
  courseId: number,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const db = createServerClient()
  let query = db
    .from('attendance_display_sessions')
    .select('created_at')
    .eq('course_id', courseId)
    .order('created_at')

  if (subjectId !== undefined) {
    query = subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', subjectId)
  }

  const rows = unwrapSupabaseResult(
    'attendance.sessionDates',
    await query,
  ) as Array<{ created_at: string }> | null

  return Array.from(new Set(
    (rows ?? [])
      .map((row) => getKstDateKey(row.created_at))
      .filter((sessionDate) => hasAttendanceStartedForDate(sessionDate, attendanceStartDate)),
  )).sort((left, right) => left.localeCompare(right))
}

async function getAttendanceAbsenceMetrics(
  courseId: number,
  enrollments: Array<Pick<Enrollment, 'id' | 'created_at'>>,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const result = new Map<number, {
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
  }>()
  for (const enrollment of enrollments) {
    result.set(enrollment.id, {
      consecutiveAbsences: 0,
      lastAttendedDate: null,
      attendanceStartDate: getEffectiveAttendanceStartDate(attendanceStartDate, enrollment.created_at),
    })
  }

  if (enrollments.length === 0) {
    return result
  }

  const db = createServerClient()
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id)
  const attendanceQuery = db
    .from('attendance_records')
    .select('enrollment_id,attended_date')
    .eq('course_id', courseId)
    .in('enrollment_id', enrollmentIds)
    .order('attended_date', { ascending: false })

  const filteredAttendanceQuery = subjectId === undefined
    ? attendanceQuery
    : subjectId == null
      ? attendanceQuery.is('subject_id', null)
      : attendanceQuery.eq('subject_id', subjectId)

  const [sessionDates, attendanceRowsResult] = await Promise.all([
    listAttendanceSessionDates(courseId, attendanceStartDate, subjectId),
    filteredAttendanceQuery,
  ])
  const attendanceRows = unwrapSupabaseResult(
    'attendance.absenceMetrics.records',
    attendanceRowsResult,
  ) as Array<{ enrollment_id: number; attended_date: string }> | null

  if (sessionDates.length === 0) {
    return result
  }

  const sessionDateSet = new Set(sessionDates)
  const enrollmentStartDateMap = new Map(
    enrollments.map((enrollment) => [
      enrollment.id,
      getEffectiveAttendanceStartDate(attendanceStartDate, enrollment.created_at),
    ]),
  )
  const attendanceDateMap = new Map<number, Set<string>>()
  for (const row of attendanceRows ?? []) {
    const enrollmentId = Number(row.enrollment_id)
    if (!attendanceDateMap.has(enrollmentId)) {
      attendanceDateMap.set(enrollmentId, new Set<string>())
    }

    if (sessionDateSet.has(row.attended_date)) {
      attendanceDateMap.get(enrollmentId)?.add(row.attended_date)
    }
  }

  for (const enrollment of enrollments) {
    const enrollmentId = enrollment.id
    const enrollmentAttendanceStartDate = enrollmentStartDateMap.get(enrollmentId) ?? null
    const relevantSessionDates = sessionDates.filter((sessionDate) => (
      hasAttendanceStartedForDate(sessionDate, enrollmentAttendanceStartDate)
    ))
    const attendedDates = attendanceDateMap.get(enrollmentId) ?? new Set<string>()
    const lastAttendedDate = [...relevantSessionDates]
      .reverse()
      .find((sessionDate) => attendedDates.has(sessionDate)) ?? null

    result.set(enrollmentId, {
      consecutiveAbsences: lastAttendedDate === null
        ? relevantSessionDates.length
        : relevantSessionDates.filter((sessionDate) => sessionDate > lastAttendedDate).length,
      lastAttendedDate,
      attendanceStartDate: enrollmentAttendanceStartDate,
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

export async function getActiveAttendanceDisplaySessionForCourse(courseId: number, subjectId?: number) {
  const db = createServerClient()
  let query = db
    .from('attendance_display_sessions')
    .select('*')
    .eq('course_id', courseId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (subjectId !== undefined) {
    query = query.eq('subject_id', subjectId)
  }

  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionByCourse',
    await query.maybeSingle(),
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

  if (!hasCourseAttendanceStarted(params.course)) {
    return {
      enabled: true,
      open: false,
      attended_today: false,
      attended_at: null,
    }
  }

  const activeDisplaySession = params.course.attendance_open
    ? await getActiveAttendanceDisplaySessionForCourse(params.course.id)
    : null
  const attendanceRecord = await getAttendanceRecordForToday(
    params.course.id,
    params.enrollmentId,
    activeDisplaySession
      ? activeDisplaySession.subject_id
      : undefined,
  )

  return {
    enabled: true,
    open: Boolean(params.course.attendance_open && activeDisplaySession),
    attended_today: Boolean(attendanceRecord),
    attended_at: attendanceRecord?.attended_at ?? null,
  }
}

export async function getConsecutiveAbsenceMap(
  courseId: number,
  enrollments: Array<Pick<Enrollment, 'id' | 'created_at'>>,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const result = new Map<number, number>()
  const metrics = await getAttendanceAbsenceMetrics(courseId, enrollments, attendanceStartDate, subjectId)
  for (const [enrollmentId, metric] of metrics.entries()) {
    result.set(enrollmentId, metric.consecutiveAbsences)
  }

  return result
}

export async function getAttendanceDashboardData(params: {
  courseId: number
  date?: string
  attendanceStartDate?: string | null
  subjectId?: number
}) {
  const targetDate = params.date ?? getAttendanceTodayKey()
  const todayKey = getAttendanceTodayKey()
  const [activeDisplaySession, dateDisplaySessions] = await Promise.all([
    targetDate === todayKey
      ? await getActiveAttendanceDisplaySessionForCourse(
        params.courseId,
        params.subjectId ?? undefined,
      )
      : Promise.resolve(null),
    listAttendanceDisplaySessionsForDate(params.courseId, targetDate),
  ])
  const subjectIdsForDate = [...new Set(
    dateDisplaySessions
      .map((session) => session.subject_id)
      .filter((subjectId): subjectId is number => subjectId != null),
  )]
  const inferredSubjectId = subjectIdsForDate.length === 1
    ? subjectIdsForDate[0]
    : undefined
  const effectiveSubjectId = params.subjectId ?? activeDisplaySession?.subject_id ?? inferredSubjectId
  const attendanceStarted = hasAttendanceStartedForDate(targetDate, params.attendanceStartDate)
  const [enrollments, records, seatLabelMap, subjects, subjectSeatEnrollmentIds] = await Promise.all([
    listActiveEnrollments(params.courseId),
    attendanceStarted
      ? listAttendanceRecordsForCourse(params.courseId, {
        attendedDate: targetDate,
        subjectId: effectiveSubjectId,
      })
      : Promise.resolve([] as AttendanceRecord[]),
    listSeatLabelsByEnrollment(params.courseId, effectiveSubjectId),
    listAttendanceSubjects(params.courseId),
    effectiveSubjectId
      ? listEligibleSubjectSeatEnrollmentIds([effectiveSubjectId])
      : Promise.resolve(new Map<number, Set<number>>()),
  ])

  const eligibleEnrollments = filterAttendanceEligibleEnrollments({
    enrollments,
    targetDate,
    attendanceStartDate: params.attendanceStartDate,
    allowedEnrollmentIds: effectiveSubjectId
      ? (subjectSeatEnrollmentIds.get(effectiveSubjectId) ?? new Set<number>())
      : null,
  })
  const eligibleEnrollmentIds = new Set(eligibleEnrollments.map((enrollment) => enrollment.id))
  const filteredRecords = records.filter((record) => eligibleEnrollmentIds.has(record.enrollment_id))
  const recordMap = new Map(filteredRecords.map((record) => [record.enrollment_id, record]))
  const enrollmentMap = new Map(eligibleEnrollments.map((enrollment) => [enrollment.id, enrollment]))
  const presentEnrollmentIds = new Set(filteredRecords.map((record) => record.enrollment_id))
  const absentEnrollments = attendanceStarted
    ? eligibleEnrollments.filter((enrollment) => !presentEnrollmentIds.has(enrollment.id))
    : []
  const consecutiveAbsenceMap = attendanceStarted
    ? await getConsecutiveAbsenceMap(
      params.courseId,
      absentEnrollments.map((enrollment) => ({
        id: enrollment.id,
        created_at: enrollment.created_at,
      })),
      params.attendanceStartDate,
      effectiveSubjectId,
    )
    : new Map<number, number>()

  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject.name]))
  const nowIso = new Date().toISOString()
  const checkedSubjectMap = new Map<string, {
    subjectId: number | null
    subjectName: string
    sessionCount: number
    latestStartedAt: string
    isActive: boolean
  }>()

  for (const session of dateDisplaySessions) {
    const key = session.subject_id == null ? 'none' : String(session.subject_id)
    const current = checkedSubjectMap.get(key)
    const subjectName = session.subject_id == null
      ? '과목 미지정'
      : subjectMap.get(session.subject_id) ?? `과목 #${session.subject_id}`
    const isActive = session.revoked_at == null && session.expires_at > nowIso

    if (!current) {
      checkedSubjectMap.set(key, {
        subjectId: session.subject_id,
        subjectName,
        sessionCount: 1,
        latestStartedAt: session.created_at,
        isActive,
      })
      continue
    }

    current.sessionCount += 1
    if (session.created_at > current.latestStartedAt) {
      current.latestStartedAt = session.created_at
    }
    current.isActive = current.isActive || isActive
  }

  return {
    date: targetDate,
    attendanceStarted,
    attendanceStartDate: params.attendanceStartDate ?? null,
    totalEnrolled: attendanceStarted ? eligibleEnrollments.length : 0,
    presentCount: filteredRecords.length,
    absentCount: attendanceStarted ? Math.max(eligibleEnrollments.length - filteredRecords.length, 0) : 0,
    attendanceRate: !attendanceStarted || eligibleEnrollments.length === 0
      ? 0
      : Number(((filteredRecords.length / eligibleEnrollments.length) * 100).toFixed(1)),
    absentees: absentEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        phone: enrollment.phone,
        consecutiveAbsences: consecutiveAbsenceMap.get(enrollment.id) ?? 0,
        attendanceStartDate: getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
      }))
      .sort((left, right) => (
        right.consecutiveAbsences - left.consecutiveAbsences
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      )),
    targets: eligibleEnrollments
      .map((enrollment) => {
        const record = recordMap.get(enrollment.id) ?? null
        const isPresent = Boolean(record)

        return {
          enrollmentId: enrollment.id,
          studentName: enrollment.name,
          examNumber: enrollment.exam_number,
          phone: enrollment.phone,
          seatLabel: seatLabelMap.get(enrollment.id) ?? null,
          status: isPresent ? 'present' : 'absent',
          attendedAt: record?.attended_at ?? null,
          consecutiveAbsences: isPresent ? 0 : (consecutiveAbsenceMap.get(enrollment.id) ?? 0),
          attendanceStartDate: getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
        }
      })
      .sort((left, right) => (
        Number(left.status === 'present') - Number(right.status === 'present')
        || right.consecutiveAbsences - left.consecutiveAbsences
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      )),
    recentRecords: filteredRecords
      .map((record) => {
        const enrollment = enrollmentMap.get(record.enrollment_id)
        if (!enrollment) {
          return null
        }

        return {
          enrollmentId: record.enrollment_id,
          studentName: enrollment.name,
          examNumber: enrollment.exam_number,
          phone: enrollment.phone,
          seatLabel: seatLabelMap.get(record.enrollment_id) ?? null,
          attendedAt: record.attended_at,
        }
      })
      .filter((value): value is {
        enrollmentId: number
        studentName: string
        examNumber: string | null
        phone: string
        seatLabel: string | null
        attendedAt: string
      } => Boolean(value)),
    checkedSubjects: [...checkedSubjectMap.values()].sort((left, right) => (
      right.latestStartedAt.localeCompare(left.latestStartedAt)
      || left.subjectName.localeCompare(right.subjectName, 'ko-KR')
    )),
    displaySession: {
      id: activeDisplaySession?.id ?? null,
      isActive: Boolean(activeDisplaySession),
      expiresAt: activeDisplaySession?.expires_at ?? null,
      subjectId: effectiveSubjectId ?? null,
      subjectName: effectiveSubjectId != null
        ? subjectMap.get(effectiveSubjectId) ?? null
        : null,
    },
  }
}

export async function getAttendanceAbsenceReport(params: {
  courseId: number
  threshold: number
  attendanceStartDate?: string | null
  subjectId?: number | null
}) {
  const attendanceStarted = hasAttendanceStartedForDate(getAttendanceTodayKey(), params.attendanceStartDate)
  if (!attendanceStarted) {
    return {
      threshold: params.threshold,
      flaggedStudents: [],
    }
  }

  const todayKey = getAttendanceTodayKey()
  const [activeDisplaySession, dateDisplaySessions] = await Promise.all([
    params.subjectId === undefined
      ? getActiveAttendanceDisplaySessionForCourse(params.courseId)
      : Promise.resolve(null),
    listAttendanceDisplaySessionsForDate(params.courseId, todayKey),
  ])
  const subjectIdsForDate = [...new Set(
    dateDisplaySessions
      .map((session) => session.subject_id)
      .filter((subjectId): subjectId is number => subjectId != null),
  )]
  const inferredSubjectId = subjectIdsForDate.length === 1
    ? subjectIdsForDate[0]
    : undefined
  const effectiveSubjectId = params.subjectId ?? activeDisplaySession?.subject_id ?? inferredSubjectId

  const [enrollments, seatLabelMap, subjects] = await Promise.all([
    listActiveEnrollments(params.courseId),
    listSeatLabelsByEnrollment(params.courseId, effectiveSubjectId),
    listAttendanceSubjects(params.courseId),
  ])
  const baseEligibleEnrollments = filterAttendanceEligibleEnrollments({
    enrollments,
    targetDate: getAttendanceTodayKey(),
    attendanceStartDate: params.attendanceStartDate,
    allowedEnrollmentIds: null,
  })
  const eligibleSubjectIds = effectiveSubjectId != null
    ? [effectiveSubjectId]
    : subjects.map((subject) => subject.id)
  const subjectSeatEnrollmentIds = await listEligibleSubjectSeatEnrollmentIds(eligibleSubjectIds)

  let flaggedStudents: Array<{
    enrollmentId: number
    studentName: string
    examNumber: string | null
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
    seatLabel: string | null
    subjectId: number | null
    subjectName: string | null
  }> = []

  if (effectiveSubjectId !== undefined) {
    const targetSubject = effectiveSubjectId == null
      ? null
      : subjects.find((subject) => subject.id === effectiveSubjectId) ?? null
    const eligibleEnrollments = targetSubject
      ? filterAttendanceEligibleEnrollments({
        enrollments: baseEligibleEnrollments,
        targetDate: getAttendanceTodayKey(),
        attendanceStartDate: params.attendanceStartDate,
        allowedEnrollmentIds: subjectSeatEnrollmentIds.get(targetSubject.id) ?? new Set<number>(),
      })
      : baseEligibleEnrollments
    const enrollmentMetricTargets = eligibleEnrollments.map((enrollment) => ({
      id: enrollment.id,
      created_at: enrollment.created_at,
    }))
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
      effectiveSubjectId,
    )

    flaggedStudents = eligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: absenceMetrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: absenceMetrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: absenceMetrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: targetSubject?.id ?? null,
        subjectName: targetSubject?.name ?? null,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold)
  } else if (subjects.length > 0) {
    const perSubjectMetrics = await Promise.all(subjects.map(async (subject) => ({
      subject,
      eligibleEnrollments: filterAttendanceEligibleEnrollments({
        enrollments: baseEligibleEnrollments,
        targetDate: getAttendanceTodayKey(),
        attendanceStartDate: params.attendanceStartDate,
        allowedEnrollmentIds: subjectSeatEnrollmentIds.get(subject.id) ?? new Set<number>(),
      }),
      metrics: await getAttendanceAbsenceMetrics(
        params.courseId,
        filterAttendanceEligibleEnrollments({
          enrollments: baseEligibleEnrollments,
          targetDate: getAttendanceTodayKey(),
          attendanceStartDate: params.attendanceStartDate,
          allowedEnrollmentIds: subjectSeatEnrollmentIds.get(subject.id) ?? new Set<number>(),
        }).map((enrollment) => ({
          id: enrollment.id,
          created_at: enrollment.created_at,
        })),
        params.attendanceStartDate,
        subject.id,
      ),
    })))

    flaggedStudents = perSubjectMetrics.flatMap(({ subject, metrics, eligibleEnrollments }) => eligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: metrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: metrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: metrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: subject.id,
        subjectName: subject.name,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold))
  } else {
    const enrollmentMetricTargets = baseEligibleEnrollments.map((enrollment) => ({
      id: enrollment.id,
      created_at: enrollment.created_at,
    }))
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
    )

    flaggedStudents = baseEligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: absenceMetrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: absenceMetrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: absenceMetrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: null,
        subjectName: null,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold)
  }

  flaggedStudents.sort((left, right) => (
    right.consecutiveAbsences - left.consecutiveAbsences
    || (left.subjectName ?? '').localeCompare(right.subjectName ?? '', 'ko-KR')
    || left.studentName.localeCompare(right.studentName, 'ko-KR')
  ))

  return {
    threshold: params.threshold,
    flaggedStudents,
  }
}

export async function hasValidSeatAssignmentForSubject(params: {
  enrollmentId: number
  subjectId: number
}) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.subjectSeatAssignment',
    await db
      .from('seat_assignments')
      .select('seat_number')
      .eq('enrollment_id', params.enrollmentId)
      .eq('subject_id', params.subjectId)
      .maybeSingle(),
  ) as { seat_number?: string | null } | null

  return Boolean(normalizeAttendanceSeatNumber(row?.seat_number ?? null))
}
