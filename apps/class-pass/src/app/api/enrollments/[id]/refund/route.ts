import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyEnrollmentOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export async function POST(
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
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const ownership = await verifyEnrollmentOwnership(enrollmentId, division)
  if (!ownership.valid) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('enrollments')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '환불 처리에 실패했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ enrollment: data })
}
