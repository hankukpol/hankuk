import { unstable_cache } from 'next/cache'
import { getAppConfig } from '@/lib/app-config'
import { getAttendanceStudentState } from '@/lib/attendance/service'
import { toReceiptMap } from '@/lib/bulk'
import { getDesignatedSeatStudentState } from '@/lib/designated-seat/service'
import { generateQrToken } from '@/lib/qr/token'
import { mergeEnrollmentStudentSnapshot } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import type {
  Course,
  CourseSubject,
  Enrollment,
  Material,
  PassCourseSummary,
  PassPayload,
  SeatAssignment,
  Student,
} from '@/types/database'
import type { TenantType } from '@/lib/tenant'
import { normalizeName, normalizePhone } from '@/lib/utils'

type EnrollmentWithStudentRow = Enrollment & { students?: Student | null }

const getCachedCoursesByDivision = unstable_cache(
  async (division: TenantType, activeOnly: boolean) => {
    const db = createServerClient()
    let query = db
      .from('courses')
      .select('*')
      .eq('division', division)
      .order('sort_order')
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('status', 'active')
    }

    const data = unwrapSupabaseResult('listCoursesByDivision', await query)
    return (data ?? []) as Course[]
  },
  ['courses-by-division'],
  {
    revalidate: 15,
    tags: ['courses'],
  },
)

const getCachedCourseById = unstable_cache(
  async (id: number, division: TenantType) => {
    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'getCourseById',
      await db
        .from('courses')
        .select('*')
        .eq('id', id)
        .eq('division', division)
        .maybeSingle(),
    )

    return (data as Course | null) ?? null
  },
  ['course-by-id'],
  {
    revalidate: 15,
    tags: ['courses'],
  },
)

const getCachedCourseBySlug = unstable_cache(
  async (slug: string, division: TenantType) => {
    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'getCourseBySlug',
      await db
        .from('courses')
        .select('*')
        .eq('slug', slug)
        .eq('division', division)
        .eq('status', 'active')
        .maybeSingle(),
    )

    return (data as Course | null) ?? null
  },
  ['course-by-slug'],
  {
    revalidate: 15,
    tags: ['courses'],
  },
)

const getCachedCourseSubjects = unstable_cache(
  async (courseId: number) => {
    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'listCourseSubjects',
      await db
        .from('course_subjects')
        .select('*')
        .eq('course_id', courseId)
        .order('sort_order')
        .order('id'),
    )

    return (data ?? []) as CourseSubject[]
  },
  ['course-subjects'],
  {
    revalidate: 15,
    tags: ['seats'],
  },
)

const getCachedCourseEnrollments = unstable_cache(
  async (courseId: number) => {
    const db = createServerClient()
    const joinedRows = unwrapSupabaseResult(
      'listCourseEnrollments.withStudents',
      await db
        .from('enrollments')
        .select('*,students(*)')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false }),
    ) as EnrollmentWithStudentRow[] | null

    return (joinedRows ?? []).map((row) => mergeEnrollmentStudentSnapshot(row))
  },
  ['course-enrollments'],
  {
    revalidate: 10,
    tags: ['enrollments'],
  },
)

const getCachedMaterialsForCourse = unstable_cache(
  async (courseId: number, activeOnly: boolean) => {
    const db = createServerClient()
    let query = db
      .from('materials')
      .select('*')
      .eq('course_id', courseId)
      .order('sort_order')
      .order('id')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const data = unwrapSupabaseResult('listMaterialsForCourse', await query)
    return (data ?? []) as Material[]
  },
  ['materials-for-course'],
  {
    revalidate: 15,
    tags: ['materials'],
  },
)

