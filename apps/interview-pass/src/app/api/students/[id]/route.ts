import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone } from '@/lib/utils'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  exam_number: z.string().optional(),
  gender: z.string().optional(),
  region: z.string().optional(),
  series: z.string().optional(),
})

type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null

type StudentLookupResult = {
  data: { id: string } | null
  error: SupabaseErrorLike
}

async function findStudentById(
  id: string,
  division: Awaited<ReturnType<typeof getServerTenantType>>,
) {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  return withDivisionFallback<StudentLookupResult>(
    () =>
      db
        .from('students')
        .select('id')
        .eq('id', id)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('students')
        .select('id')
        .eq('id', id)
        .maybeSingle(),
  )
}

function logStudentRouteError(
  action: 'GET' | 'PATCH' | 'DELETE',
  studentId: string,
  error: SupabaseErrorLike,
) {
  if (!error) {
    return
  }

  console.error(`[students:${action}] failed`, {
    studentId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  const { data: student, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', id)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle(),
  )

  if (error) {
    logStudentRouteError('GET', id, error)
    return NextResponse.json({ error: '학생 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  if (!student) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: logs, error: logsError } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('id, material_id, distributed_at, materials(name)')
        .eq('student_id', id)
        .in('division', scope)
        .order('distributed_at', { ascending: false }),
    () =>
      db
        .from('distribution_logs')
        .select('id, material_id, distributed_at, materials(name)')
        .eq('student_id', id)
        .order('distributed_at', { ascending: false }),
  )

  if (logsError) {
    logStudentRouteError('GET', id, logsError)
    return NextResponse.json({ error: '학생 배부 이력을 불러오지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({
    student: {
      ...student,
      distribution_logs: logs ?? [],
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const { data: existingStudent, error: existingStudentError } = await findStudentById(id, division)

  if (existingStudentError) {
    logStudentRouteError('PATCH', id, existingStudentError)
    return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  if (!existingStudent) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.name) update.name = normalizeName(parsed.data.name)
  if (parsed.data.phone) update.phone = normalizePhone(parsed.data.phone)
  if (parsed.data.exam_number !== undefined) update.exam_number = parsed.data.exam_number || null
  if (parsed.data.gender !== undefined) update.gender = parsed.data.gender || null
  if (parsed.data.region !== undefined) update.region = parsed.data.region || null
  if (parsed.data.series !== undefined) update.series = parsed.data.series || null

  const db = createServerClient()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', id)
        .in('division', getScopedDivisionValues(division))
        .select()
        .maybeSingle(),
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', id)
        .select()
        .maybeSingle(),
  )

  if (error) {
    logStudentRouteError('PATCH', id, error)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '같은 이름과 연락처를 가진 학생이 이미 등록되어 있습니다.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: '학생 정보를 수정하지 못했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('students')
  return NextResponse.json({ student: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const { data: existingStudent, error: existingStudentError } = await findStudentById(id, division)

  if (existingStudentError) {
    logStudentRouteError('DELETE', id, existingStudentError)
    return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  if (!existingStudent) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .delete()
        .eq('id', id)
        .in('division', getScopedDivisionValues(division)),
    () =>
      db
        .from('students')
        .delete()
        .eq('id', id),
  )

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: '배부 이력이 있는 학생은 삭제할 수 없습니다. 먼저 배부 이력을 정리해 주세요.' },
        { status: 409 },
      )
    }

    logStudentRouteError('DELETE', id, error)
    return NextResponse.json({ error: '학생을 삭제하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ success: true })
}
