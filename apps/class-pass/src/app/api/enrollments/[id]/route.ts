import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  applyStudentBirthDate,
  deleteStudentIfOrphaned,
  ensureStudentProfile,
  getStudentAuthProfile,
  getStudentProfileById,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  exam_number: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  birth_date: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
  status: z.enum(['active', 'refunded']).optional(),
  custom_data: z.record(z.string()).optional(),
})

async function getVerifiedEnrollment(
  db: ReturnType<typeof createServerClient>,
  enrollmentId: number,
  division: string,
) {
  const { data, error } = await db
    .from('enrollments')
    .select('*,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const { courses, ...enrollment } = data
  void courses
  return enrollment
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) return authError

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) return featureError

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '수강생 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '수강생 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const currentEnrollment = await getVerifiedEnrollment(db, enrollmentId, division)
  if (!currentEnrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const payload: Record<string, unknown> = {}
  let studentProfile: ReturnType<typeof getStudentAuthProfile> | null = null
  const shouldSyncStudent =
    currentEnrollment.student_id == null
    || parsed.data.name !== undefined
    || parsed.data.phone !== undefined
    || parsed.data.exam_number !== undefined
    || parsed.data.photo_url !== undefined

  if (shouldSyncStudent) {
    let studentResult = await ensureStudentProfile(db, {
      division,
      currentStudentId: currentEnrollment.student_id,
      name: parsed.data.name ?? currentEnrollment.name,
      phone: parsed.data.phone ?? currentEnrollment.phone,
      exam_number: parsed.data.exam_number !== undefined
        ? parsed.data.exam_number
        : currentEnrollment.exam_number,
      photo_url: parsed.data.photo_url,
    })

    if (studentResult.changed || studentResult.created) {
      await syncStudentEnrollmentSnapshots(db, studentResult.student)
    }

    if (parsed.data.birth_date !== undefined) {
      const birthDateResult = await applyStudentBirthDate(db, studentResult.student, parsed.data.birth_date || null)
      studentResult = {
        ...studentResult,
        student: birthDateResult.student,
      }
    }

    payload.student_id = studentResult.student.id
    payload.name = studentResult.student.name
    payload.phone = studentResult.student.phone
    payload.exam_number = studentResult.student.exam_number
    payload.photo_url = studentResult.student.photo_url
    studentProfile = getStudentAuthProfile(studentResult.student)
  } else if (currentEnrollment.student_id) {
    const student = await getStudentProfileById(db, currentEnrollment.student_id, division)
    if (student) {
      studentProfile = getStudentAuthProfile(student)
    }
  }

  if (parsed.data.gender !== undefined) payload.gender = parsed.data.gender || null
  if (parsed.data.region !== undefined) payload.region = parsed.data.region || null
  if (parsed.data.series !== undefined) payload.series = parsed.data.series || null
  if (parsed.data.memo !== undefined) payload.memo = parsed.data.memo || null
  if (parsed.data.status !== undefined) payload.status = parsed.data.status
  if (parsed.data.custom_data !== undefined) payload.custom_data = parsed.data.custom_data

  const { data, error } = await db
    .from('enrollments')
    .update(payload)
    .eq('id', enrollmentId)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 강좌에 동일한 이름/연락처 수강생이 이미 존재합니다.' }, { status: 409 })
    }

    return NextResponse.json({ error: '수강생을 수정하지 못했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('enrollments')
  return NextResponse.json({
    enrollment: {
      ...data,
      student_profile: studentProfile,
    },
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) return authError

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) return featureError

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '수강생 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const { data: enrollment } = await db
    .from('enrollments')
    .select('id,student_id,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (!enrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { error } = await db
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)

  if (error) {
    return NextResponse.json({ error: '수강생을 삭제하지 못했습니다.' }, { status: 500 })
  }

  await deleteStudentIfOrphaned(db, enrollment.student_id)
  await invalidateCache('enrollments')
  return NextResponse.json({ success: true })
}
