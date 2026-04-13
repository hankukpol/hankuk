import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { listMaterialsForCourse, verifyCourseOwnership } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

/**
 * Lightweight endpoint for the receipts matrix tab.
 * Returns only active materials + minimal distribution log rows
 * (id, enrollment_id, material_id, distributed_at) without JOINs.
 */
export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_log_view_enabled')
    if (featureError) return featureError

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const materials = await listMaterialsForCourse(courseId, { activeOnly: true })
    if (materials.length === 0) {
      return NextResponse.json({ materials: [], logs: [] })
    }

    const materialIds = materials.map((m) => m.id)
    const db = createServerClient()

    // Direct query: no JOINs, only the columns the receipts matrix needs
    const { data: logs, error } = await db
      .from('distribution_logs')
      .select('id,enrollment_id,material_id,distributed_at')
      .in('material_id', materialIds)

    if (error) {
      return NextResponse.json({ error: '배부 로그를 불러오지 못했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ materials, logs: logs ?? [] })
  } catch (error) {
    return handleRouteError('distribution.receipt-matrix.GET', '수령 현황을 불러오지 못했습니다.', error)
  }
}
