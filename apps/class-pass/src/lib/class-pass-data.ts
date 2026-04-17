import { unstable_cache } from 'next/cache'
import { getAppConfig } from '@/lib/app-config'
import { getAttendanceStudentState } from '@/lib/attendance/service'
import {
  buildPassCourseSummaries,
  buildPassPayloadResult,
  isPassRequestMatch,
} from '@/lib/class-pass-data-pass'
import { getDesignatedSeatStudentState } from '@/lib/designated-seat/service'
import { mergeEnrollmentStudentSnapshot } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import type {
  Course,
  CourseSubject,
  Enrollment,
  Material,
  MaterialType,
  PassCourseSummary,
  PassPayload,
  SeatAssignment,
  Student,
  TextbookAssignment,
} from '@/types/database'
import type { TenantType } from '@/lib/tenant'
import { normalizeName, normalizePhone } from '@/lib/utils'

type EnrollmentWithStudentRow = Enrollment & { students?: Student | null }
type MaterialQueryOptions = { activeOnly?: boolean; materialType?: MaterialType }
type MaterialSnapshot = Pick<Material, 'id' | 'course_id' | 'material_type'>

function createTextbookAssignmentError(code: string) {
  return new Error(`TEXTBOOK_ASSIGNMENT:${code}`)
}

export function isTextbookAssignmentError(error: unknown, code: string) {
  return error instanceof Error && error.message === `TEXTBOOK_ASSIGNMENT:${code}`
}

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
  async (courseId: number, activeOnly: boolean, materialType: MaterialType | null) => {
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

    if (materialType) {
      query = query.eq('material_type', materialType)
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

const getCachedTextbookAssignments = unstable_cache(
  async (enrollmentId: number) => {
    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'getTextbookAssignments',
      await db
        .from('textbook_assignments')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .order('assigned_at')
        .order('id'),
    )

    return (data ?? []) as TextbookAssignment[]
  },
  ['textbook-assignments-by-enrollment'],
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
  options?: MaterialQueryOptions,
): Promise<Material[]> {
  return getCachedMaterialsForCourse(
    courseId,
    Boolean(options?.activeOnly),
    options?.materialType ?? null,
  )
}

async function getEnrollmentCourseSnapshot(enrollmentId: number) {
  const db = createServerClient()
  return unwrapSupabaseResult(
    'getEnrollmentCourseSnapshot',
    await db
      .from('enrollments')
      .select('id,course_id')
      .eq('id', enrollmentId)
      .maybeSingle(),
  ) as Pick<Enrollment, 'id' | 'course_id'> | null
}

async function getMaterialSnapshot(materialId: number) {
  const db = createServerClient()
  return unwrapSupabaseResult(
    'getMaterialSnapshot',
    await db
      .from('materials')
      .select('id,course_id,material_type')
      .eq('id', materialId)
      .maybeSingle(),
  ) as MaterialSnapshot | null
}

export async function getMaterialSnapshotById(materialId: number): Promise<MaterialSnapshot | null> {
  return getMaterialSnapshot(materialId)
}

async function assertTextbookAssignmentTarget(enrollmentId: number, materialId: number) {
  const [enrollment, material] = await Promise.all([
    getEnrollmentCourseSnapshot(enrollmentId),
    getMaterialSnapshot(materialId),
  ])

  if (!enrollment) {
    throw createTextbookAssignmentError('ENROLLMENT_NOT_FOUND')
  }

  if (!material || material.material_type !== 'textbook') {
    throw createTextbookAssignmentError('TEXTBOOK_NOT_FOUND')
  }

  if (enrollment.course_id !== material.course_id) {
    throw createTextbookAssignmentError('COURSE_MISMATCH')
  }

  return { enrollment, material }
}

export async function getTextbookAssignments(
  enrollmentId: number,
): Promise<TextbookAssignment[]> {
  return getCachedTextbookAssignments(enrollmentId)
}

const getCachedTextbookAssignmentsByCourse = unstable_cache(
  async (courseId: number) => {
    const textbooks = await listMaterialsForCourse(courseId, { materialType: 'textbook' })
    const materialIds = textbooks.map((material) => material.id)

    if (materialIds.length === 0) {
      return []
    }

    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'getTextbookAssignmentsByCourse',
      await db
        .from('textbook_assignments')
        .select('*')
        .in('material_id', materialIds)
        .order('assigned_at')
        .order('id'),
    )

    return (data ?? []) as TextbookAssignment[]
  },
  ['textbook-assignments-by-course'],
  {
    revalidate: 15,
    tags: ['materials'],
  },
)

