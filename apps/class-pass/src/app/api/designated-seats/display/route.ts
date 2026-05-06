import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getCourseById } from '@/lib/class-pass-data'
import { resolveDisplayDevice } from '@/lib/designated-seat/display-device'
import { ensureDisplaySessionForCurrentSchedule } from '@/lib/designated-seat/service'
import {
  generateRotationToken,
  getRotationBucket,
} from '@/lib/designated-seat/token'
import {
  getRotationExpiresAt,
  shouldUpdateDisplayHeartbeat,
} from '@/lib/designated-seat/display-runtime'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 표시 QR 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!course.feature_designated_seat) {
      return NextResponse.json({ error: '지정좌석 기능이 활성화되지 않은 강좌입니다.' }, { status: 409 })
    }

    const device = await resolveDisplayDevice(req, course.id)
    if (!device.ok) {
      return NextResponse.json({
        status: 'registration_required',
        code: device.reason,
        error: '등록된 QR 표시 기기가 아닙니다. 관리자에게 등록 코드를 요청해 주세요.',
        course: {
          id: course.id,
          name: course.name,
        },
      }, { status: device.reason === 'MISSING_COOKIE' ? 401 : 403 })
    }

    const sessionAvailability = await ensureDisplaySessionForCurrentSchedule(course.id)
    if (sessionAvailability.status === 'inactive') {
      return NextResponse.json({
        status: 'inactive',
        reason: sessionAvailability.reason,
        message: '현재 입실 가능 시간이 아닙니다.',
        course: {
          id: course.id,
          name: course.name,
        },
      })
    }

    const session = sessionAvailability.session
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const db = createServerClient()

    if (shouldUpdateDisplayHeartbeat(session.last_seen_at, now)) {
      await db
        .from('course_seat_display_sessions')
        .update({ last_seen_at: nowIso })
        .eq('id', session.id)
    }

    if (shouldUpdateDisplayHeartbeat(device.device.last_seen_at, now)) {
      await db
        .from('course_seat_display_devices')
        .update({
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', device.device.id)
    }

    const rotation = getRotationBucket(now)
    const rotationToken = await generateRotationToken({
      courseId: course.id,
      displaySessionId: session.id,
      rotation,
    })
    const rotationExpiresAt = getRotationExpiresAt(rotation)

    return NextResponse.json({
      status: 'active',
      course: {
        id: course.id,
        name: course.name,
      },
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
      rotationToken,
      rotationExpiresAt,
      device: {
        id: device.device.id,
        name: device.device.device_name,
      },
    })
  } catch (error) {
    return handleRouteError('designatedSeats.display.GET', '현장 QR 정보를 불러오지 못했습니다.', error)
  }
}
