import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { attachStudentDeviceCookie, resolveStudentDevice } from '@/lib/designated-seat/device'
import {
  getDesignatedSeatStudentState,
  logDesignatedSeatEvent,
  verifyStudentSeatAccess,
} from '@/lib/designated-seat/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  seatId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
  localDeviceKey: z.string().min(16).max(128),
})

function getReserveFailure(reason: string | undefined) {
  switch (reason) {
    case 'FEATURE_DISABLED':
      return { status: 403, message: '이 강좌는 지정좌석 기능을 사용하지 않습니다.' }
    case 'RESERVATION_CLOSED':
      return { status: 403, message: '현재 좌석 신청이 닫혀 있습니다.' }
    case 'ENROLLMENT_INACTIVE':
      return { status: 403, message: '현재 좌석을 지정할 수 없는 수강 상태입니다.' }
    case 'AUTH_REQUIRED':
    case 'AUTH_EXPIRED':
    case 'AUTH_ALREADY_USED':
      return { status: 403, message: '좌석을 지정하려면 다시 현장 QR 인증이 필요합니다.' }
    case 'AUTH_DEVICE_MISMATCH':
      return { status: 409, message: '현장 인증을 마친 기기에서만 좌석을 지정할 수 있습니다.' }
    case 'DEVICE_LOCKED':
      return {
        status: 409,
        message: '같은 기기로 다른 학생 좌석을 먼저 확정했습니다. 대리 좌석 방지를 위해 차단되었습니다.',
      }
    case 'SEAT_INACTIVE':
    case 'SEAT_NOT_FOUND':
      return { status: 404, message: '선택한 좌석을 다시 확인해주세요.' }
    case 'SEAT_TAKEN':
      return { status: 409, message: '방금 다른 학생이 먼저 선택했습니다. 다른 좌석을 골라주세요.' }
    default:
      return { status: 500, message: '좌석을 지정하지 못했습니다.' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '좌석 지정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const access = await verifyStudentSeatAccess({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      division,
    })

    if (!access) {
      return NextResponse.json({ error: '학생 정보를 다시 확인해주세요.' }, { status: 404 })
    }

    const device = await resolveStudentDevice(req, parsed.data.localDeviceKey)
    if (!device.ok) {
      return NextResponse.json({
        error: device.reason === 'DEVICE_MISMATCH'
          ? '기기 정보가 일치하지 않습니다. 같은 브라우저에서 다시 시도해주세요.'
          : '기기 식별 정보가 올바르지 않습니다.',
      }, { status: 409 })
    }

    const db = createServerClient()
    const throttleSince = new Date(Date.now() - 5_000).toISOString()
    const throttleResult = await db
      .from('course_seat_events')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', access.course.id)
      .eq('enrollment_id', access.enrollment.id)
      .eq('event_type', 'seat_request')
      .gt('created_at', throttleSince)

    if ((throttleResult.count ?? 0) >= 5) {
      await logDesignatedSeatEvent({
        course_id: access.course.id,
        enrollment_id: access.enrollment.id,
        seat_id: parsed.data.seatId,
        event_type: 'seat_request_throttled',
        details: {
          limit_window_ms: 5000,
        },
      })

      return NextResponse.json({
        error: '너무 빠르게 여러 번 요청했습니다. 잠시 후 다시 시도해주세요.',
      }, { status: 429 })
    }

    await logDesignatedSeatEvent({
      course_id: access.course.id,
      enrollment_id: access.enrollment.id,
      seat_id: parsed.data.seatId,
      event_type: 'seat_request',
      details: {},
    })

    const rpcResult = await db.rpc('claim_designated_seat', {
      p_course_id: access.course.id,
      p_enrollment_id: access.enrollment.id,
      p_seat_id: parsed.data.seatId,
      p_device_key_hash: device.deviceHash,
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '좌석을 지정하지 못했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as {
      success?: boolean
      reason?: string
      action?: string
    } | null

    if (!result?.success) {
      const failure = getReserveFailure(result?.reason)
      const shouldIncludeState = result?.reason === 'SEAT_TAKEN'
        || result?.reason === 'AUTH_REQUIRED'
        || result?.reason === 'AUTH_EXPIRED'
        || result?.reason === 'AUTH_ALREADY_USED'
        || result?.reason === 'AUTH_DEVICE_MISMATCH'
        || result?.reason === 'DEVICE_LOCKED'

      const state = shouldIncludeState
        ? await getDesignatedSeatStudentState({
          course: access.course,
          enrollmentId: access.enrollment.id,
          deviceKeyHash: device.deviceHash,
        })
        : null

      return NextResponse.json({
        error: failure.message,
        reason: result?.reason,
        state,
      }, { status: failure.status })
    }

    const state = await getDesignatedSeatStudentState({
      course: access.course,
      enrollmentId: access.enrollment.id,
      deviceKeyHash: device.deviceHash,
    })

    const response = NextResponse.json({
      success: true,
      action: result.action ?? 'reserved',
      state,
    })

    if (device.cookieToSet) {
      attachStudentDeviceCookie(response, device.cookieToSet)
    }

    return response
  } catch (error) {
    return handleRouteError('designatedSeats.reserve.POST', '좌석 지정을 처리하지 못했습니다.', error)
  }
}
