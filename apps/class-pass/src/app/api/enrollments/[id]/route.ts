import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { resolveBranchSeriesOption } from '@/lib/branch-series'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  assertCohortOptionBelongsToCurrentBranch,
  attachCohortLabelsToEnrollments,
  normalizeCohortNumber,
  resolveStudentCohortOptionByNumber,
} from '@/lib/student-cohorts'
import {
  applyStudentBirthDate,
  deleteStudentIfOrphaned,
  ensureStudentProfile,
  getStudentAuthProfile,
  getStudentProfileById,
  isStudentIdentityConflictError,
  syncStudentEnrollmentSharedDetails,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { isStudentTypeColumnMissing, omitStudentType } from '@/lib/db/column-compat'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import { isLikelyPhoneNumber, isValidBirthDateKey } from '@/lib/validation/primitives'
import type { Enrollment } from '@/types/database'

const phoneSchema = z.string().trim().refine(isLikelyPhoneNumber)
const optionalBirthDateSchema = z.preprocess(
  (value) => value === '' ? '' : value,
  z.union([z.string().refine(isValidBirthDateKey), z.literal('')]).optional().nullable(),
)
const cohortNumberSchema = z.preprocess((value) => {
  try {
    return normalizeCohortNumber(value)
  } catch {
    return Number.NaN
  }
}, z.number().int().min(1).max(999).optional().nullable())

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: phoneSchema.optional(),
  exam_number: z.string().optional().nullable(),
  cohort_option_id: z.number().int().positive().optional().nullable(),
  cohort_number: cohortNumberSchema,
  gender: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  series_option_id: z.number().int().positive().optional().nullable(),
  student_type: z.enum(['academy', 'general']).optional(),
  memo: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  birth_date: optionalBirthDateSchema,
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

  if (parsed.data.status !== undefined && parsed.data.status !== currentEnrollment.status) {
    return NextResponse.json(
      { error: '수강 상태 변경은 결제 취소 또는 환불 전용 API를 사용해 주세요.' },
      { status: 400 },
    )
  }

  const payload: Record<string, unknown> = {}
  let studentProfile: ReturnType<typeof getStudentAuthProfile> | null = null
  const shouldSyncStudent =
    currentEnrollment.student_id == null
    || parsed.data.name !== undefined
    || parsed.data.phone !== undefined
    || parsed.data.exam_number !== undefined
    || parsed.data.cohort_option_id !== undefined
    || parsed.data.cohort_number !== undefined
    || parsed.data.birth_date !== undefined
    || parsed.data.photo_url !== undefined

  if (shouldSyncStudent) {
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
    let studentResult: Awaited<ReturnType<typeof ensureStudentProfile>>
    try {
      studentResult = await ensureStudentProfile(db, {
        division,
        currentStudentId: currentEnrollment.student_id,
        name: parsed.data.name ?? currentEnrollment.name,
        phone: parsed.data.phone ?? currentEnrollment.phone,
        exam_number: parsed.data.exam_number !== undefined
          ? parsed.data.exam_number
          : currentEnrollment.exam_number,
        ...(parsed.data.cohort_option_id !== undefined ? { cohort_option_id: parsed.data.cohort_option_id } : {}),
        birth_date: parsed.data.birth_date,
        photo_url: parsed.data.photo_url,
      })
    } catch (error) {
      if (isStudentIdentityConflictError(error)) {
        return NextResponse.json({ error: error.message, fields: error.fields }, { status: 409 })
      }

      throw error
    }

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
  if (parsed.data.series_option_id !== undefined || parsed.data.series !== undefined) {
    const seriesOption = await resolveBranchSeriesOption({
      optionId: parsed.data.series_option_id,
      label: parsed.data.series,
    })
    if (parsed.data.series_option_id && seriesOption?.id !== parsed.data.series_option_id) {
      return NextResponse.json({ error: '선택한 직렬이 현재 지점에서 사용할 수 없습니다.' }, { status: 400 })
    }
    payload.series_option_id = seriesOption?.id ?? null
    payload.series_group = seriesOption?.group_key ?? 'public'
    payload.series = seriesOption?.label ?? parsed.data.series ?? '공채'
  }
  if (parsed.data.student_type !== undefined) payload.student_type = parsed.data.student_type
  if (parsed.data.memo !== undefined) payload.memo = parsed.data.memo || null
  if (parsed.data.status !== undefined) payload.status = parsed.data.status
  if (parsed.data.custom_data !== undefined) payload.custom_data = parsed.data.custom_data

  let { data, error } = await db
    .from('enrollments')
    .update(payload)
    .eq('id', enrollmentId)
    .select('*')
    .maybeSingle()

  if (error && parsed.data.student_type !== undefined && isStudentTypeColumnMissing(error)) {
    const retry = await db
      .from('enrollments')
      .update(omitStudentType(payload))
      .eq('id', enrollmentId)
      .select('*')
      .maybeSingle()

    data = retry.data
      ? { ...retry.data, student_type: parsed.data.student_type }
      : retry.data
    error = retry.error
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 강좌에 동일한 이름/연락처 수강생이 이미 존재합니다.' }, { status: 409 })
    }

    return NextResponse.json({ error: '수강생을 수정하지 못했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const sharedDetails = {
    ...(parsed.data.gender !== undefined ? { gender: parsed.data.gender || null } : {}),
    ...('series_option_id' in payload ? {
      series_option_id: payload.series_option_id as number | null,
      series_group: payload.series_group as Enrollment['series_group'] | null,
      series: payload.series as string | null,
    } : {}),
    ...(parsed.data.student_type !== undefined ? { student_type: parsed.data.student_type } : {}),
  }
  if (Object.keys(sharedDetails).length > 0) {
    await syncStudentEnrollmentSharedDetails(
      db,
      (data as Enrollment).student_id ?? currentEnrollment.student_id,
      sharedDetails,
    )
  }

  await invalidateCache('enrollments')
  const [enrichedEnrollment] = await attachCohortLabelsToEnrollments([{
    ...(data as Enrollment),
    cohort_option_id: studentProfile?.cohort_option_id ?? undefined,
    student_profile: studentProfile,
  } as Enrollment])
  return NextResponse.json({
    enrollment: enrichedEnrollment ?? { ...data, student_profile: studentProfile },
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
  const { data: enrollment, error: enrollmentError } = await db
    .from('enrollments')
    .select('id,student_id,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (enrollmentError) {
    return NextResponse.json({ error: '수강생 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  if (!enrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { count: paymentCount, error: paymentCountError } = await db
    .from('enrollment_payments')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)

  if (paymentCountError) {
    return NextResponse.json({ error: '결제 이력을 확인하지 못했습니다.' }, { status: 500 })
  }

  if ((paymentCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: '결제 기록이 있어 수강생을 삭제할 수 없습니다.',
        reason: '정산·환불 이력 보존을 위해 결제 기록이 연결된 수강생은 삭제하지 않습니다. 결제 취소/환불 또는 응시 정지를 사용해 주세요.',
      },
      { status: 409 },
    )
  }

  const { error } = await db
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error: '연결된 기록이 있어 수강생을 삭제할 수 없습니다.',
          reason: '출결, 결제, 좌석, 자료 수령 등 보존해야 하는 이력이 남아 있습니다. 관련 이력을 정리하거나 응시 정지를 사용해 주세요.',
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: '수강생을 삭제하지 못했습니다.' }, { status: 500 })
  }

  await deleteStudentIfOrphaned(db, enrollment.student_id)
  await invalidateCache('enrollments')
  return NextResponse.json({ success: true })
}
