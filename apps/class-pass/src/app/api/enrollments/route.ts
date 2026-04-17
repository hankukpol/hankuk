import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  bulkAssignTextbooks,
  getCourseById,
  listCourseEnrollments,
  listMaterialsForCourse,
  verifyCourseOwnership,
} from '@/lib/class-pass-data'
import {
  ensureStudentProfile,
  findMatchingStudentProfile,
  getStudentAuthProfile,
  initializeStudentAuth,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { Student } from '@/types/database'

const createSchema = z.object({
  courseId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
  exam_number: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  birth_date: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
  custom_data: z.record(z.string()).optional(),
  textbookIds: z.array(z.number().int().positive()).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? undefined
    const offset = parsePositiveInt(req.nextUrl.searchParams.get('offset'))
    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const enrollments = await listCourseEnrollments(courseId, {
      limit,
      offset: offset ?? undefined,
    })

    const studentIds = Array.from(new Set(
      enrollments
        .map((enrollment) => enrollment.student_id)
        .filter((studentId): studentId is number => Number.isInteger(studentId)),
    ))

    let studentProfileMap = new Map<number, Pick<Student, 'id' | 'birth_date' | 'auth_method'>>()
    if (studentIds.length > 0) {
      const db = createServerClient()
      const { data: students, error } = await db
        .from('students')
        .select('*')
        .in('id', studentIds)

      if (error) {
        return NextResponse.json({ error: '수강생 목록을 불러오지 못했습니다.' }, { status: 500 })
      }

      studentProfileMap = new Map(
        ((students ?? []) as Student[]).map((student) => [
          student.id,
          {
            id: student.id,
            birth_date: student.birth_date ?? null,
            auth_method: student.auth_method ?? null,
          },
        ]),
      )
    }

    return NextResponse.json({
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        student_profile: enrollment.student_id
          ? studentProfileMap.get(enrollment.student_id) ?? null
          : null,
      })),
    })
  } catch (error) {
    return handleRouteError('enrollments.GET', '수강생 목록을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_student_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '수강생 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const textbookIds = Array.from(new Set(parsed.data.textbookIds ?? []))
    if (textbookIds.length > 0) {
      const textbooks = await listMaterialsForCourse(parsed.data.courseId, { materialType: 'textbook' })
      const textbookIdSet = new Set(textbooks.map((textbook) => textbook.id))
      if (textbookIds.some((textbookId) => !textbookIdSet.has(textbookId))) {
        return NextResponse.json({ error: '유효하지 않은 교재가 포함되어 있습니다.' }, { status: 400 })
      }
    }

    const db = createServerClient()
    const matchedStudent = await findMatchingStudentProfile(db, {
      division,
      name: parsed.data.name,
      phone: parsed.data.phone,
      exam_number: parsed.data.exam_number,
      photo_url: parsed.data.photo_url,
    })

    if (matchedStudent) {
      const { data: existingByStudent, error: existingError } = await db
        .from('enrollments')
        .select('id')
        .eq('course_id', parsed.data.courseId)
        .eq('student_id', matchedStudent.id)
        .maybeSingle()

      if (existingError) {
        return NextResponse.json({ error: '수강생을 생성하지 못했습니다.' }, { status: 500 })
      }

      if (existingByStudent) {
        return NextResponse.json({ error: '같은 과정에 동일한 수강생이 이미 존재합니다.' }, { status: 409 })
      }
    }

    const studentResult = await ensureStudentProfile(db, {
      division,
      currentStudentId: matchedStudent?.id ?? null,
      name: parsed.data.name,
      phone: parsed.data.phone,
      exam_number: parsed.data.exam_number,
      photo_url: parsed.data.photo_url,
    })

    if (studentResult.changed || studentResult.created) {
      await syncStudentEnrollmentSnapshots(db, studentResult.student)
    }

    const authSetup = await initializeStudentAuth(
      db,
      studentResult.student,
      parsed.data.birth_date || null,
    )
    const student = authSetup.student

    const { data, error } = await db
      .from('enrollments')
      .insert({
        course_id: parsed.data.courseId,
        student_id: student.id,
        name: student.name,
        phone: student.phone,
        exam_number: student.exam_number,
        gender: parsed.data.gender || null,
        region: parsed.data.region || null,
        series: parsed.data.series || null,
        memo: parsed.data.memo || null,
        photo_url: student.photo_url,
        custom_data: parsed.data.custom_data ?? {},
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '같은 과정에 동일한 이름/연락처 수강생이 이미 존재합니다.' }, { status: 409 })
      }

      return NextResponse.json({ error: '수강생을 생성하지 못했습니다.' }, { status: 500 })
    }

    if (textbookIds.length > 0) {
      try {
        await bulkAssignTextbooks(data.id, textbookIds, 'admin')
      } catch (assignmentError) {
        const rollbackResult = await db
          .from('enrollments')
          .delete()
          .eq('id', data.id)

        if (rollbackResult.error) {
          throw new Error('ENROLLMENT_TEXTBOOK_ASSIGNMENT_ROLLBACK_FAILED', { cause: assignmentError })
        }

        throw assignmentError
      }
    }

    await invalidateCache('enrollments')
    if (textbookIds.length > 0) {
      await invalidateCache('materials')
    }
    return NextResponse.json({
      enrollment: {
        ...data,
        student_profile: getStudentAuthProfile(student),
      },
      generated_pin: authSetup.generatedPin ?? undefined,
    }, { status: 201 })
  } catch (error) {
    return handleRouteError('enrollments.POST', '수강생을 생성하지 못했습니다.', error)
  }
}
