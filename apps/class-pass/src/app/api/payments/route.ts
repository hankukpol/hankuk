import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { StaffJwtPayload } from '@/types/database'
import {
  createEnrollmentForPayment,
  createPayment,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  listPayments,
} from '@/lib/payments/service'
import type { PaymentMethod, PaymentStatus } from '@/lib/payments/types'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().positive(),
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
  amount: z.number().int().positive(),
  method: z.enum(['card', 'cash', 'bank_transfer', 'point', 'mixed', 'other']),
  category: z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc']).default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  items: z.array(paymentItemSchema).optional(),
})

function getActorStaffId(payload: StaffJwtPayload | null) {
  return payload?.accountId ?? payload?.membershipId ?? null
}

function parsePaymentMethod(value: string | null): PaymentMethod | null {
  return value === 'card'
    || value === 'cash'
    || value === 'bank_transfer'
    || value === 'point'
    || value === 'mixed'
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

    const division = await getServerTenantType()
    let enrollmentId = parsed.data.enrollmentId ?? null
    let generatedPin: string | null = null

    if (!enrollmentId && parsed.data.enrollment) {
      const created = await createEnrollmentForPayment(parsed.data.enrollment, division)
      enrollmentId = created.enrollment.id
      generatedPin = created.generatedPin
    }

    if (!enrollmentId) {
      return NextResponse.json({ error: '수강생 ID 또는 신규 수강생 정보가 필요합니다.' }, { status: 400 })
    }

    const payment = await createPayment({
      ...parsed.data,
      enrollmentId,
      courseId: parsed.data.courseId ?? parsed.data.enrollment?.courseId,
    }, division, getActorStaffId(auth.payload))

    return NextResponse.json({ payment, generated_pin: generatedPin ?? undefined }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제를 생성하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
