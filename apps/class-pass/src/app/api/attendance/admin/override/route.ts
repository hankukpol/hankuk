import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'
import { getAttendanceTodayKey, logAttendanceEvent } from '@/lib/attendance/service'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['present', 'absent']),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidOverrideRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const { course, payload } = guard.context
    const db = createServerClient()
    const enrollment = await db
      .from('enrollments')
      .select('id')
      .eq('id', parsed.data.enrollmentId)
      .eq('course_id', course.id)
      .maybeSingle()

    if (enrollment.error || !enrollment.data) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (parsed.data.status === 'present') {
      const activeDisplaySession = parsed.data.date === getAttendanceTodayKey()
        ? await db
          .from('attendance_display_sessions')
          .select('id')
          .eq('course_id', course.id)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .maybeSingle()
        : { data: null, error: null }

      const upsertResult = await db
        .from('attendance_records')
        .upsert({
          course_id: course.id,
          enrollment_id: parsed.data.enrollmentId,
          display_session_id: activeDisplaySession.data?.id ?? null,
          device_key_hash: 'admin_override',
          attended_date: parsed.data.date,
          attended_at: new Date().toISOString(),
        }, {
          onConflict: 'course_id,enrollment_id,attended_date',
        })

      if (upsertResult.error) {
        return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.overrideFailed }, { status: 500 })
      }

      await logAttendanceEvent({
        course_id: course.id,
        event_type: 'admin_marked_present',
        details: {
          actor: payload?.adminId ?? payload?.staffName ?? 'admin',
          enrollment_id: parsed.data.enrollmentId,
          date: parsed.data.date,
        },
      })
    } else {
      const deleteResult = await db
        .from('attendance_records')
        .delete()
        .eq('course_id', course.id)
        .eq('enrollment_id', parsed.data.enrollmentId)
        .eq('attended_date', parsed.data.date)

      if (deleteResult.error) {
        return NextResponse.json({ error: '결석 처리에 실패했습니다.' }, { status: 500 })
      }

      await logAttendanceEvent({
        course_id: course.id,
        event_type: 'admin_marked_absent',
        details: {
          actor: payload?.adminId ?? payload?.staffName ?? 'admin',
          enrollment_id: parsed.data.enrollmentId,
          date: parsed.data.date,
        },
      })
    }

    await invalidateCache('attendance')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleRouteError('attendance.admin.override.POST', ATTENDANCE_ERROR_MESSAGES.overrideFailed, error)
  }
}
