import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'
import {
  AttendanceServiceError,
  deleteAttendanceExcuse,
  logAttendanceEvent,
  updateAttendanceExcuse,
} from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'

const patchSchema = z.object({
  courseId: z.number().int().positive(),
  excuseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(1000),
})

const deleteSchema = z.object({
  courseId: z.number().int().positive(),
})

function toExcuseErrorResponse(error: unknown, fallbackMessage: string, action: string) {
  if (error instanceof AttendanceServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return handleRouteError(action, fallbackMessage, error)
}

async function parseExcuseId(params: Promise<{ id: string }>) {
  const resolved = await params
  const parsed = z.coerce.number().int().positive().safeParse(resolved.id)
  return parsed.success ? parsed.data : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const excuseId = await parseExcuseId(params)
    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)

    if (!excuseId || !parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidExcuseRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const actor = guard.context.payload?.adminId ?? guard.context.payload?.staffName ?? 'admin'
    const excuse = await updateAttendanceExcuse({
      id: excuseId,
      ...parsed.data,
    })

    await logAttendanceEvent({
      course_id: parsed.data.courseId,
      event_type: 'admin_updated_excuse',
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
    return NextResponse.json({ excuse })
  } catch (error) {
    return toExcuseErrorResponse(error, ATTENDANCE_ERROR_MESSAGES.updateExcuseFailed, 'attendance.admin.excuses.[id].PATCH')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const excuseId = await parseExcuseId(params)
    const body = await req.json().catch(() => null)
    const parsed = deleteSchema.safeParse(body)

    if (!excuseId || !parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidExcuseRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const actor = guard.context.payload?.adminId ?? guard.context.payload?.staffName ?? 'admin'
    const deletedExcuse = await deleteAttendanceExcuse({
      id: excuseId,
      courseId: parsed.data.courseId,
    })

    await logAttendanceEvent({
      course_id: parsed.data.courseId,
      event_type: 'admin_deleted_excuse',
      details: {
        actor,
        attendance_excuse_id: deletedExcuse.id,
        enrollment_id: deletedExcuse.enrollmentId,
        subject_id: deletedExcuse.subjectId,
        excuse_date: deletedExcuse.excuseDate,
        reason: deletedExcuse.reason,
      },
    })

    await invalidateCache('attendance')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toExcuseErrorResponse(error, ATTENDANCE_ERROR_MESSAGES.deleteExcuseFailed, 'attendance.admin.excuses.[id].DELETE')
  }
}
