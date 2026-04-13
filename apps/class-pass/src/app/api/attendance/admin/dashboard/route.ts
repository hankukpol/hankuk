import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getAttendanceDashboardData } from '@/lib/attendance/service'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      date: req.nextUrl.searchParams.get('date') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidDashboardRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    return NextResponse.json(await getAttendanceDashboardData(parsed.data))
  } catch (error) {
    return handleRouteError(
      'attendance.admin.dashboard.GET',
      ATTENDANCE_ERROR_MESSAGES.loadDashboardFailed,
      error,
    )
  }
}
