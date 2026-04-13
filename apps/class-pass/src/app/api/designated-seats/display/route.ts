import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getCourseById } from '@/lib/class-pass-data'
import { getActiveDisplaySessionByHash } from '@/lib/designated-seat/service'
import {
  generateRotationCode,
  generateRotationToken,
  getRotationBucket,
  hashToken,
} from '@/lib/designated-seat/token'
import {
  getRotationExpiresAt,
  shouldUpdateDisplayHeartbeat,
} from '@/lib/designated-seat/display-runtime'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

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
      return NextResponse.json({ error: '잘못된 표시 세션 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const session = await getActiveDisplaySessionByHash(parsed.data.courseId, hashToken(parsed.data.token))
    if (!session) {
      return NextResponse.json({ error: '표시 세션이 만료되었거나 유효하지 않습니다.' }, { status: 404 })
    }

    const now = Date.now()
    if (shouldUpdateDisplayHeartbeat(session.last_seen_at, now)) {
      const db = createServerClient()
      await db
        .from('course_seat_display_sessions')
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq('id', session.id)
    }

    const rotation = getRotationBucket(now)
    const rotationToken = await generateRotationToken({
      courseId: course.id,
      displaySessionId: session.id,
      rotation,
    })
    const rotationCode = generateRotationCode({
      courseId: course.id,
      displaySessionId: session.id,
      rotation,
    })
    const rotationExpiresAt = getRotationExpiresAt(rotation)

    return NextResponse.json({
      course: {
        id: course.id,
        name: course.name,
      },
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
      rotationToken,
      rotationCode,
      rotationExpiresAt,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.display.GET', '현장 QR 정보를 불러오지 못했습니다.', error)
  }
}
