import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getCourseById } from '@/lib/class-pass-data'
import { getDesignatedSeatAttendanceDashboardData } from '@/lib/designated-seat/service'
import { getServerTenantType } from '@/lib/tenant.server'

const searchSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
}

export const dynamic = 'force-dynamic'

function getTodayKST() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const parsed = searchSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      date: req.nextUrl.searchParams.get('date') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: '지정좌석 출석 현황 요청 형식이 올바르지 않습니다.' },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json(
        { error: '강의를 찾을 수 없습니다.' },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }

    const date = parsed.data.date ?? getTodayKST()
    const payload = await getDesignatedSeatAttendanceDashboardData({
      courseId: course.id,
      date,
    })

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return handleRouteError(
      'designatedSeats.admin.attendanceDashboard.GET',
      '지정좌석 출석 현황을 불러오지 못했습니다.',
      error,
    )
  }
}
