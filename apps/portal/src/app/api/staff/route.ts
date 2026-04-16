import { NextRequest, NextResponse } from 'next/server'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { listStaff } from '@/lib/staff-management'

export async function GET(request: NextRequest) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response) {
    return auth.response
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const page = Number(searchParams.get('page') ?? '1')
    const limit = Number(searchParams.get('limit') ?? '20')

    const result = await listStaff({
      search: searchParams.get('search') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      app: searchParams.get('app') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[portal-staff] failed to list staff.', error)
    return NextResponse.json({ error: '직원 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}