const getCachedSeatAssignmentsForCourse = unstable_cache(
  async (courseId: number) => {
    const db = createServerClient()
    const subjects = await getCachedCourseSubjects(courseId)
    const subjectIds = subjects.map((subject) => subject.id)

    if (subjectIds.length === 0) {
      return []
    }

    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]))
    const seatNumberCollator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })
    const data = unwrapSupabaseResult(
      'listSeatAssignmentsForCourse',
      await db
        .from('seat_assignments')
        .select('*')
        .in('subject_id', subjectIds)
        .order('enrollment_id'),
    )

    return ((data ?? []) as SeatAssignment[])
      .map((assignment) => ({
        ...assignment,
        course_subjects: subjectMap.get(assignment.subject_id),
      }))
      .sort((left, right) => {
        const leftSubject = subjectMap.get(left.subject_id)
        const rightSubject = subjectMap.get(right.subject_id)
        const leftSort = leftSubject?.sort_order ?? Number.MAX_SAFE_INTEGER
        const rightSort = rightSubject?.sort_order ?? Number.MAX_SAFE_INTEGER

        if (leftSort !== rightSort) {
          return leftSort - rightSort
        }

        const seatCompare = seatNumberCollator.compare(left.seat_number ?? '', right.seat_number ?? '')
        if (seatCompare !== 0) {
          return seatCompare
        }

        return left.id - right.id
      })
  },
  ['seat-assignments-for-course'],
  {
    revalidate: 15,
    tags: ['seats'],
  },
)

export async function listCoursesByDivision(
  division: TenantType,
  options?: { activeOnly?: boolean },
): Promise<Course[]> {
  return getCachedCoursesByDivision(division, Boolean(options?.activeOnly))
}

export async function getCourseById(id: number, division: TenantType): Promise<Course | null> {
  return getCachedCourseById(id, division)
}

export async function getCourseBySlug(slug: string, division: TenantType): Promise<Course | null> {
  return getCachedCourseBySlug(slug, division)
}

export async function verifyCourseOwnership(courseId: number, division: TenantType): Promise<boolean> {
  return Boolean(await getCachedCourseById(courseId, division))
}

export async function verifyEnrollmentOwnership(
  enrollmentId: number,
  division: TenantType,
): Promise<{ valid: boolean; courseId: number | null }> {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'verifyEnrollmentOwnership',
    await db
      .from('enrollments')
      .select('course_id,courses!inner(id)')
      .eq('id', enrollmentId)
      .eq('courses.division', division)
      .maybeSingle(),
  ) as { course_id: number } | null

  if (!data) {
    return { valid: false, courseId: null }
  }

  return { valid: true, courseId: data.course_id }
}

export async function verifyMaterialOwnership(
  materialId: number,
  division: TenantType,
): Promise<boolean> {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'verifyMaterialOwnership',
    await db
      .from('materials')
      .select('id,courses!inner(id)')
      .eq('id', materialId)
      .eq('courses.division', division)
      .maybeSingle(),
  )

  return Boolean(data)
}

export async function listCourseSubjects(courseId: number): Promise<CourseSubject[]> {
  return getCachedCourseSubjects(courseId)
}

export async function listCourseEnrollments(
  courseId: number,
  options?: { limit?: number; offset?: number; columns?: string },
): Promise<Enrollment[]> {
  if (options?.columns || options?.limit !== undefined || options?.offset !== undefined) {
    const db = createServerClient()
    if (options?.columns) {
      let query = db
        .from('enrollments')
        .select(options.columns)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })

      if (options.limit) {
        const offset = options.offset ?? 0
        query = query.range(offset, offset + options.limit - 1)
      }

      const data = unwrapSupabaseResult('listCourseEnrollments', await query)
      return ((data ?? []) as unknown) as Enrollment[]
    }

    const joinedRows = unwrapSupabaseResult(
      'listCourseEnrollments.withStudents',
      await (() => {
        let query = db
          .from('enrollments')
          .select('*,students(*)')
          .eq('course_id', courseId)
          .order('created_at', { ascending: false })

        if (options?.limit) {
          const offset = options.offset ?? 0
          query = query.range(offset, offset + options.limit - 1)
        }

        return query
      })(),
    ) as EnrollmentWithStudentRow[] | null

    return (joinedRows ?? []).map((row) => mergeEnrollmentStudentSnapshot(row))
  }

  return getCachedCourseEnrollments(courseId)
}

