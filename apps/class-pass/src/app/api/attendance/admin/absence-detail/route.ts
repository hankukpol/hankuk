import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getAttendanceAbsenceDetail } from '@/lib/attendance/service'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  enrollmentId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      enrollmentId: req.nextUrl.searchParams.get('enrollmentId'),
      subjectId: req.nextUrl.searchParams.has('subjectId')
        ? req.nextUrl.searchParams.get('subjectId')
        : undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidAbsenceReportRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    return NextResponse.json(await getAttendanceAbsenceDetail({
      ...parsed.data,
      attendanceStartDate: guard.context.course.enrolled_from,
    }))
  } catch (error) {
    return handleRouteError(
      'attendance.admin.absenceDetail.GET',
      ATTENDANCE_ERROR_MESSAGES.loadAbsenceReportFailed,
      error,
    )
  }
}
