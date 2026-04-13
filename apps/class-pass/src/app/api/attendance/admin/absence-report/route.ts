import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getAttendanceAbsenceReport } from '@/lib/attendance/service'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  threshold: z.coerce.number().int().min(1).max(30).default(2),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      threshold: req.nextUrl.searchParams.get('threshold') ?? 2,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidAbsenceReportRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    return NextResponse.json(await getAttendanceAbsenceReport(parsed.data))
  } catch (error) {
    return handleRouteError(
      'attendance.admin.absenceReport.GET',
      ATTENDANCE_ERROR_MESSAGES.loadAbsenceReportFailed,
      error,
    )
  }
}
