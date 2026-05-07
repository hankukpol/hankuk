import { NextRequest, NextResponse } from 'next/server'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import {
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  voidPayment,
} from '@/lib/payments/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const { id } = await params
    const paymentId = parsePositiveInt(id)
    if (!paymentId) {
      return NextResponse.json({ error: '결제 ID가 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const payment = await voidPayment(paymentId, division, getActorStaffId(auth.payload))
    return NextResponse.json({ payment })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제를 취소하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
