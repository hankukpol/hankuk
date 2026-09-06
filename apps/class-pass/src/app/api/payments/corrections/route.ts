import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import {
  createPaymentCorrection,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'
import { normalizeCardCompanyInput, resolveDepositorName } from '@/lib/payments/request-normalizers'
import { getServerTenantType } from '@/lib/tenant.server'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

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
  ]).default('payment_correction'),
  reason: z.string().optional().nullable(),
  cancelReceiptNo: z.string().trim().max(80).optional().nullable(),
  refundAccountLast4: z.string().trim().regex(/^\d{4}$/).optional().nullable(),
  refundedAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
})

const correctionPaymentSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['card', 'homepage', 'cash', 'bank_transfer', 'point', 'other']),
  category: z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc']).default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  cardCompany: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  depositorName: z.string().trim().max(80).optional().nullable(),
  cashReceiptApprovalNo: z.string().trim().max(80).optional().nullable(),
  items: z.array(paymentItemSchema).optional(),
})

const createCorrectionSchema = z.object({
  requestId: z.string().uuid(),
  enrollmentId: z.number().int().positive(),
  courseId: z.number().int().positive().optional(),
  refund: refundSchema,
  payment: correctionPaymentSchema,
  tuitionBillingMode: z.enum(['keep', 'match_net']).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = createCorrectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '결제 정정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    if (parsed.data.refund.method === 'card_cancel' && !parsed.data.refund.cancelReceiptNo?.trim()) {
      return NextResponse.json({ error: '카드 취소 승인번호를 입력해 주세요.' }, { status: 400 })
    }

    if (parsed.data.refund.method === 'bank_transfer' && !parsed.data.refund.refundAccountLast4) {
      return NextResponse.json({ error: '환불 입금 계좌 마지막 4자리를 입력해 주세요.' }, { status: 400 })
    }

    if (parsed.data.payment.method === 'card' && !parsed.data.payment.cardCompany?.trim()) {
      return NextResponse.json({ error: '카드 결제 시 카드사는 필수입니다.' }, { status: 400 })
    }

    if (parsed.data.payment.method === 'bank_transfer' && !resolveDepositorName(parsed.data.payment.depositorName, parsed.data.payment.bankAccountLast4)) {
      return NextResponse.json({ error: '계좌 결제 시 입금자명은 필수입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const result = await createPaymentCorrection({
      ...parsed.data,
      payment: {
        ...parsed.data.payment,
        cardCompany: parsed.data.payment.method === 'card' ? normalizeCardCompanyInput(parsed.data.payment.cardCompany) : null,
        depositorName: resolveDepositorName(parsed.data.payment.depositorName, parsed.data.payment.bankAccountLast4),
      },
    }, division, getActorStaffId(auth.payload))
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제 정정을 저장하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
