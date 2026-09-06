import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import {
  createRefundBundle,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'
import { getServerTenantType } from '@/lib/tenant.server'

const refundSchema = z.object({
  paymentId: z.number().int().positive(),
  amount: z.number().int().positive(),
  method: z.enum(['card_cancel', 'cash', 'bank_transfer', 'point', 'other']),
  reasonCategory: z.enum([
    'withdrawal',
    'transfer',
    'schedule_change',
    'change_of_mind',
    'payment_correction',
    'policy_application',
    'other',
  ]).default('other'),
  reason: z.string().optional().nullable(),
  cancelReceiptNo: z.string().trim().max(80).optional().nullable(),
  refundAccountLast4: z.string().trim().regex(/^\d{4}$/).optional().nullable(),
  refundedAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
})

const createRefundBundleSchema = z.object({
  requestId: z.string().uuid(),
  endEnrollment: z.boolean().optional(),
  refunds: z.array(refundSchema).min(1).max(20),
})

export async function POST(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = createRefundBundleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '환불 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const missingCardCancelReceipt = parsed.data.refunds.some((refund) => (
      refund.method === 'card_cancel' && !refund.cancelReceiptNo?.trim()
    ))
    if (missingCardCancelReceipt) {
      return NextResponse.json({ error: '카드 취소 승인번호를 입력해 주세요.' }, { status: 400 })
    }

    const missingBankTransferAccount = parsed.data.refunds.some((refund) => (
      refund.method === 'bank_transfer' && !refund.refundAccountLast4
    ))
    if (missingBankTransferAccount) {
      return NextResponse.json({ error: '환불 입금 계좌 마지막 4자리를 입력해 주세요.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const result = await createRefundBundle(parsed.data, division, getActorStaffId(auth.payload))
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '환불을 처리하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
