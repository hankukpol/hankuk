import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { StaffJwtPayload } from '@/types/database'
import {
  createRefund,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'

const createRefundSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['card_cancel', 'cash', 'bank_transfer', 'point', 'other']),
  reason: z.string().optional().nullable(),
  refundedAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
})

function getActorStaffId(payload: StaffJwtPayload | null) {
  return payload?.accountId ?? payload?.membershipId ?? null
}

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

    const body = await req.json().catch(() => null)
    const parsed = createRefundSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '환불 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const result = await createRefund(paymentId, parsed.data, division, getActorStaffId(auth.payload))
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '환불을 처리하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
