import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getCohortLabelMap } from '@/lib/student-cohorts'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { Course, Enrollment, Student } from '@/types/database'

type MaybeJoinedOne<T> = T | T[] | null | undefined

type EnrollmentHistoryDbRow = Pick<
  Enrollment,
  | 'id'
  | 'course_id'
  | 'student_id'
  | 'name'
  | 'phone'
  | 'exam_number'
  | 'status'
  | 'suspended_at'
  | 'refunded_at'
  | 'series'
  | 'series_group'
  | 'student_type'
  | 'created_at'
> & {
  courses?: MaybeJoinedOne<Pick<Course, 'id' | 'name' | 'slug' | 'status' | 'division'>>
  students?: MaybeJoinedOne<Pick<Student, 'id' | 'name' | 'phone' | 'exam_number' | 'cohort_option_id' | 'auth_method'>>
}

function normalizeJoinedOne<T>(value: MaybeJoinedOne<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function getSeriesLabel(row: Pick<Enrollment, 'series' | 'series_group'>) {
  return row.series?.trim() || (row.series_group === 'career' ? '경채' : '공채')
}

function getLifecycleStatus(row: EnrollmentHistoryDbRow, course: Pick<Course, 'status'> | null) {
  if (row.status === 'refunded') {
    return 'refunded'
  }
  if (row.suspended_at) {
    return 'suspended'
  }
  if (course?.status === 'archived') {
    return 'archived'
  }
  return 'active'
}

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '수강생 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const { data: currentRow, error: currentError } = await db
    .from('enrollments')
    .select('id,course_id,student_id,name,phone,exam_number,status,suspended_at,refunded_at,series,series_group,student_type,created_at,courses!inner(id,name,slug,status,division),students(id,name,phone,exam_number,cohort_option_id,auth_method)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (currentError) {
    return NextResponse.json({ error: '학생 이력을 불러오지 못했습니다.' }, { status: 500 })
  }

  if (!currentRow) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const current = currentRow as EnrollmentHistoryDbRow
  const currentStudent = normalizeJoinedOne(current.students)
  const resolution = current.student_id ? 'student_id' : 'identity_fallback'

  let query = db
    .from('enrollments')
    .select('id,course_id,student_id,name,phone,exam_number,status,suspended_at,refunded_at,series,series_group,student_type,created_at,courses!inner(id,name,slug,status,division),students(id,name,phone,exam_number,cohort_option_id,auth_method)')
    .eq('courses.division', division)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (current.student_id) {
    query = query.eq('student_id', current.student_id)
  } else {
    query = query.eq('name', current.name).eq('phone', current.phone)
  }

  const { data: historyData, error: historyError } = await query
  if (historyError) {
    return NextResponse.json({ error: '학생 이력을 불러오지 못했습니다.' }, { status: 500 })
  }

  const historyRows = (historyData ?? []) as EnrollmentHistoryDbRow[]
  const cohortIds = historyRows
    .map((row) => normalizeJoinedOne(row.students)?.cohort_option_id ?? null)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)
  const cohortLabelMap = await getCohortLabelMap([
    currentStudent?.cohort_option_id ?? null,
    ...cohortIds,
  ])

  const studentCohortId = currentStudent?.cohort_option_id ?? null
  const student = {
    id: currentStudent?.id ?? current.student_id,
    name: currentStudent?.name ?? current.name,
    phone: currentStudent?.phone ?? current.phone,
    exam_number: currentStudent?.exam_number ?? current.exam_number,
    cohort_option_id: studentCohortId,
    cohort_label: studentCohortId ? cohortLabelMap.get(studentCohortId) ?? null : null,
    auth_method: currentStudent?.auth_method ?? null,
  }

  const history = historyRows.map((row) => {
    const course = normalizeJoinedOne(row.courses)
    const rowStudent = normalizeJoinedOne(row.students)
    const cohortId = rowStudent?.cohort_option_id ?? student.cohort_option_id ?? null
    return {
      enrollment_id: row.id,
      course_id: row.course_id,
      course_name: course?.name ?? `강좌 ${row.course_id}`,
      course_slug: course?.slug ?? '',
      course_status: course?.status ?? 'active',
      status: row.status,
      lifecycle_status: getLifecycleStatus(row, course),
      suspended_at: row.suspended_at,
      refunded_at: row.refunded_at,
      series_label: getSeriesLabel(row),
      student_type: row.student_type,
      exam_number: row.exam_number,
      cohort_label: cohortId ? cohortLabelMap.get(cohortId) ?? null : null,
      created_at: row.created_at,
    }
  })

  return NextResponse.json({
    resolution,
    student,
    active: history.filter((row) => (
      row.status === 'active'
      && !row.suspended_at
      && row.course_status === 'active'
    )),
    history,
  })
}