export async function getTextbookAssignmentsByCourse(
  courseId: number,
): Promise<TextbookAssignment[]> {
  return getCachedTextbookAssignmentsByCourse(courseId)
}

const getCachedAssignedTextbooks = unstable_cache(
  async (enrollmentId: number, activeOnly: boolean) => {
    const db = createServerClient()
    const assignmentRows = unwrapSupabaseResult(
      'getAssignedTextbooks.assignments',
      await db
        .from('textbook_assignments')
        .select('material_id,materials!inner(id,course_id,name,description,is_active,sort_order,material_type)')
        .eq('enrollment_id', enrollmentId)
        .eq('materials.material_type', 'textbook'),
    ) as Array<{ material_id: number; materials: Material }> | null

    let materials = (assignmentRows ?? []).map((row) => row.materials)

    if (activeOnly) {
      materials = materials.filter((material) => material.is_active)
    }

    return materials.sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
  },
  ['assigned-textbooks-for-enrollment'],
  {
    revalidate: 15,
    tags: ['materials'],
  },
)

export async function getAssignedTextbooksForEnrollment(
  enrollmentId: number,
  options?: { activeOnly?: boolean },
): Promise<Material[]> {
  return getCachedAssignedTextbooks(enrollmentId, Boolean(options?.activeOnly))
}

export async function getUnreceivedMaterialsForEnrollment(
  enrollmentId: number,
  courseId: number,
): Promise<Material[]> {
  const db = createServerClient()
  const [handouts, assignedTextbooks, receiptRows] = await Promise.all([
    listMaterialsForCourse(courseId, { activeOnly: true, materialType: 'handout' }),
    getAssignedTextbooksForEnrollment(enrollmentId, { activeOnly: true }),
    (async () => {
      const data = unwrapSupabaseResult(
        'getUnreceivedMaterialsForEnrollment.receipts',
        await db
          .from('distribution_logs')
          .select('material_id')
          .eq('enrollment_id', enrollmentId),
      ) as Array<{ material_id: number }> | null

      return data ?? []
    })(),
  ])

  const receivedIds = new Set(receiptRows.map((row) => row.material_id))
  return [...handouts, ...assignedTextbooks].filter((material) => !receivedIds.has(material.id))
}

export async function assignTextbook(
  enrollmentId: number,
  materialId: number,
  assignedBy?: string,
): Promise<TextbookAssignment> {
  await assertTextbookAssignmentTarget(enrollmentId, materialId)

  const db = createServerClient()
  const { data, error } = await db
    .from('textbook_assignments')
    .insert({
      enrollment_id: enrollmentId,
      material_id: materialId,
      assigned_by: assignedBy ?? null,
    })
    .select('*')
    .maybeSingle()

  if (error && error.code !== '23505') {
    throw error
  }

  if (data) {
    return data as TextbookAssignment
  }

  const existing = unwrapSupabaseResult(
    'assignTextbook.existing',
    await db
      .from('textbook_assignments')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .eq('material_id', materialId)
      .maybeSingle(),
  ) as TextbookAssignment | null

  if (!existing) {
    throw new Error('Failed to load textbook assignment')
  }

  return existing
}

export async function unassignTextbook(
  enrollmentId: number,
  materialId: number,
): Promise<void> {
  await assertTextbookAssignmentTarget(enrollmentId, materialId)

  const db = createServerClient()
  const existingDistributionLog = unwrapSupabaseResult(
    'unassignTextbook.distributionLog',
    await db
      .from('distribution_logs')
      .select('id')
      .eq('enrollment_id', enrollmentId)
      .eq('material_id', materialId)
      .maybeSingle(),
  ) as { id: number } | null

  if (existingDistributionLog) {
    throw createTextbookAssignmentError('ALREADY_DISTRIBUTED')
  }

  const { error } = await db
    .from('textbook_assignments')
    .delete()
    .eq('enrollment_id', enrollmentId)
    .eq('material_id', materialId)

  if (error) {
    throw error
  }
}