export async function listMaterialsForCourse(
  courseId: number,
  options?: { activeOnly?: boolean },
): Promise<Material[]> {
  return getCachedMaterialsForCourse(courseId, Boolean(options?.activeOnly))
}

export async function listSeatAssignmentsForCourse(courseId: number): Promise<SeatAssignment[]> {
  return getCachedSeatAssignmentsForCourse(courseId)
}

export async function listSeatAssignmentsForEnrollment(
  enrollmentId: number,
): Promise<SeatAssignment[]> {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'listSeatAssignmentsForEnrollment',
    await db
      .from('seat_assignments')
      .select('*,course_subjects(id,name,sort_order)')
      .eq('enrollment_id', enrollmentId),
  )

  return ((data ?? []) as SeatAssignment[])
    .filter((assignment) => {
      const subject = assignment.course_subjects as unknown as CourseSubject | null
      return subject !== null
    })
    .sort((left, right) => {
      const leftSubject = left.course_subjects as unknown as CourseSubject
      const rightSubject = right.course_subjects as unknown as CourseSubject
      const leftSort = leftSubject?.sort_order ?? Number.MAX_SAFE_INTEGER
      const rightSort = rightSubject?.sort_order ?? Number.MAX_SAFE_INTEGER

      if (leftSort !== rightSort) {
        return leftSort - rightSort
      }

      return left.subject_id - right.subject_id
    })
}

export async function getReceiptRows(enrollmentId: number) {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'getReceiptRows',
    await db
      .from('distribution_logs')
      .select('material_id,distributed_at')
      .eq('enrollment_id', enrollmentId),
  )

  return data as Array<{ material_id: number; distributed_at: string }> | null
}

export async function listStudentCourses(
  division: TenantType,
  name: string,
  phone: string,
): Promise<PassCourseSummary[]> {
  const db = createServerClient()
  const normalizedName = normalizeName(name)
  const normalizedPhone = normalizePhone(phone)
  const exactStudentRows = unwrapSupabaseResult(
    'listStudentCourses.studentsExact',
    await db
      .from('students')
      .select('id,name')
      .eq('division', division)
      .eq('phone', normalizedPhone)
      .eq('name', normalizedName)
      .order('updated_at', { ascending: false })
      .limit(20),
  ) as Array<Pick<Student, 'id' | 'name'>> | null

  let matchedStudentIds = (exactStudentRows ?? []).map((row) => row.id)

  if (matchedStudentIds.length === 0) {
    const phoneCandidateRows = unwrapSupabaseResult(
      'listStudentCourses.studentsByPhoneLimited',
      await db
        .from('students')
        .select('id,name')
        .eq('division', division)
        .eq('phone', normalizedPhone)
        .order('updated_at', { ascending: false })
        .order('id')
        .limit(2),
    ) as Array<Pick<Student, 'id' | 'name'>> | null

    const matchedByName = (phoneCandidateRows ?? [])
      .filter((row) => normalizeName(row.name) === normalizedName)
      .map((row) => row.id)

    matchedStudentIds = matchedByName.length > 0
      ? matchedByName
      : (phoneCandidateRows?.length === 1 ? [phoneCandidateRows[0].id] : [])
  }

  let enrollmentRows: Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>> = []

  if (matchedStudentIds.length > 0) {
    const enrollments = unwrapSupabaseResult(
      'listStudentCourses.enrollmentsByStudent',
      await db
        .from('enrollments')
        .select('id,course_id,status')
        .in('student_id', matchedStudentIds)
        .eq('status', 'active'),
    )

    enrollmentRows = (enrollments ?? []) as Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>>
  } else {
    const enrollments = unwrapSupabaseResult(
      'listStudentCourses.enrollmentsFallback',
      await db
        .from('enrollments')
        .select('id,course_id,status')
        .eq('name', normalizedName)
        .eq('phone', normalizedPhone)
        .eq('status', 'active'),
    )

    enrollmentRows = (enrollments ?? []) as Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>>
  }

  const courseIds = Array.from(new Set(enrollmentRows.map((row) => row.course_id)))

  if (courseIds.length === 0) {
    return []
  }

  return buildPassCourseSummaries(division, enrollmentRows, courseIds)
}

