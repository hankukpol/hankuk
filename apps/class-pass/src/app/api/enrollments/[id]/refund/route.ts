import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
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
  const db = createServerClient()
  const current = await db.from('enrollments').select('id,status,courses!inner(id)')
    .eq('id', enrollmentId).eq('courses.division', division).maybeSingle()
  if (current.error) {
    return NextResponse.json({ error: '수강 상태를 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!current.data) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (current.data.status === 'cancelled') {
    return NextResponse.json({ error: '수강종료된 등록의 상태는 변경할 수 없습니다. 필요한 환불은 수납·환불에서 처리해 주세요.' }, { status: 409 })
  }

  const { data: paymentRows, error: paymentError } = await db
    .from('enrollment_payments')
    .select('amount,status,enrollment_refunds(amount)')
    .eq('enrollment_id', enrollmentId)

  if (paymentError) {
    return NextResponse.json({ error: '환불 처리에 실패했습니다.' }, { status: 500 })
  }

  const remainingPaidAmount = ((paymentRows ?? []) as Array<{
    amount: number | null
    status: string | null
    enrollment_refunds?: Array<{ amount: number | null }> | null
  }>).reduce((total, payment) => {
    if (payment.status === 'voided') {
      return total
    }

    const refundTotal = (payment.enrollment_refunds ?? []).reduce(
      (sum, refund) => sum + Number(refund.amount ?? 0),
      0,
    )
    return total + Math.max(Number(payment.amount ?? 0) - refundTotal, 0)
  }, 0)

  if (remainingPaidAmount > 0) {
    return NextResponse.json(
      { error: '결제 잔액이 남아 있어 수강 상태를 환불로 변경할 수 없습니다. 먼저 결제 환불 또는 취소를 완료해 주세요.' },
      { status: 409 },
    )
  }

  const { data, error } = await db
    .from('enrollments')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .neq('status', 'cancelled')
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '환불 처리에 실패했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '수강 상태가 변경되었습니다. 새로고침 후 확인해 주세요.' }, { status: 409 })
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ enrollment: data })
}
