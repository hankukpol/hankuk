import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  hasCourseAttendanceStarted,
  requireAttendanceAdminCourseRequest,
} from '@/lib/attendance/route-helpers'
import { logAttendanceEvent } from '@/lib/attendance/service'
import {
  createOpaqueDisplayToken,
  hashToken,
} from '@/lib/attendance/token'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { withTenantPrefix } from '@/lib/tenant'

const postSchema = z.object({
  courseId: z.number().int().positive(),
  durationMinutes: z.number().int().min(1).max(720).default(10),
  subjectId: z.number().int().positive().optional().nullable(),
})

const deleteSchema = z.object({
  courseId: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidDisplaySessionRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const { course, division, payload } = guard.context
    if (!hasCourseAttendanceStarted(course)) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.attendanceNotStarted }, { status: 409 })
    }

    const db = createServerClient()
    const nowIso = new Date().toISOString()

    if (parsed.data.subjectId == null) {
      const existingSubjects = await db
        .from('course_subjects')
        .select('id')
        .eq('course_id', course.id)
        .limit(1)

      if (existingSubjects.error) {
        return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.startSessionFailed }, { status: 500 })
      }

      if ((existingSubjects.data ?? []).length > 0) {
        return NextResponse.json(
          { error: '과목이 있는 강좌는 과목을 선택한 뒤 출석을 시작할 수 있습니다.' },
          { status: 409 },
        )
      }
    }

    if (parsed.data.subjectId != null) {
      const subject = await db
        .from('course_subjects')
        .select('id')
        .eq('id', parsed.data.subjectId)
        .eq('course_id', course.id)
        .maybeSingle()

      if (subject.error || !subject.data) {
        return NextResponse.json({ error: '선택한 과목을 찾을 수 없습니다.' }, { status: 404 })
      }
    }

    await db
      .from('attendance_display_sessions')
      .update({ revoked_at: nowIso, last_seen_at: nowIso })
      .eq('course_id', course.id)
      .is('revoked_at', null)

    const rawToken = createOpaqueDisplayToken()
    const expiresAt = new Date(Date.now() + parsed.data.durationMinutes * 60 * 1000).toISOString()
    const insertResult = await db
      .from('attendance_display_sessions')
      .insert({
        course_id: course.id,
        subject_id: parsed.data.subjectId ?? null,
        display_token_hash: hashToken(rawToken),
        created_by: payload?.adminId ?? payload?.staffName ?? 'admin',
        expires_at: expiresAt,
        last_seen_at: nowIso,
      })
      .select('*')
      .single()

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.startSessionFailed }, { status: 500 })
    }

    await db
      .from('courses')
      .update({
        attendance_open: true,
        updated_at: nowIso,
      })
      .eq('id', course.id)
      .eq('division', division)

    await logAttendanceEvent({
      course_id: course.id,
      event_type: 'display_session_started',
      details: {
        display_session_id: insertResult.data.id,
        actor: payload?.adminId ?? payload?.staffName ?? 'admin',
        duration_minutes: parsed.data.durationMinutes,
        subject_id: parsed.data.subjectId ?? null,
      },
    })

    await invalidateCache('attendance')
    await invalidateCache('courses')

    const displayUrl = `${req.nextUrl.origin}${withTenantPrefix(
      `/attendance-display/${course.id}?token=${encodeURIComponent(rawToken)}`,
      division,
    )}`

    return NextResponse.json({
      session: {
        id: insertResult.data.id,
        expires_at: expiresAt,
      },
      displayUrl,
    })
  } catch (error) {
    return handleRouteError(
      'attendance.admin.display.POST',
      ATTENDANCE_ERROR_MESSAGES.startSessionFailed,
      error,
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = deleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidDisplayStopRequest }, { status: 400 })
    }

    const guard = await requireAttendanceAdminCourseRequest(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const { course, division, payload } = guard.context
    const db = createServerClient()
    const nowIso = new Date().toISOString()

    await db
      .from('attendance_display_sessions')
      .update({ revoked_at: nowIso, last_seen_at: nowIso })
      .eq('course_id', course.id)
      .is('revoked_at', null)

    await db
      .from('courses')
      .update({
        attendance_open: false,
        updated_at: nowIso,
      })
      .eq('id', course.id)
      .eq('division', division)

    await logAttendanceEvent({
      course_id: course.id,
      event_type: 'display_session_stopped',
      details: {
        actor: payload?.adminId ?? payload?.staffName ?? 'admin',
      },
    })

    await invalidateCache('attendance')
    await invalidateCache('courses')

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(
      'attendance.admin.display.DELETE',
      ATTENDANCE_ERROR_MESSAGES.stopSessionFailed,
      error,
    )
  }
}