export async function listStudentCoursesForStudent(
  division: TenantType,
  studentId: number,
): Promise<PassCourseSummary[]> {
  const db = createServerClient()
  const enrollments = unwrapSupabaseResult(
    'listStudentCoursesForStudent.enrollments',
    await db
      .from('enrollments')
      .select('id,course_id,status')
      .eq('student_id', studentId)
      .eq('status', 'active'),
  )

  const enrollmentRows = (enrollments ?? []) as Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>>
  const courseIds = enrollmentRows.map((row) => row.course_id)

  if (courseIds.length === 0) {
    return []
  }

  return buildPassCourseSummaries(division, enrollmentRows, courseIds)
}

async function buildPassCourseSummaries(
  division: TenantType,
  enrollmentRows: Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>>,
  courseIds: number[],
): Promise<PassCourseSummary[]> {
  const db = createServerClient()
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const appConfig = await getAppConfig()
  const attendanceEnabled = appConfig.attendance_enabled
  const courses = unwrapSupabaseResult(
    'listStudentCourses.courses',
    await db
      .from('courses')
      .select('*')
      .in('id', courseIds)
      .eq('division', division)
      .eq('status', 'active')
      .order('sort_order')
      .order('id'),
  )

  const orderedCourses = (courses ?? []) as Course[]
  const attendanceCourseIds = orderedCourses
    .filter((course) => Boolean(attendanceEnabled && course.feature_attendance))
    .map((course) => course.id)
  const enrollmentIds = enrollmentRows.map((row) => row.id)
  const [attendanceRows, activeAttendanceSessions] = await Promise.all([
    attendanceCourseIds.length === 0
      ? Promise.resolve([] as Array<{ course_id: number; enrollment_id: number; attended_at: string }>)
      : (async () => {
        const rows = unwrapSupabaseResult(
          'listStudentCourses.attendanceRows',
          await db
            .from('attendance_records')
            .select('course_id,enrollment_id,attended_at')
            .in('course_id', attendanceCourseIds)
            .in('enrollment_id', enrollmentIds)
            .eq('attended_date', todayKey),
        ) as Array<{ course_id: number; enrollment_id: number; attended_at: string }> | null

        return rows ?? []
      })(),
    attendanceCourseIds.length === 0
      ? Promise.resolve(new Set<number>())
      : (async () => {
        const rows = unwrapSupabaseResult(
          'listStudentCourses.activeAttendanceSessions',
          await db
            .from('attendance_display_sessions')
            .select('course_id')
            .in('course_id', attendanceCourseIds)
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString()),
        ) as Array<{ course_id: number }> | null

        return new Set((rows ?? []).map((row) => Number(row.course_id)))
      })(),
  ])
  const courseMap = new Map(orderedCourses.map((course) => [course.id, course]))
  const courseOrderMap = new Map(
    orderedCourses.map((course, index) => [
      course.id,
      {
        sortOrder: course.sort_order,
        index,
      },
    ]),
  )
  const attendanceRecordMap = new Map(
    attendanceRows.map((row) => [`${row.course_id}:${row.enrollment_id}`, row]),
  )

  return enrollmentRows
    .map((enrollment) => {
      const course = courseMap.get(enrollment.course_id)
      if (!course) {
        return null
      }

      const attendanceRecord = attendanceRecordMap.get(`${course.id}:${enrollment.id}`)

      return {
        enrollment_id: enrollment.id,
        course: {
          id: course.id,
          name: course.name,
          slug: course.slug,
          course_type: course.course_type,
          theme_color: course.theme_color,
          feature_qr_pass: course.feature_qr_pass,
          feature_qr_distribution: course.feature_qr_distribution,
          feature_seat_assignment: course.feature_seat_assignment,
          feature_designated_seat: course.feature_designated_seat,
          feature_attendance: Boolean(course.feature_attendance),
          feature_time_window: course.feature_time_window,
          feature_dday: course.feature_dday,
          feature_exam_delivery_mode: course.feature_exam_delivery_mode,
          feature_weekday_color: course.feature_weekday_color,
          feature_anti_forgery_motion: course.feature_anti_forgery_motion,
        },
        attendance: {
          enabled: Boolean(attendanceEnabled && course.feature_attendance),
          open: Boolean(attendanceEnabled && course.feature_attendance && course.attendance_open && activeAttendanceSessions.has(course.id)),
          attended_today: Boolean(attendanceRecord),
          attended_at: attendanceRecord?.attended_at ?? null,
        },
      }
    })
    .filter((value): value is PassCourseSummary => Boolean(value))
    .sort((left, right) => {
      const leftOrder = courseOrderMap.get(left.course.id)
      const rightOrder = courseOrderMap.get(right.course.id)
      const leftSort = leftOrder?.sortOrder ?? Number.MAX_SAFE_INTEGER
      const rightSort = rightOrder?.sortOrder ?? Number.MAX_SAFE_INTEGER

      if (leftSort !== rightSort) {
        return leftSort - rightSort
      }

      const leftIndex = leftOrder?.index ?? Number.MAX_SAFE_INTEGER
      const rightIndex = rightOrder?.index ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }

      return left.enrollment_id - right.enrollment_id
    })
}

