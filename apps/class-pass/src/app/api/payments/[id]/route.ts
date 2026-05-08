import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import {
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  updatePayment,
} from '@/lib/payments/service'
import { normalizeCardCompanyInput, resolveDepositorName } from '@/lib/payments/request-normalizers'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

const patchPaymentSchema = z.object({
  amount: z.number().int().min(0).optional(),
  method: z.enum(['card', 'homepage', 'cash', 'bank_transfer', 'point', 'free', 'other']).optional(),
  category: z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc']).optional(),
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

export async function PATCH(
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
    const parsed = patchPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '결제 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const payment = await updatePayment(paymentId, {
      ...parsed.data,
      cardCompany: parsed.data.method === 'card' || (!parsed.data.method && parsed.data.cardCompany !== undefined)
        ? normalizeCardCompanyInput(parsed.data.cardCompany)
        : parsed.data.cardCompany,
      depositorName: parsed.data.depositorName !== undefined || parsed.data.bankAccountLast4 !== undefined
        ? resolveDepositorName(parsed.data.depositorName, parsed.data.bankAccountLast4)
        : undefined,
    }, division, getActorStaffId(auth.payload))
    return NextResponse.json({ payment })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제를 수정하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
