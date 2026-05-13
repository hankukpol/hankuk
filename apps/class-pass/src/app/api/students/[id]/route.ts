import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  applyStudentCohortOption,
  applyStudentBirthDate,
  getStudentAuthProfile,
  getStudentProfileById,
  isStudentIdentityConflictError,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import {
  assertCohortOptionBelongsToCurrentBranch,
  attachCohortLabelsToStudents,
  normalizeCohortNumber,
  resolveStudentCohortOptionByNumber,
} from '@/lib/student-cohorts'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  birth_date: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
  cohort_option_id: z.number().int().positive().optional().nullable(),
  cohort_number: z.preprocess((value) => {
    try {
      return normalizeCohortNumber(value)
    } catch {
      return Number.NaN
    }
  }, z.number().int().min(1).max(999).optional().nullable()),
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

    let result = { student, created: false, changed: false }
    if (parsed.data.cohort_option_id !== undefined || parsed.data.cohort_number !== undefined) {
      try {
        const cohortOption = parsed.data.cohort_number !== undefined
          ? await resolveStudentCohortOptionByNumber(parsed.data.cohort_number)
          : await assertCohortOptionBelongsToCurrentBranch(parsed.data.cohort_option_id)
        parsed.data.cohort_option_id = parsed.data.cohort_number !== undefined
          ? cohortOption?.id ?? null
          : parsed.data.cohort_option_id
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : '선택한 기수는 현재 지점에서 사용할 수 없습니다.' },
          { status: 400 },
        )
      }
      result = await applyStudentCohortOption(db, result.student, parsed.data.cohort_option_id, division)
    }

    if (parsed.data.birth_date !== undefined) {
      const birthDateResult = await applyStudentBirthDate(db, result.student, parsed.data.birth_date || null)
      result = {
        student: birthDateResult.student,
        created: false,
        changed: result.changed || birthDateResult.changed,
      }
    }

    if (result.changed) {
      await syncStudentEnrollmentSnapshots(db, result.student)
    }
    const [studentWithCohort] = await attachCohortLabelsToStudents([result.student])
    const responseStudent = studentWithCohort ?? result.student

    return NextResponse.json({
      student: {
        ...getStudentAuthProfile(responseStudent),
        name: responseStudent.name,
        phone: responseStudent.phone,
        exam_number: responseStudent.exam_number,
        cohort_option_id: responseStudent.cohort_option_id,
        cohort_label: responseStudent.cohort_label ?? null,
        photo_url: responseStudent.photo_url,
      },
    })
  } catch (error) {
    if (isStudentIdentityConflictError(error)) {
      return NextResponse.json({ error: error.message, fields: error.fields }, { status: 409 })
    }

    return handleRouteError('students.[id].PATCH', '학생 정보를 수정하지 못했습니다.', error)
  }
}
