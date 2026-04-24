import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getServerTenantType } from '@/lib/tenant.server'
import {
  getPaymentSettlement,
  groupSettlementRows,
  summarizeSettlementRows,
  type SettlementGroupKey,
} from '@/lib/payments/settlement'
import { parsePositiveInt } from '@/lib/utils'

function isSettlementGroupKey(value: string | null): value is SettlementGroupKey {
  return value === 'daily' || value === 'monthly' || value === 'course' || value === 'method'
}

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
    const rows = await getPaymentSettlement({
      from,
      to,
      courseId: parsePositiveInt(req.nextUrl.searchParams.get('courseId')),
      division,
    })
    const group = req.nextUrl.searchParams.get('group')
    const groupKey = isSettlementGroupKey(group) ? group : 'daily'

    return NextResponse.json({
      rows,
      summary: summarizeSettlementRows(rows),
      groups: {
        daily: groupSettlementRows(rows, 'daily'),
        monthly: groupSettlementRows(rows, 'monthly'),
        course: groupSettlementRows(rows, 'course'),
        method: groupSettlementRows(rows, 'method'),
        selected: groupSettlementRows(rows, groupKey),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '정산 데이터를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