export async function buildPassPayload(params: {
  division: TenantType
  enrollmentId: number
  courseSlug: string
  name: string
  phone: string
  deviceKeyHash?: string | null
}): Promise<PassPayload | null> {
  const db = createServerClient()
  const normalizedPhone = normalizePhone(params.phone)

  const enrollment = unwrapSupabaseResult(
    'buildPassPayload.enrollment',
    await db
      .from('enrollments')
      .select('*,students(*)')
      .eq('id', params.enrollmentId)
      .maybeSingle(),
  ) as EnrollmentWithStudentRow | null

  if (!enrollment) {
    return null
  }

  const mergedEnrollment = mergeEnrollmentStudentSnapshot(enrollment)

  const course = await getCourseById(mergedEnrollment.course_id, params.division)
  if (!course || course.status !== 'active') {
    return null
  }

  if (normalizePhone(mergedEnrollment.phone) !== normalizedPhone) {
    return null
  }

  const [subjects, seatAssignments, designatedSeat, attendance, materials, receiptRows, appConfig] = await Promise.all([
    listCourseSubjects(course.id),
    listSeatAssignmentsForEnrollment(mergedEnrollment.id),
    getDesignatedSeatStudentState({
      course,
      enrollmentId: mergedEnrollment.id,
      deviceKeyHash: params.deviceKeyHash ?? null,
    }),
    getAttendanceStudentState({
      course,
      enrollmentId: mergedEnrollment.id,
    }),
    listMaterialsForCourse(course.id, { activeOnly: true }),
    getReceiptRows(mergedEnrollment.id),
    getAppConfig(),
  ])

  const effectiveAttendance = appConfig.attendance_enabled
    ? attendance
    : {
      enabled: false,
      open: false,
      attended_today: false,
      attended_at: null,
    }

  return {
    appConfig,
    course,
    enrollment: mergedEnrollment,
    subjects,
    seatAssignments,
    designatedSeat,
    attendance: effectiveAttendance,
    materials,
    receipts: toReceiptMap(receiptRows),
    qrToken: course.feature_qr_pass && mergedEnrollment.status === 'active'
      ? await generateQrToken(mergedEnrollment.id, course.id)
      : '',
  }
}

export async function findEnrollmentForQuickDistribution(courseId: number, phone: string) {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'findEnrollmentForQuickDistribution',
    await db
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('phone', normalizePhone(phone))
      .eq('status', 'active')
      .maybeSingle(),
  )

  return (data as Enrollment | null) ?? null
}
