import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { verifyCourseOwnership } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone, parsePositiveInt } from '@/lib/utils'
import type { Course, Enrollment, Student } from '@/types/database'

type SearchStudentRow = Pick<
  Student,
  'id' | 'name' | 'phone' | 'exam_number' | 'photo_url' | 'updated_at'
>

type EnrollmentSearchRow = Pick<
  Enrollment,
  'id' | 'student_id' | 'course_id' | 'status' | 'created_at'
> & {
  courses?: Pick<Course, 'id' | 'name' | 'division'> | Array<Pick<Course, 'id' | 'name' | 'division'>> | null
}

function normalizeJoinedCourse(
  value: EnrollmentSearchRow['courses'],
): Pick<Course, 'id' | 'name' | 'division'> | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function getStudentSearchScore(student: SearchStudentRow, rawQuery: string, normalizedQuery: string, phoneQuery: string) {
  const examNumber = (student.exam_number ?? '').toLowerCase()
  const name = normalizeName(student.name).toLowerCase()
  const phone = normalizePhone(student.phone)

  if (normalizedQuery && examNumber === normalizedQuery) {
    return 0
  }

  if (phoneQuery && phone.endsWith(phoneQuery)) {
    return 1
  }

  if (name === normalizeName(rawQuery).toLowerCase()) {
    return 2
  }

  if (normalizedQuery && examNumber.includes(normalizedQuery)) {
    return 3
  }

  if (name.includes(normalizeName(rawQuery).toLowerCase())) {
    return 4
  }

  return 5
}

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const query = req.nextUrl.searchParams.get('query')?.trim() ?? ''
  const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
  const normalizedQuery = query.toLowerCase()
  const phoneQuery = normalizePhone(query)
  const escapedQuery = escapeLikePattern(query)
  const escapedNormalizedQuery = escapeLikePattern(normalizedQuery)
  const escapedPhoneQuery = escapeLikePattern(phoneQuery)

  if (query.length < 2 && phoneQuery.length < 2) {
    return NextResponse.json({ students: [] })
  }

  const division = await getServerTenantType()
  if (courseId && !(await verifyCourseOwnership(courseId, division))) {
    return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const searches: Array<Promise<{ data: SearchStudentRow[] | null; error: unknown }>> = []

  searches.push(
    db
      .from('students')
      .select('id,name,phone,exam_number,photo_url,updated_at')
      .eq('division', division)
      .ilike('name', `%${escapedQuery}%`)
      .order('updated_at', { ascending: false })
      .limit(8) as unknown as Promise<{ data: SearchStudentRow[] | null; error: unknown }>,
  )

  if (normalizedQuery.length >= 2) {
    searches.push(
      db
        .from('students')
        .select('id,name,phone,exam_number,photo_url,updated_at')
        .eq('division', division)
        .ilike('exam_number', `%${escapedNormalizedQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(8) as unknown as Promise<{ data: SearchStudentRow[] | null; error: unknown }>,
    )
  }

  if (phoneQuery.length >= 2) {
    searches.push(
      db
        .from('students')
        .select('id,name,phone,exam_number,photo_url,updated_at')
        .eq('division', division)
        .ilike('phone', `%${escapedPhoneQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(8) as unknown as Promise<{ data: SearchStudentRow[] | null; error: unknown }>,
    )
  }

  const results = await Promise.all(searches)
  const firstError = results.find((result) => result.error)?.error
  if (firstError) {
    console.error('students.search failed', firstError)
    return NextResponse.json({ error: '수강생 검색에 실패했습니다.' }, { status: 500 })
  }

  const byId = new Map<number, SearchStudentRow>()
  for (const result of results) {
    for (const student of result.data ?? []) {
      byId.set(student.id, student)
    }
  }

  const students = Array.from(byId.values())
    .sort((left, right) => {
      const scoreDiff = getStudentSearchScore(left, query, normalizedQuery, phoneQuery)
        - getStudentSearchScore(right, query, normalizedQuery, phoneQuery)
      if (scoreDiff !== 0) {
        return scoreDiff
      }

      return right.updated_at.localeCompare(left.updated_at)
    })
    .slice(0, 12)

  if (students.length === 0) {
    return NextResponse.json({ students: [] })
  }

  const studentIds = students.map((student) => student.id)
  const { data: enrollmentRows, error: enrollmentError } = await db
    .from('enrollments')
    .select('id,student_id,course_id,status,created_at,courses!inner(id,name,division)')
    .in('student_id', studentIds)
    .eq('courses.division', division)
    .order('created_at', { ascending: false })

  if (enrollmentError) {
    console.error('students.search.enrollments failed', enrollmentError)
    return NextResponse.json({ error: '수강생 검색에 실패했습니다.' }, { status: 500 })
  }

  const enrollmentByStudentId = new Map<number, EnrollmentSearchRow[]>()
  for (const row of (enrollmentRows ?? []) as EnrollmentSearchRow[]) {
    if (!row.student_id) {
      continue
    }

    enrollmentByStudentId.set(row.student_id, [
      ...(enrollmentByStudentId.get(row.student_id) ?? []),
      row,
    ])
  }

  return NextResponse.json({
    students: students.map((student) => {
      const studentEnrollments = enrollmentByStudentId.get(student.id) ?? []
      const latestEnrollment = studentEnrollments[0] ?? null
      const latestCourse = normalizeJoinedCourse(latestEnrollment?.courses)

      return {
        id: student.id,
        name: student.name,
        phone: student.phone,
        exam_number: student.exam_number,
        photo_url: student.photo_url,
        alreadyEnrolled: courseId
          ? studentEnrollments.some((enrollment) => (
            enrollment.course_id === courseId && enrollment.status === 'active'
          ))
          : false,
        latestEnrollment: latestEnrollment && latestCourse
          ? {
            id: latestEnrollment.id,
            courseId: latestEnrollment.course_id,
            courseName: latestCourse.name,
            status: latestEnrollment.status,
            createdAt: latestEnrollment.created_at,
          }
          : null,
      }
    }),
  })
}
