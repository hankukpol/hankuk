import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'
import {
  AttendanceServiceError,
  approveAttendanceDeviceReRegistration,
  resetCourseAttendanceDeviceBindings,
  resetAttendanceDeviceBinding,
} from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import type { StaffJwtPayload } from '@/types/database'

const schema = z.discriminatedUnion('action', [
  z.object({
    courseId: z.number().int().positive(),
    enrollmentId: z.number().int().positive(),
    action: z.enum(['approve_pending', 'reset']),
    reason: z.string().max(300).optional().nullable(),
  }),
  z.object({
    courseId: z.number().int().positive(),
    action: z.literal('reset_course'),
    reason: z.string().max(300).optional().nullable(),
  }),
])

function getActor(payload: StaffJwtPayload | null) {
  if (!payload) {
    return 'admin'
  }

  if (payload.adminId) {
    return String(payload.adminId)
  }

  if (payload.staffName) {
    return String(payload.staffName)
  }

  if (payload.accountId) {
    return `account:${payload.accountId}`
  }

  return 'admin'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidDashboardRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const { course, payload } = guard.context
    const actor = getActor(payload)

    if (parsed.data.action === 'reset_course') {
      const result = await resetCourseAttendanceDeviceBindings({
        courseId: course.id,
        actor,
        reason: parsed.data.reason,
      })

      await invalidateCache('enrollments')
      await invalidateCache('attendance')

      return NextResponse.json(result)
    }

    const db = createServerClient()
    const enrollment = await db
      .from('enrollments')
      .select('id')
      .eq('id', parsed.data.enrollmentId)
      .eq('course_id', course.id)
      .maybeSingle()

    if (enrollment.error) {
      return NextResponse.json({ error: '수강생을 확인하지 못했습니다.' }, { status: 500 })
    }

    if (!enrollment.data) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const device = parsed.data.action === 'approve_pending'
      ? await approveAttendanceDeviceReRegistration({
        courseId: course.id,
        enrollmentId: parsed.data.enrollmentId,
        actor,
      })
      : await resetAttendanceDeviceBinding({
        courseId: course.id,
        enrollmentId: parsed.data.enrollmentId,
        actor,
        reason: parsed.data.reason,
      })

    await invalidateCache('enrollments')
    await invalidateCache('attendance')

    return NextResponse.json({ device })
  } catch (error) {
    if (error instanceof AttendanceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return handleRouteError('attendance.admin.device-bindings.POST', '출석 기기 재등록 요청을 처리하지 못했습니다.', error)
  }
}
