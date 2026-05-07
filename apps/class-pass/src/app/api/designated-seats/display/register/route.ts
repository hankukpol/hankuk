import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimiter'
import {
  attachDisplayDeviceCookie,
  attachDisplaySlotDeviceCookie,
  createDisplayDeviceCookie,
  createDisplayDeviceToken,
  hashDisplayRegistrationCode,
  hashDisplaySlotRegistrationCode,
} from '@/lib/designated-seat/display-device'
import {
  normalizeDisplaySlotKey,
  resolveDesignatedSeatDisplayTarget,
} from '@/lib/designated-seat/display-targets'
import { logDesignatedSeatEvent } from '@/lib/designated-seat/service'
import { hashToken } from '@/lib/designated-seat/token'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  code: z.string().regex(/^\d{6}$/),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
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

    const normalizedSlotKey = parsed.data.slotKey
      ? normalizeDisplaySlotKey(parsed.data.slotKey)
      : null
    const rateLimitTarget = parsed.data.slotKey
      ? `slot:${normalizedSlotKey ?? 'invalid'}`
      : `course:${parsed.data.courseId}`
    const rateLimit = await checkRateLimit(`designated-seat-display-register:${rateLimitTarget}:${getClientIp(req)}`)
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: '등록 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        retryAfterMs: rateLimit.retryAfterMs,
      }, { status: 429 })
    }

    const division = await getServerTenantType()
    const target = await resolveDesignatedSeatDisplayTarget({
      courseId: parsed.data.courseId,
      slotKey: parsed.data.slotKey,
      division,
    })
    if (!target) {
      return NextResponse.json({ error: 'QR 표시 대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    const deviceToken = createDisplayDeviceToken()
    const db = createServerClient()
    const deviceResult = target.mode === 'slot'
      ? await db
        .rpc('register_course_seat_display_slot_device', {
          p_slot_id: target.slot.id,
          p_code_hash: hashDisplaySlotRegistrationCode(target.slot.id, parsed.data.code),
          p_device_token_hash: hashToken(deviceToken),
        })
        .maybeSingle()
      : await db
        .rpc('register_course_seat_display_device', {
          p_course_id: target.course.id,
          p_code_hash: hashDisplayRegistrationCode(target.course.id, parsed.data.code),
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
      course_id: target.course.id,
      enrollment_id: null,
      seat_id: null,
      event_type: 'display_device_registered',
      details: {
        device_id: device.device_id,
        device_name: device.device_name,
        display_target: target.mode,
        slot_key: target.slot?.slot_key ?? null,
      },
    })

    const response = NextResponse.json({
      success: true,
      device: {
        id: device.device_id,
        name: device.device_name,
      },
    })

    const cookieValue = await createDisplayDeviceCookie(deviceToken)
    if (target.mode === 'slot') {
      attachDisplaySlotDeviceCookie(response, target.slot.slot_key, cookieValue)
    } else {
      attachDisplayDeviceCookie(response, target.course.id, cookieValue)
    }

    return response
  } catch (error) {
    return handleRouteError('designatedSeats.display.register.POST', '표시기기 등록을 처리하지 못했습니다.', error)
  }
}