export async function bulkAssignTextbooks(
  enrollmentId: number,
  materialIds: number[],
  assignedBy?: string,
): Promise<TextbookAssignment[]> {
  const uniqueMaterialIds = Array.from(new Set(materialIds.filter((materialId) => Number.isInteger(materialId) && materialId > 0)))

  if (uniqueMaterialIds.length === 0) {
    return []
  }

  const enrollment = await getEnrollmentCourseSnapshot(enrollmentId)
  if (!enrollment) {
    throw createTextbookAssignmentError('ENROLLMENT_NOT_FOUND')
  }

  const db = createServerClient()
  const materials = unwrapSupabaseResult(
    'bulkAssignTextbooks.materials',
    await db
      .from('materials')
      .select('id,course_id,material_type')
      .in('id', uniqueMaterialIds),
  ) as Array<Pick<Material, 'id' | 'course_id' | 'material_type'>> | null

  const materialRows = materials ?? []
  if (materialRows.length !== uniqueMaterialIds.length) {
    throw createTextbookAssignmentError('TEXTBOOK_NOT_FOUND')
  }

  if (materialRows.some((material) => material.material_type !== 'textbook')) {
    throw createTextbookAssignmentError('TEXTBOOK_NOT_FOUND')
  }

  if (materialRows.some((material) => material.course_id !== enrollment.course_id)) {
    throw createTextbookAssignmentError('COURSE_MISMATCH')
  }

  const { data, error } = await db
    .from('textbook_assignments')
    .upsert(
      uniqueMaterialIds.map((materialId) => ({
        enrollment_id: enrollmentId,
        material_id: materialId,
        assigned_by: assignedBy ?? null,
      })),
      { onConflict: 'enrollment_id,material_id' },
    )
    .select('*')

  if (error) {
    throw error
  }

  const assignmentMap = new Map(((data ?? []) as TextbookAssignment[]).map((assignment) => [
    assignment.material_id,
    assignment,
  ]))

  return uniqueMaterialIds
    .map((materialId) => assignmentMap.get(materialId))
    .filter((assignment): assignment is TextbookAssignment => Boolean(assignment))
}

export async function listSeatAssignmentsForCourse(courseId: number): Promise<SeatAssignment[]> {
  return getCachedSeatAssignmentsForCourse(courseId)
}

const getCachedSeatAssignmentsForEnrollment = unstable_cache(
  async (enrollmentId: number) => {
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
  },
  ['seat-assignments-for-enrollment'],
  {
    revalidate: 15,
    tags: ['seats'],
  },
)

export async function listSeatAssignmentsForEnrollment(
  enrollmentId: number,
): Promise<SeatAssignment[]> {
  return getCachedSeatAssignmentsForEnrollment(enrollmentId)
}

const getCachedReceiptRows = unstable_cache(
  async (enrollmentId: number) => {
    const db = createServerClient()
    const data = unwrapSupabaseResult(
      'getReceiptRows',
      await db
        .from('distribution_logs')
        .select('material_id,distributed_at')
        .eq('enrollment_id', enrollmentId),
    )

    return (data ?? []) as Array<{ material_id: number; distributed_at: string }>
  },
  ['receipt-rows'],
  {
    revalidate: 10,
    tags: ['distribution-logs'],
  },
)

export async function getReceiptRows(enrollmentId: number) {
  const rows = await getCachedReceiptRows(enrollmentId)
  return rows.length > 0 ? rows : null
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

export async function buildPassPayload(params: {
  division: TenantType
  enrollmentId: number
  courseSlug: string
  name: string
  phone: string
  deviceKeyHash?: string | null
}): Promise<PassPayload | null> {
  const db = createServerClient()

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

  if (!isPassRequestMatch({
    enrollment: mergedEnrollment,
    name: params.name,
    phone: params.phone,
  })) {
    return null
  }

  const [subjects, seatAssignments, designatedSeat, attendance, materials, textbooks, receiptRows, appConfig] = await Promise.all([
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
    listMaterialsForCourse(course.id, { activeOnly: true, materialType: 'handout' }),
    getAssignedTextbooksForEnrollment(mergedEnrollment.id, { activeOnly: true }),
    getReceiptRows(mergedEnrollment.id),
    getAppConfig(),
  ])

  return buildPassPayloadResult({
    appConfig,
    course,
    enrollment: mergedEnrollment,
    subjects,
    seatAssignments,
    designatedSeat,
    attendance,
    materials,
    textbooks,
    receiptRows,
  })
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
