import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { checkPaymentIntegrity } from '@/lib/payments/integrity'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const division = await getServerTenantType()
    const report = await checkPaymentIntegrity(division, {
      courseId: parsePositiveInt(req.nextUrl.searchParams.get('courseId')),
      maxEnrollments: parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? undefined,
    })

    return NextResponse.json(report)
  } catch (error) {
    return handleRouteError('payments.integrity.GET', '수납 정합성 점검 결과를 불러오지 못했습니다.', error)
  }
}
