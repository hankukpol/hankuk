import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getDashboardStats } from '@/lib/dashboard-stats'
import { getServerTenantType } from '@/lib/tenant.server'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const division = await getServerTenantType()
    const stats = await getDashboardStats(division)

    return NextResponse.json(stats)
  } catch (error) {
    return handleRouteError('dashboard.stats.GET', '대시보드 통계를 불러오지 못했습니다.', error)
  }
}
