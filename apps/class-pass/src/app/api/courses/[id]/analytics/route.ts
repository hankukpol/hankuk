import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getCourseAnalytics } from '@/lib/course-analytics'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '강좌 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const division = await getServerTenantType()
    const analytics = await getCourseAnalytics(courseId, division)
    if (!analytics) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json(analytics)
  } catch (error) {
    const message = error instanceof Error ? error.message : '강좌 현황을 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
