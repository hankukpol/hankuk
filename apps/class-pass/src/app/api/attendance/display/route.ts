import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getAttendanceRotationExpiresAt, shouldUpdateAttendanceHeartbeat } from '@/lib/attendance/display-runtime'
import {
  ATTENDANCE_ERROR_MESSAGES,
  requireAttendanceCourse,
} from '@/lib/attendance/route-helpers'
import { getActiveAttendanceDisplaySessionByHash } from '@/lib/attendance/service'
import {
  generateAttendanceRotationCode,
  getAttendanceRotationBucket,
  hashToken,
} from '@/lib/attendance/token'
import { createServerClient } from '@/lib/supabase/server'

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  token: z.string().min(20),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      token: req.nextUrl.searchParams.get('token'),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidDisplayRequest }, { status: 400 })
    }

    const guard = await requireAttendanceCourse(parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const { course } = guard.context
    const session = await getActiveAttendanceDisplaySessionByHash(
      parsed.data.courseId,
      hashToken(parsed.data.token),
    )

    if (!session) {
      return NextResponse.json({ error: '출석 세션이 종료되었거나 만료되었습니다.' }, { status: 404 })
    }

    const now = Date.now()
    if (shouldUpdateAttendanceHeartbeat(session.last_seen_at, now)) {
      const db = createServerClient()
      await db
        .from('attendance_display_sessions')
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq('id', session.id)
    }

    const rotation = getAttendanceRotationBucket(now)
    const rotationCode = generateAttendanceRotationCode({
      courseId: course.id,
      displaySessionId: session.id,
      rotation,
    })

    return NextResponse.json({
      course: {
        id: course.id,
        name: course.name,
      },
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
      rotationCode,
      rotationExpiresAt: getAttendanceRotationExpiresAt(rotation),
    })
  } catch (error) {
    return handleRouteError('attendance.display.GET', ATTENDANCE_ERROR_MESSAGES.loadDisplayFailed, error)
  }
}
