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
  appendEnrollmentCareNote,
  listEnrollmentCareNoteHistory,
} from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'

const listSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  enrollmentId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

const createSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  subjectId: z.number().int().positive().nullable().optional(),
  body: z.string().min(1).max(500),
})

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AttendanceServiceError) {
    return attendanceCareJson({ error: error.message }, { status: error.status })
  }

  return withAttendanceCareHeaders(handleRouteError('attendance.admin.careNotes.error', fallbackMessage, error))
}

export async function GET(req: NextRequest) {
  try {
    const rawSubject = req.nextUrl.searchParams.get('subjectId')
    const parsed = listSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      enrollmentId: req.nextUrl.searchParams.get('enrollmentId'),
      subjectId: rawSubject === null || rawSubject === '' ? undefined : rawSubject,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })

    if (!parsed.success) {
      return attendanceCareJson(
        { error: '메모 조회 요청 형식이 올바르지 않습니다.' },
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

    const notes = await listEnrollmentCareNoteHistory({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      subjectId: parsed.data.subjectId ?? null,
      limit: parsed.data.limit,
    })

    return attendanceCareJson({ notes })
  } catch (error) {
    return toErrorResponse(error, '메모 히스토리를 불러오지 못했습니다.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return attendanceCareJson(
        { error: '메모 등록 요청 형식이 올바르지 않습니다.' },
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

    const note = await appendEnrollmentCareNote({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      subjectId: parsed.data.subjectId ?? null,
      body: parsed.data.body,
      createdBy: guard.context.payload?.adminId ?? null,
      createdByName: guard.context.payload?.staffName ?? null,
    })

    await invalidateCache('attendance')
    return attendanceCareJson({ note }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error, '메모를 등록하지 못했습니다.')
  }
}

export const dynamic = 'force-dynamic'
