import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getServerTenantType } from '@/lib/tenant.server'
import {
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  listSettlementDetailPayments,
} from '@/lib/payments/service'
import { parsePositiveInt } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: '조회 시작일과 종료일이 필요합니다.' }, { status: 400 })
  }

  try {
    const division = await getServerTenantType()
    const payments = await listSettlementDetailPayments({
      from,
      to,
      courseId: parsePositiveInt(req.nextUrl.searchParams.get('courseId')),
    }, division)

    return NextResponse.json({ payments })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '정산 상세 데이터를 불러오지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
