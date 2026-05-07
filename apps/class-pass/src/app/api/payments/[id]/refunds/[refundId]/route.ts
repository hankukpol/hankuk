import { NextRequest, NextResponse } from 'next/server'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import {
  deleteRefund,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; refundId: string }> },
) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const { id, refundId } = await params
    const paymentId = parsePositiveInt(id)
    const parsedRefundId = parsePositiveInt(refundId)
    if (!paymentId || !parsedRefundId) {
      return NextResponse.json({ error: '결제 또는 환불 ID가 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const payment = await deleteRefund(paymentId, parsedRefundId, division, getActorStaffId(auth.payload))
    return NextResponse.json({ payment })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '환불 취소를 처리하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
