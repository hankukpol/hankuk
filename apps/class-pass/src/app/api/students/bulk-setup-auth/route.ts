import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  getPendingStudentAuthStats,
  initializeStudentAuthBatch,
  listMissingBirthDateStudentsByCourse,
  listStudentsPendingAuthSetup,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  division: z.string().optional(),
})

async function loadPendingStudents() {
  const db = createServerClient()
  const division = await getServerTenantType()
  const stats = await getPendingStudentAuthStats(db, division)

  return {
    db,
    division,
    stats,
  }
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const requestedDivision = req.nextUrl.searchParams.get('division')
    const { db, division, stats } = await loadPendingStudents()
    if (requestedDivision && requestedDivision !== division) {
      return NextResponse.json({ error: '현재 지점과 요청 지점이 일치하지 않습니다.' }, { status: 400 })
    }

    const missingBirthDateCourses = await listMissingBirthDateStudentsByCourse(db, division)

    return NextResponse.json({
      total: stats.total,
      birth_date_ready_count: stats.birthDateReadyCount,
      pin_required_count: stats.pinRequiredCount,
      missing_birth_date_courses: missingBirthDateCourses.map((course) => ({
        course_id: course.courseId,
        course_name: course.courseName,
        course_status: course.courseStatus,
        missing_birth_date_count: course.students.length,
        students: course.students.map((student) => ({
          enrollment_id: student.enrollmentId,
          student_id: student.studentId,
          name: student.name,
          phone: student.phone,
          exam_number: student.examNumber,
          auth_method: student.authMethod,
        })),
      })),
    })
  } catch (error) {
    return handleRouteError('students.bulk-setup-auth.GET', '학생 인증 설정 현황을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '인증 일괄 설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const { db, division } = await loadPendingStudents()
    if (parsed.data.division && parsed.data.division !== division) {
      return NextResponse.json({ error: '현재 지점과 요청 지점이 일치하지 않습니다.' }, { status: 400 })
    }

    const generatedPins: Array<{ name: string; phone: string; pin: string }> = []
    let birthDateCount = 0
    let pinCount = 0
    let total = 0

    while (true) {
      const students = await listStudentsPendingAuthSetup(db, division, { limit: 200 })
      if (students.length === 0) {
        break
      }

      const authSetup = await initializeStudentAuthBatch(
        db,
        students.map((student) => ({
          key: String(student.id),
          student,
          birthDate: student.birth_date,
        })),
      )

      total += students.length

      for (const result of authSetup.results.values()) {
        if (result.student.auth_method === 'birth_date') {
          birthDateCount += 1
        }

        if (result.generatedPin) {
          pinCount += 1
        }
      }

      for (const generatedPin of authSetup.generatedPins) {
        generatedPins.push({
          name: generatedPin.name,
          phone: generatedPin.phone,
          pin: generatedPin.pin,
        })
      }
    }

    await invalidateCache('enrollments')
    return NextResponse.json(
      {
        total,
        birth_date_count: birthDateCount,
        pin_count: pinCount,
        generated_pins: generatedPins,
      },
      generatedPins.length > 0
        ? { headers: { 'Cache-Control': 'no-store, max-age=0' } }
        : undefined,
    )
  } catch (error) {
    return handleRouteError('students.bulk-setup-auth.POST', '학생 인증 정보를 일괄 설정하지 못했습니다.', error)
  }
}
