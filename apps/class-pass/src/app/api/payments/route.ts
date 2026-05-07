import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import {
  createEnrollmentForPayment,
  createPaymentBundle,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  listPayments,
} from '@/lib/payments/service'
import type { PaymentMethod, PaymentStatus } from '@/lib/payments/types'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

const writablePaymentMethodSchema = z.enum(['card', 'homepage', 'cash', 'bank_transfer', 'point', 'free', 'other'])

const paymentCategorySchema = z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc'])

const bundledPaymentSchema = z.object({
  amount: z.number().int().min(0),
  method: writablePaymentMethodSchema,
  category: paymentCategorySchema.default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  cardCompany: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
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

const embeddedEnrollmentSchema = z.object({
  courseId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(4),
  examNumber: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  customData: z.record(z.string()).optional(),
})

const createPaymentSchema = z.object({
  enrollmentId: z.number().int().positive().optional(),
  courseId: z.number().int().positive().optional(),
  enrollment: embeddedEnrollmentSchema.optional(),
  amount: z.number().int().min(0).optional(),
  method: writablePaymentMethodSchema.optional(),
  category: paymentCategorySchema.default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  cardCompany: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  cashReceiptApprovalNo: z.string().trim().max(80).optional().nullable(),
  billing: billingSchema.optional(),
  payments: z.array(bundledPaymentSchema).optional(),
  items: z.array(paymentItemSchema).optional(),
})

function getFreePaymentValidationError(input: z.infer<typeof createPaymentSchema>) {
  if (input.method !== 'free') {
    return null
  }

  if (input.amount !== 0) {
    return '무료 수강은 결제 금액이 0원이어야 합니다.'
  }

  const itemTotal = (input.items ?? []).reduce((sum, item) => sum + item.amount, 0)
  if (itemTotal !== 0) {
    return '무료 수강의 결제 항목 합계는 0원이어야 합니다.'
  }

  return null
}

function getTopLevelPayment(input: z.infer<typeof createPaymentSchema>): z.infer<typeof bundledPaymentSchema> | null {
  if (input.amount === undefined || input.method === undefined) {
    return null
  }

  return {
    amount: input.amount,
    method: input.method,
    category: input.category,
    paidAt: input.paidAt,
    memo: input.memo,
    cardLast4: input.cardLast4,
    cardCompany: input.cardCompany,
    installmentMonths: input.installmentMonths,
    bankName: input.bankName,
    bankAccountLast4: input.bankAccountLast4,
    cashReceiptApprovalNo: input.cashReceiptApprovalNo,
    items: input.items,
  }
}

function getBundledPayments(input: z.infer<typeof createPaymentSchema>) {
  if (input.payments && input.payments.length > 0) {
    return input.payments
  }

  const topLevel = getTopLevelPayment(input)
  return topLevel ? [topLevel] : []
}

function getBundledPaymentPreflightError(payments: z.infer<typeof bundledPaymentSchema>[]) {
  if (payments.length === 0) {
    return '저장할 결제 수단이 없습니다.'
  }

  const cardWithoutCompany = payments.find(
    (payment) => payment.method === 'card' && !payment.cardCompany?.trim(),
  )
  if (cardWithoutCompany) {
    return '카드 결제 시 카드사는 필수입니다.'
  }

  const invalidCardLast4 = payments.find(
    (payment) => payment.cardLast4 && !/^\d{4}$/.test(payment.cardLast4.trim()),
  )
  if (invalidCardLast4) {
    return '카드 마지막 번호는 숫자 4자리여야 합니다.'
  }

  const bankTransferWithoutAccount = payments.find(
    (payment) => (
      payment.method === 'bank_transfer'
      && !/^\d{4}$/.test(payment.bankAccountLast4?.trim() ?? '')
    ),
  )
  if (bankTransferWithoutAccount) {
    return '계좌 결제 시 계좌 마지막 4자리는 필수입니다.'
  }

  const invalidPaidAt = payments.find((payment) => {
    if (!payment.paidAt?.trim()) {
      return false
    }

    const timestamp = Date.parse(payment.paidAt)
    return Number.isNaN(timestamp)
  })
  if (invalidPaidAt) {
    return '수납일시를 정확히 입력해 주세요.'
  }

  return null
}

function parsePaymentMethod(value: string | null): PaymentMethod | null {
  return value === 'card'
    || value === 'homepage'
    || value === 'cash'
    || value === 'bank_transfer'
    || value === 'point'
    || value === 'mixed'
    || value === 'free'
    || value === 'other'
    ? value
    : null
}

function parsePaymentStatus(value: string | null): PaymentStatus | null {
  return value === 'paid'
    || value === 'partial_refunded'
    || value === 'fully_refunded'
    || value === 'voided'
    ? value
    : null
}

export async function GET(req: NextRequest) {
  const auth = await authenticateStaffRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const division = await getServerTenantType()
    const payments = await listPayments({
      courseId: parsePositiveInt(req.nextUrl.searchParams.get('courseId')),
      enrollmentId: parsePositiveInt(req.nextUrl.searchParams.get('enrollmentId')),
      from: req.nextUrl.searchParams.get('from'),
      to: req.nextUrl.searchParams.get('to'),
      method: parsePaymentMethod(req.nextUrl.searchParams.get('method')),
      status: parsePaymentStatus(req.nextUrl.searchParams.get('status')),
      limit: parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? 200,
    }, division)

    return NextResponse.json({ payments })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제 목록을 불러오지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateStaffRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = createPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '결제 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    if (!parsed.data.payments?.length && (parsed.data.amount === undefined || parsed.data.method === undefined)) {
      return NextResponse.json({ error: '결제 금액과 결제 수단이 필요합니다.' }, { status: 400 })
    }

    const freePaymentError = getFreePaymentValidationError(parsed.data)
    if (freePaymentError) {
      return NextResponse.json({ error: freePaymentError }, { status: 400 })
    }

    const bundledPayments = getBundledPayments(parsed.data)
    const paymentPreflightError = getBundledPaymentPreflightError(bundledPayments)
    if (paymentPreflightError) {
      return NextResponse.json({ error: paymentPreflightError }, { status: 400 })
    }

    const division = await getServerTenantType()
    let enrollmentId = parsed.data.enrollmentId ?? null
    let generatedPin: string | null = null

    if (
      !enrollmentId
      && parsed.data.enrollment
      && !parsed.data.billing
      && bundledPayments.some((payment) => (payment.category ?? 'tuition') === 'tuition' && payment.amount > 0)
    ) {
      return NextResponse.json({ error: '신규 수강료 결제는 청구 정보를 함께 저장해 주세요.' }, { status: 400 })
    }

    if (!enrollmentId && parsed.data.enrollment) {
      const created = await createEnrollmentForPayment(parsed.data.enrollment, division)
      enrollmentId = created.enrollment.id
      generatedPin = created.generatedPin
    }

    if (!enrollmentId) {
      return NextResponse.json({ error: '수강생 ID 또는 신규 수강생 정보가 필요합니다.' }, { status: 400 })
    }

    const shouldReturnBundleResponse = Boolean(parsed.data.billing || parsed.data.payments?.length || bundledPayments.length > 1)
    const payments = await createPaymentBundle({
      enrollmentId,
      courseId: parsed.data.courseId ?? parsed.data.enrollment?.courseId,
      billing: parsed.data.billing,
      payments: bundledPayments,
    }, division, getActorStaffId(auth.payload))

    if (shouldReturnBundleResponse) {
      return NextResponse.json(
        { payments, generated_pin: generatedPin ?? undefined },
        {
          status: 201,
          ...(generatedPin ? { headers: { 'Cache-Control': 'no-store, max-age=0' } } : {}),
        },
      )
    }

    const payment = payments[0]
    if (!payment) {
      return NextResponse.json({ error: '생성된 결제 내역을 확인하지 못했습니다.' }, { status: 500 })
    }

    return NextResponse.json(
      { payment, generated_pin: generatedPin ?? undefined },
      {
        status: 201,
        ...(generatedPin ? { headers: { 'Cache-Control': 'no-store, max-age=0' } } : {}),
      },
    )
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제를 생성하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
