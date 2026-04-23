import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const suspensionSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
})

async function getVerifiedEnrollment(
  db: ReturnType<typeof createServerClient>,
  enrollmentId: number,
  division: string,
) {
  const { data, error } = await db
    .from('enrollments')
    .select('id,status,suspended_at,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const { courses, ...enrollment } = data
  void courses
  return enrollment as {
    id: number
    status: 'active' | 'refunded'
    suspended_at: string | null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError, payload } = await authenticateAdminRequest(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = suspensionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '정지 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const currentEnrollment = await getVerifiedEnrollment(db, enrollmentId, division)
  if (!currentEnrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (currentEnrollment.status !== 'active') {
    return NextResponse.json({ error: '환불된 수강은 응시 정지할 수 없습니다.' }, { status: 409 })
  }

  const reason = parsed.data.reason?.trim() || null
  const actor = payload?.adminId ?? payload?.staffName ?? 'admin'
  const { data, error } = await db
    .from('enrollments')
    .update({
      suspended_at: new Date().toISOString(),
      suspension_reason: reason,
      suspended_by: actor,
    })
    .eq('id', enrollmentId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '응시 정지 처리에 실패했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ enrollment: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await authenticateAdminRequest(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const currentEnrollment = await getVerifiedEnrollment(db, enrollmentId, division)
  if (!currentEnrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data, error } = await db
    .from('enrollments')
    .update({
      suspended_at: null,
      suspension_reason: null,
      suspended_by: null,
    })
    .eq('id', enrollmentId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '응시 정지 해제에 실패했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ enrollment: data })
}
