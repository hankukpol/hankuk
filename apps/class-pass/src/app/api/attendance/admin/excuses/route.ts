import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'
import {
  AttendanceServiceError,
  createAttendanceExcuse,
  listAttendanceExcuses,
  logAttendanceEvent,
} from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'

const listSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive().optional(),
  enrollmentId: z.coerce.number().int().positive().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const createSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  excuseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(1000),
})

function toExcuseErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AttendanceServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return handleRouteError('attendance.admin.excuses.error', fallbackMessage, error)
}

export async function GET(req: NextRequest) {
  try {
    const parsed = listSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      subjectId: req.nextUrl.searchParams.get('subjectId') ?? undefined,
      enrollmentId: req.nextUrl.searchParams.get('enrollmentId') ?? undefined,
      fromDate: req.nextUrl.searchParams.get('fromDate') ?? undefined,
      toDate: req.nextUrl.searchParams.get('toDate') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidExcuseRequest }, { status: 400 })
    }

    if (parsed.data.fromDate && parsed.data.toDate && parsed.data.fromDate > parsed.data.toDate) {
      return NextResponse.json({ error: '조회 시작일은 종료일보다 늦을 수 없습니다.' }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const excuses = await listAttendanceExcuses(parsed.data)
    return NextResponse.json({ excuses })
  } catch (error) {
    return toExcuseErrorResponse(error, ATTENDANCE_ERROR_MESSAGES.loadExcusesFailed)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidExcuseRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const actor = guard.context.payload?.adminId ?? guard.context.payload?.staffName ?? 'admin'
    const excuse = await createAttendanceExcuse({
      ...parsed.data,
      createdBy: actor,
    })

    await logAttendanceEvent({
      course_id: parsed.data.courseId,
      event_type: 'admin_created_excuse',
      details: {
        actor,
        attendance_excuse_id: excuse.id,
        enrollment_id: excuse.enrollmentId,
        subject_id: excuse.subjectId,
        excuse_date: excuse.excuseDate,
        reason: excuse.reason,
      },
    })

    await invalidateCache('attendance')
    return NextResponse.json({ excuse }, { status: 201 })
  } catch (error) {
    return toExcuseErrorResponse(error, ATTENDANCE_ERROR_MESSAGES.createExcuseFailed)
  }
}
