import { getAppConfig } from '@/lib/app-config'
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

export async function listCoursesByDivision(
  division: TenantType,
  options?: { activeOnly?: boolean },
): Promise<Course[]> {
  const db = createServerClient()
  let query = db
    .from('courses')
    .select('*')
    .eq('division', division)
    .order('sort_order')
    .order('created_at', { ascending: false })

  if (options?.activeOnly) {
    query = query.eq('status', 'active')
  }

  const data = unwrapSupabaseResult('listCoursesByDivision', await query)
  return (data ?? []) as Course[]
}

export async function getCourseById(id: number, division: TenantType): Promise<Course | null> {
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
}

export async function getCourseBySlug(slug: string, division: TenantType): Promise<Course | null> {
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
}

export async function verifyCourseOwnership(courseId: number, division: TenantType): Promise<boolean> {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'verifyCourseOwnership',
    await db
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('division', division)
      .maybeSingle(),
  )

  return Boolean(data)
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
}

export async function listCourseEnrollments(
  courseId: number,
  options?: { limit?: number; offset?: number; columns?: string },
): Promise<Enrollment[]> {
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

export async function listMaterialsForCourse(
  courseId: number,
  options?: { activeOnly?: boolean },
): Promise<Material[]> {
  const db = createServerClient()
  let query = db
    .from('materials')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order')
    .order('id')

  if (options?.activeOnly) {
    query = query.eq('is_active', true)
  }

  const data = unwrapSupabaseResult('listMaterialsForCourse', await query)
  return (data ?? []) as Material[]
}

export async function listSeatAssignmentsForCourse(courseId: number): Promise<SeatAssignment[]> {
  const db = createServerClient()
  const subjects = await listCourseSubjects(courseId)
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

      const seatCompare = seatNumberCollator.compare(left.seat_number, right.seat_number)
      if (seatCompare !== 0) {
        return seatCompare
      }

      return left.enrollment_id - right.enrollment_id
    })
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
  const students = unwrapSupabaseResult(
    'listStudentCourses.students',
    await db
      .from('students')
      .select('id,name')
      .eq('division', division)
      .eq('phone', normalizedPhone),
  )

  const matchedStudentIds = ((students ?? []) as Array<Pick<Student, 'id' | 'name'>>)
    .filter((row) => normalizeName(row.name) === normalizedName)
    .map((row) => row.id)

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
        .select('id,course_id,status,name')
        .eq('phone', normalizedPhone)
        .eq('status', 'active'),
    )

    enrollmentRows = ((enrollments ?? []) as Array<
      Pick<Enrollment, 'id' | 'course_id' | 'status'> & { name?: string | null }
    >).filter((row) => normalizeName(row.name ?? '') === normalizedName)
  }

  const courseIds = enrollmentRows.map((row) => row.course_id)

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
  const courses = unwrapSupabaseResult(
    'listStudentCourses.courses',
    await db
      .from('courses')
      .select(
        'id,name,slug,course_type,theme_color,feature_qr_pass,feature_qr_distribution,feature_seat_assignment,feature_designated_seat,feature_time_window,feature_dday,feature_exam_delivery_mode,feature_weekday_color,feature_anti_forgery_motion,status,division',
      )
      .in('id', courseIds)
      .eq('division', division)
      .eq('status', 'active')
      .order('sort_order')
      .order('id'),
  )

  const orderedCourses = (courses ?? []) as Course[]
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

  return enrollmentRows
    .map((enrollment) => {
      const course = courseMap.get(enrollment.course_id)
      if (!course) {
        return null
      }

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
          feature_time_window: course.feature_time_window,
          feature_dday: course.feature_dday,
          feature_exam_delivery_mode: course.feature_exam_delivery_mode,
          feature_weekday_color: course.feature_weekday_color,
          feature_anti_forgery_motion: course.feature_anti_forgery_motion,
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

  const [subjects, seatAssignments, designatedSeat, materials, receiptRows, appConfig] = await Promise.all([
    listCourseSubjects(course.id),
    listSeatAssignmentsForEnrollment(mergedEnrollment.id),
    getDesignatedSeatStudentState({
      course,
      enrollmentId: mergedEnrollment.id,
      deviceKeyHash: params.deviceKeyHash ?? null,
    }),
    listMaterialsForCourse(course.id, { activeOnly: true }),
    getReceiptRows(mergedEnrollment.id),
    getAppConfig(),
  ])

  return {
    appConfig,
    course,
    enrollment: mergedEnrollment,
    subjects,
    seatAssignments,
    designatedSeat,
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
