import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { getAppConfig } from '@/lib/app-config'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'
import { listCoursesByDivision, listMaterialsForCourse } from '@/lib/class-pass-data'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const { payload, actingRole, error } = await authenticateStaffRequest(req)
    if (error) {
      return error
    }

    const division = await getServerTenantType()
    const appConfig = await getAppConfig()
    const activeCourses = await listCoursesByDivision(division, { activeOnly: true })
    const qrDistributionCourses = activeCourses.filter((course) => course.feature_qr_distribution)
    const qrDistributionCourseIds = qrDistributionCourses.map((course) => course.id)
    const materialCourseRows = qrDistributionCourseIds.length > 0
      ? unwrapSupabaseResult(
        'distribution.staffBootstrap.materialCourses',
        await createServerClient()
          .from('materials')
          .select('course_id')
          .in('course_id', qrDistributionCourseIds)
          .eq('is_active', true),
      ) as Array<{ course_id: number }> | null
      : []
    const courseIdsWithActiveMaterials = new Set(
      (materialCourseRows ?? []).map((row) => Number(row.course_id)),
    )
    const courses = qrDistributionCourses.filter((course) => courseIdsWithActiveMaterials.has(course.id))
    const requestedCourseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    const selectedCourseId = requestedCourseId ?? courses[0]?.id ?? null

    if (requestedCourseId && !courses.some((course) => course.id === requestedCourseId)) {
      return NextResponse.json({ error: '해당 강의를 찾을 수 없습니다.' }, { status: 404 })
    }

    const materials = selectedCourseId
      ? await listMaterialsForCourse(selectedCourseId, { activeOnly: true })
      : []

    return NextResponse.json({
      session: {
        role: actingRole === 'staff' ? 'staff' : 'admin',
        division: payload?.division,
        adminId: actingRole === 'admin' ? payload?.adminId ?? '' : undefined,
      },
      staffScanEnabled: appConfig.staff_scan_enabled,
      staffQuickEnabled: appConfig.staff_quick_distribution_enabled,
      selectedCourseId,
      courses,
      materials,
    })
  } catch (error) {
    return handleRouteError('distribution.staffBootstrap.GET', '스캔 초기 데이터를 불러오지 못했습니다.', error)
  }
}
