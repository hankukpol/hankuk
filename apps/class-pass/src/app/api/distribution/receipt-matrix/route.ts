import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  getTextbookAssignmentsByCourse,
  listMaterialsForCourse,
  verifyCourseOwnership,
} from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const materialType = req.nextUrl.searchParams.get('materialType')
    if (materialType && materialType !== 'handout' && materialType !== 'textbook') {
      return NextResponse.json({ error: 'materialType 값이 올바르지 않습니다.' }, { status: 400 })
    }

    const resolvedMaterialType = materialType === 'handout' || materialType === 'textbook'
      ? materialType
      : 'handout'
    const featureError = await requireAppFeature(
      resolvedMaterialType === 'textbook'
        ? 'admin_material_management_enabled'
        : 'admin_log_view_enabled',
    )
    if (featureError) return featureError

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const materials = await listMaterialsForCourse(courseId, {
      activeOnly: true,
      materialType: resolvedMaterialType,
    })

    if (materials.length === 0) {
      return NextResponse.json({
        materials: [],
        logs: [],
        assignments: resolvedMaterialType === 'textbook' ? [] : undefined,
      })
    }

    const materialIds = materials.map((material) => material.id)
    const db = createServerClient()
    const [{ data: logs, error }, assignments] = await Promise.all([
      db
        .from('distribution_logs')
        .select('id,enrollment_id,material_id,distributed_at')
        .in('material_id', materialIds),
      resolvedMaterialType === 'textbook'
        ? getTextbookAssignmentsByCourse(courseId)
        : Promise.resolve(undefined),
    ])

    if (error) {
      return NextResponse.json({ error: '배부 로그를 불러오지 못했습니다.' }, { status: 500 })
    }

    return NextResponse.json({
      materials,
      logs: logs ?? [],
      assignments,
    })
  } catch (error) {
    return handleRouteError('distribution.receipt-matrix.GET', '수령 현황을 불러오지 못했습니다.', error)
  }
}
