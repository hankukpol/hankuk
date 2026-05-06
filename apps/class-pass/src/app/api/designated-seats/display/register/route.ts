import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { getClientIp, checkRateLimit } from '@/lib/auth/rateLimiter'
import { getCourseById } from '@/lib/class-pass-data'
import {
  attachDisplayDeviceCookie,
  createDisplayDeviceCookie,
  createDisplayDeviceToken,
  hashDisplayRegistrationCode,
} from '@/lib/designated-seat/display-device'
import { logDesignatedSeatEvent } from '@/lib/designated-seat/service'
import { hashToken } from '@/lib/designated-seat/token'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  code: z.string().regex(/^\d{6}$/),
})

type RegisteredDisplayDeviceResult = {
  device_id: number
  device_name: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '등록 코드 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const rateLimit = checkRateLimit(`designated-seat-display-register:${parsed.data.courseId}:${getClientIp(req)}`)
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: '등록 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        retryAfterMs: rateLimit.retryAfterMs,
      }, { status: 429 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const deviceToken = createDisplayDeviceToken()
    const db = createServerClient()
    const deviceResult = await db
      .rpc('register_course_seat_display_device', {
        p_course_id: course.id,
        p_code_hash: hashDisplayRegistrationCode(course.id, parsed.data.code),
        p_device_token_hash: hashToken(deviceToken),
      })
      .maybeSingle()

    if (deviceResult.error) {
      throw deviceResult.error
    }

    const device = deviceResult.data as RegisteredDisplayDeviceResult | null
    if (!device) {
      return NextResponse.json({ error: '등록 코드가 만료되었거나 올바르지 않습니다.' }, { status: 404 })
    }

    await logDesignatedSeatEvent({
      course_id: course.id,
      enrollment_id: null,
      seat_id: null,
      event_type: 'display_device_registered',
      details: {
        device_id: device.device_id,
        device_name: device.device_name,
      },
    })

    const response = NextResponse.json({
      success: true,
      device: {
        id: device.device_id,
        name: device.device_name,
      },
    })
    attachDisplayDeviceCookie(response, course.id, await createDisplayDeviceCookie(deviceToken))

    return response
  } catch (error) {
    return handleRouteError('designatedSeats.display.register.POST', '표시 기기 등록을 처리하지 못했습니다.', error)
  }
}
