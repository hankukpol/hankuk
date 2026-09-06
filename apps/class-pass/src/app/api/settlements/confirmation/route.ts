import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import {
  confirmDailySettlement,
  getDailySettlementConfirmation,
} from '@/lib/payments/settlement-confirmation'
import { getPaymentServiceMessage, getPaymentServiceStatus } from '@/lib/payments/service'
import { getServerTenantType } from '@/lib/tenant.server'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const confirmSchema = z.object({
  date: dateSchema,
  memo: z.string().max(500).optional().nullable(),
  expectedManifest: z.object({
    version: z.literal(1),
    payments: z.array(z.record(z.unknown())),
    refunds: z.array(z.record(z.unknown())),
    items: z.array(z.record(z.unknown())),
    confirmations: z.array(z.record(z.unknown())),
  }).strict(),
})

export async function GET(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  const date = req.nextUrl.searchParams.get('date')
  const parsedDate = dateSchema.safeParse(date)
  if (!parsedDate.success) {
    return NextResponse.json({ error: '정산일 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const division = await getServerTenantType()
    const result = await getDailySettlementConfirmation(parsedDate.data, division)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '정산 확인 상태를 불러오지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  const body = await req.json().catch(() => null)
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '정산 확인 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const actorStaffId = getActorStaffId(auth.payload)
  if (!actorStaffId) {
    return NextResponse.json({ error: '정산 확인자를 확인하지 못했습니다. 관리자 계정으로 다시 로그인해 주세요.' }, { status: 400 })
  }

  try {
    const division = await getServerTenantType()
    const result = await confirmDailySettlement({
      date: parsed.data.date,
      division,
      actorStaffId,
      memo: parsed.data.memo,
      expectedManifest: parsed.data.expectedManifest,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '정산 확인을 저장하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
