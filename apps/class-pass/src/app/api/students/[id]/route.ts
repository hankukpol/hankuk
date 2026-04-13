import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  applyStudentBirthDate,
  getStudentAuthProfile,
  getStudentProfileById,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  birth_date: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const { id } = await params
    const studentId = parsePositiveInt(id)
    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 올바르지 않습니다.' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '학생 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const db = createServerClient()
    const student = await getStudentProfileById(db, studentId, division)
    if (!student) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const result = await applyStudentBirthDate(db, student, parsed.data.birth_date || null)
    if (result.changed) {
      await syncStudentEnrollmentSnapshots(db, result.student)
    }

    return NextResponse.json({
      student: {
        ...getStudentAuthProfile(result.student),
        name: result.student.name,
        phone: result.student.phone,
        exam_number: result.student.exam_number,
        photo_url: result.student.photo_url,
      },
    })
  } catch (error) {
    return handleRouteError('students.[id].PATCH', '학생 정보를 수정하지 못했습니다.', error)
  }
}
