import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getCourseById, listCoursesByDivision, listMaterialsForCourse } from '@/lib/class-pass-data'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireStaffApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('staff_scan_enabled')
    if (featureError) {
      return featureError
    }

    const division = await getServerTenantType()
    const courses = await listCoursesByDivision(division, { activeOnly: true })
    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))

    if (!courseId) {
      return NextResponse.json({ courses, materials: [] })
    }

    const course = await getCourseById(courseId, division)
    if (!course) {
      return NextResponse.json({ error: '해당 강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const materials = await listMaterialsForCourse(courseId, { activeOnly: true })
    return NextResponse.json({ courses, materials })
  } catch (error) {
    return handleRouteError('distribution.staffBootstrap.GET', '스캔 초기 데이터를 불러오지 못했습니다.', error)
  }
}
