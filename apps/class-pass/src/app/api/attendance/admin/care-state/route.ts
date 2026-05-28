import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  attendanceCareJson,
  requireCareAdminCourseRequest,
  requireAttendanceCareRateLimit,
  withAttendanceCareHeaders,
} from '@/lib/attendance/route-helpers'
import {
  AttendanceServiceError,
  type EnrollmentCareState,
  upsertEnrollmentCareState,
} from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'

const putSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  subjectId: z.number().int().positive().nullable().optional(),
  state: z.enum(['pending', 'needs_contact', 'contacted', 'meeting_scheduled']),
})

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AttendanceServiceError) {
    return attendanceCareJson({ error: error.message }, { status: error.status })
  }

  return withAttendanceCareHeaders(handleRouteError('attendance.admin.careState.error', fallbackMessage, error))
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = putSchema.safeParse(body)

    if (!parsed.success) {
      return attendanceCareJson(
        { error: '관리 상태 요청 형식이 올바르지 않습니다.' },
        { status: 400 },
      )
    }

    const guard = await requireCareAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return withAttendanceCareHeaders(guard.response)
    }

    const rateLimitResponse = await requireAttendanceCareRateLimit(guard.context.payload, parsed.data.courseId)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const actor = guard.context.payload?.adminId
      ?? guard.context.payload?.staffName
      ?? null

    const { state } = await upsertEnrollmentCareState({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      subjectId: parsed.data.subjectId ?? null,
      state: parsed.data.state as EnrollmentCareState,
      updatedBy: actor,
    })

    await invalidateCache('attendance')
    return attendanceCareJson({ state })
  } catch (error) {
    return toErrorResponse(error, '관리 상태를 변경하지 못했습니다.')
  }
}

export const dynamic = 'force-dynamic'
