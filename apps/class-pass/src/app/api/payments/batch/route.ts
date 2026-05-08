import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'
import {
  createPaymentBundle,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
} from '@/lib/payments/service'
import { normalizeCardCompanyInput, resolveDepositorName } from '@/lib/payments/request-normalizers'
import { getServerTenantType } from '@/lib/tenant.server'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

const paymentSchema = z.object({
  amount: z.number().int().min(0),
  method: z.enum(['card', 'homepage', 'cash', 'bank_transfer', 'point', 'free', 'other']),
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

const billingSchema = z.object({
  expectedAmount: z.number().int().min(0),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().optional().nullable(),
  payableAmount: z.number().int().min(0),
  tuitionExempt: z.boolean().default(false),
  tuitionExemptReason: z.string().optional().nullable(),
})

const batchObjectSchema = z.object({
  enrollmentId: z.number().int().positive(),
  courseId: z.number().int().positive().optional(),
  billing: billingSchema.optional(),
  payments: z.array(paymentSchema).min(1).max(20),
})

const batchArraySchema = z.array(paymentSchema.extend({
  enrollmentId: z.number().int().positive(),
  courseId: z.number().int().positive().optional(),
})).min(1).max(20)

const createBatchSchema = z.union([batchObjectSchema, batchArraySchema])

function normalizeBatchInput(input: z.infer<typeof createBatchSchema>): z.infer<typeof batchObjectSchema> {
  if (!Array.isArray(input)) {
    return input
  }

  const [first] = input
  const enrollmentId = first.enrollmentId
  const courseId = first.courseId
  const sameTarget = input.every((payment) => (
    payment.enrollmentId === enrollmentId && payment.courseId === courseId
  ))

  if (!sameTarget) {
    throw new Error('한 번의 batch 요청에는 같은 수강생의 결제만 포함할 수 있습니다.')
  }

  return {
    enrollmentId,
    courseId,
    payments: input.map((payment) => ({
      amount: payment.amount,
      method: payment.method,
      category: payment.category,
      paidAt: payment.paidAt,
      memo: payment.memo,
      cardLast4: payment.cardLast4,
      cardCompany: payment.method === 'card' ? normalizeCardCompanyInput(payment.cardCompany) : null,
      installmentMonths: payment.installmentMonths,
      bankName: payment.bankName,
      depositorName: resolveDepositorName(payment.depositorName, payment.bankAccountLast4),
      cashReceiptApprovalNo: payment.cashReceiptApprovalNo,
      items: payment.items,
    })),
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateStaffRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = createBatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'batch 결제 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const input = normalizeBatchInput(parsed.data)

    const cardWithoutCompany = input.payments.find(
      (p) => p.method === 'card' && !p.cardCompany?.trim(),
    )
    if (cardWithoutCompany) {
      return NextResponse.json({ error: '카드 결제 시 카드사는 필수입니다.' }, { status: 400 })
    }

    const bankTransferWithoutAccount = input.payments.find(
      (p) => p.method === 'bank_transfer' && !resolveDepositorName(p.depositorName, p.bankAccountLast4),
    )
    if (bankTransferWithoutAccount) {
      return NextResponse.json({ error: '계좌 결제 시 입금자명은 필수입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const payments = await createPaymentBundle({
      enrollmentId: input.enrollmentId,
      courseId: input.courseId,
      billing: input.billing,
      payments: input.payments.map((payment) => ({
        ...payment,
        cardCompany: payment.method === 'card' ? normalizeCardCompanyInput(payment.cardCompany) : null,
        depositorName: resolveDepositorName(payment.depositorName, payment.bankAccountLast4),
      })),
    }, division, getActorStaffId(auth.payload))

    return NextResponse.json({ payments }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, 'batch 결제를 저장하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
