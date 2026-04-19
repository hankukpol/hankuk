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

async function getAttendanceRecordForToday(courseId: number, enrollmentId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.recordForToday',
    await db
      .from('attendance_records')
      .select('id,course_id,enrollment_id,display_session_id,subject_id,device_key_hash,attended_date,attended_at,created_at')
      .eq('course_id', courseId)
      .eq('enrollment_id', enrollmentId)
      .eq('attended_date', getAttendanceTodayKey())
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

  if (!hasCourseAttendanceStarted(params.course)) {
    return {
      enabled: true,
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
}) {
  const targetDate = params.date ?? getAttendanceTodayKey()
  const attendanceStarted = hasAttendanceStartedForDate(targetDate, params.attendanceStartDate)
  const [enrollments, records, activeDisplaySession, seatLabelMap, subjects] = await Promise.all([
    listActiveEnrollments(params.courseId),
    attendanceStarted
      ? listAttendanceRecordsForCourse(params.courseId, { attendedDate: targetDate })
      : Promise.resolve([] as AttendanceRecord[]),
    getActiveAttendanceDisplaySessionForCourse(params.courseId),
    listSeatLabelsByEnrollment(params.courseId),
    listAttendanceSubjects(params.courseId),
  ])

  const eligibleEnrollments = enrollments.filter((enrollment) => (
    hasAttendanceStartedForDate(
      targetDate,
      getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
    )
  ))
  const eligibleEnrollmentIds = new Set(eligibleEnrollments.map((enrollment) => enrollment.id))
  const filteredRecords = records.filter((record) => eligibleEnrollmentIds.has(record.enrollment_id))
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
    )
    : new Map<number, number>()

  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject.name]))

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
          attendedAt: record.attended_at,
        }
      })
      .filter((value): value is {
        enrollmentId: number
        studentName: string
        examNumber: string | null
        phone: string
        attendedAt: string
      } => Boolean(value)),
    displaySession: {
      id: activeDisplaySession?.id ?? null,
      isActive: Boolean(activeDisplaySession),
      expiresAt: activeDisplaySession?.expires_at ?? null,
      subjectId: activeDisplaySession?.subject_id ?? null,
      subjectName: activeDisplaySession?.subject_id != null
        ? subjectMap.get(activeDisplaySession.subject_id) ?? null
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

  const [enrollments, seatLabelMap, subjects] = await Promise.all([
    listActiveEnrollments(params.courseId),
    listSeatLabelsByEnrollment(params.courseId),
    listAttendanceSubjects(params.courseId),
  ])
  const eligibleEnrollments = enrollments.filter((enrollment) => (
    hasAttendanceStartedForDate(
      getAttendanceTodayKey(),
      getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
    )
  ))
  const enrollmentMetricTargets = eligibleEnrollments.map((enrollment) => ({
    id: enrollment.id,
    created_at: enrollment.created_at,
  }))

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

  if (params.subjectId !== undefined) {
    const targetSubject = params.subjectId == null
      ? null
      : subjects.find((subject) => subject.id === params.subjectId) ?? null
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
      params.subjectId,
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
      metrics: await getAttendanceAbsenceMetrics(
        params.courseId,
        enrollmentMetricTargets,
        params.attendanceStartDate,
        subject.id,
      ),
    })))

    flaggedStudents = perSubjectMetrics.flatMap(({ subject, metrics }) => eligibleEnrollments
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
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
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
