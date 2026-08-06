import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { attachStudentDeviceCookie, resolveStudentDevice } from '@/lib/designated-seat/device'
import {
  ensureCourseRooms,
  getActiveDisplaySessionById,
  getDesignatedSeatStudentState,
  logDesignatedSeatEvent,
  verifyStudentSeatAccess,
} from '@/lib/designated-seat/service'
import {
  DESIGNATED_SEAT_AUTH_TTL_MS,
  DESIGNATED_SEAT_ROTATION_GRACE_MS,
  DESIGNATED_SEAT_ROTATION_MS,
  getRotationBucket,
  verifyRotationToken,
} from '@/lib/designated-seat/token'
import { parseDesignatedSeatScanValue } from '@/lib/designated-seat/scan'
import { verifyPresenceLocation } from '@/lib/presence/location'
import { presenceErrorSchema, presenceLocationSchema } from '@/lib/presence/schema'
import { isPresenceLocationFeatureActive } from '@/lib/presence/shared'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const deviceSignatureSchema = z.object({
  userAgent: z.string().max(500).optional(),
  platform: z.string().max(100).optional(),
  language: z.string().max(50).optional(),
  screen: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
})

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  roomId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1),
  phone: z.string().min(10),
  localDeviceKey: z.string().min(16).max(128),
  verificationMethod: z.enum(['qr', 'code']),
  rotationToken: z.string().optional(),
  rotationCode: z.string().regex(/^\d{4,6}$/).optional(),
  deviceSignature: deviceSignatureSchema.optional(),
  presenceLocation: presenceLocationSchema.optional(),
  presenceError: presenceErrorSchema.optional(),
})

function authFailure(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status })
}

const QR_ONLY_MESSAGE = '현장 코드 입력은 더 이상 사용할 수 없습니다. 강의실 화면의 QR을 다시 스캔해 주세요.'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return authFailure('현장 QR 인증 요청 형식이 올바르지 않습니다.', 400, 'AUTH_REQUEST_INVALID')
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
      return authFailure('학생 정보를 다시 확인해 주세요.', 404, 'STUDENT_ACCESS_INVALID')
    }

    if (!access.course.feature_designated_seat) {
      return authFailure('이 강의는 지정좌석 기능을 사용하지 않습니다.', 403, 'FEATURE_DISABLED')
    }

    if (!access.course.designated_seat_open) {
      return authFailure('현재 좌석 요청이 닫혀 있습니다.', 403, 'RESERVATION_CLOSED')
    }

    const device = await resolveStudentDevice(req, parsed.data.localDeviceKey)
    if (!device.ok) {
      return authFailure(
        device.reason === 'DEVICE_MISMATCH'
          ? '기기 정보가 일치하지 않습니다. 같은 브라우저에서 다시 시도해 주세요.'
          : '기기 연계 정보가 올바르지 않습니다.',
        409,
      )
    }

    if (parsed.data.verificationMethod !== 'qr') {
      return authFailure(QR_ONLY_MESSAGE)
    }

    let rotationToken = parsed.data.rotationToken
    if (rotationToken) {
      const normalizedScan = parseDesignatedSeatScanValue(rotationToken)
      if (normalizedScan?.verificationMethod === 'code') {
        return authFailure(QR_ONLY_MESSAGE)
      }
      if (normalizedScan?.verificationMethod === 'qr') {
        rotationToken = normalizedScan.rotationToken
      }
    }

    if (!rotationToken) {
      return authFailure('QR 토큰이 필요합니다.', 400, 'QR_TOKEN_MISSING')
    }

    const tokenPayload = await verifyRotationToken(rotationToken)
    if (!tokenPayload) {
      return authFailure('QR 인증 정보가 만료되었거나 올바르지 않습니다.', 400, 'QR_TOKEN_INVALID_OR_EXPIRED')
    }
    if (tokenPayload.courseId !== access.course.id) {
      return authFailure(
        '다른 강좌의 QR을 인식했습니다. 현재 수강증과 같은 강좌 QR만 화면에 크게 담아 다시 스캔해 주세요.',
        409,
        'QR_COURSE_MISMATCH',
      )
    }

    const now = Date.now()
    const currentRotation = getRotationBucket(now)
    const tokenRotationStartsAt = tokenPayload.rotation * DESIGNATED_SEAT_ROTATION_MS
    const tokenRotationExpiresAt = (tokenPayload.rotation + 1) * DESIGNATED_SEAT_ROTATION_MS
    if (
      tokenPayload.rotation > currentRotation
      || now < tokenRotationStartsAt
      || now > tokenRotationExpiresAt + DESIGNATED_SEAT_ROTATION_GRACE_MS
    ) {
      return authFailure('QR 인증 시간이 맞지 않습니다. 화면의 최신 QR로 다시 인증해 주세요.', 400, 'QR_TOKEN_TIME_INVALID')
    }

    const displaySession = await getActiveDisplaySessionById(access.course.id, tokenPayload.displaySessionId)
    if (!displaySession) {
      return authFailure('현장 QR 표시 세션이 만료되었습니다.', 400, 'QR_SESSION_EXPIRED')
    }
    const displayRoomId = Number(displaySession.room_id)
    if (!Number.isInteger(displayRoomId) || displayRoomId <= 0) {
      return authFailure('현장 QR 강의실 정보를 확인하지 못했습니다.', 409, 'QR_ROOM_MISSING')
    }
    if (tokenPayload.roomId && tokenPayload.roomId !== displayRoomId) {
      return authFailure('현장 QR 강의실 정보가 일치하지 않습니다.', 409, 'QR_ROOM_MISMATCH')
    }
    const requestedRoomId = parsed.data.roomId ?? null
    let fallbackRoomId = displayRoomId
    if (!tokenPayload.roomId && !requestedRoomId) {
      const openRooms = (await ensureCourseRooms(access.course.id)).filter((room) => room.is_open)
      if (openRooms.length > 1) {
        return authFailure('강의실을 먼저 선택해 주세요.', 409)
      }
      if (openRooms.length === 1) {
        fallbackRoomId = openRooms[0].id
      }
    }
    const activeRoomId = tokenPayload.roomId ?? requestedRoomId ?? fallbackRoomId
    if (!Number.isInteger(activeRoomId) || activeRoomId <= 0) {
      return authFailure('현장 QR 강의실 정보를 확인하지 못했습니다.', 409)
    }
    const db = createServerClient()
    const roomResult = await db
      .from('course_rooms')
      .select('id')
      .eq('course_id', access.course.id)
      .eq('id', activeRoomId)
      .eq('is_active', true)
      .eq('is_open', true)
      .maybeSingle()
    if (roomResult.error) {
      return authFailure('현장 QR 강의실 상태를 확인하지 못했습니다.', 500)
    }
    if (!roomResult.data) {
      const state = await getDesignatedSeatStudentState({
        course: access.course,
        enrollmentId: access.enrollment.id,
        roomId: activeRoomId,
        deviceKeyHash: device.deviceHash,
      })

      return NextResponse.json({
        error: '선택한 강의실의 좌석 신청이 닫혀 있습니다.',
        reason: 'ROOM_CLOSED',
        state,
      }, { status: 403 })
    }

    const verifiedRotation = tokenPayload.rotation
    const displaySessionId = displaySession.id
    const presence = isPresenceLocationFeatureActive(access.course, 'designated_seat')
      ? await verifyPresenceLocation({
        course: access.course,
        enrollmentId: access.enrollment.id,
        feature: 'designated_seat',
        location: parsed.data.presenceLocation ?? null,
        presenceError: parsed.data.presenceError ?? null,
        details: {
          display_session_id: displaySessionId,
          rotation: verifiedRotation,
          user_agent: req.headers.get('user-agent'),
        },
      })
      : null

    if (presence?.shouldBlock) {
      return NextResponse.json(
        {
          error: presence.message ?? '위치 확인이 필요합니다. 다시 시도해 주세요.',
          code: `PRESENCE_${presence.code ?? 'FAILED'}`.toUpperCase(),
          presence,
        },
        { status: presence.code === 'config_required' ? 503 : 403 },
      )
    }

    const existingAuthResult = await db
      .from('course_seat_auth_sessions')
      .select('device_key_hash')
      .eq('course_id', access.course.id)
      .eq('enrollment_id', access.enrollment.id)
      .maybeSingle()

    const existingDeviceHash = existingAuthResult.data?.device_key_hash as string | undefined
    if (existingDeviceHash && existingDeviceHash !== device.deviceHash) {
      await logDesignatedSeatEvent({
        course_id: access.course.id,
        enrollment_id: access.enrollment.id,
        seat_id: null,
        event_type: 'suspicious_device_change',
        details: {
          previous_device_hash: existingDeviceHash,
          next_device_hash: device.deviceHash,
          verification_method: 'qr',
        },
      })
    }

    const expiresAt = new Date(Date.now() + DESIGNATED_SEAT_AUTH_TTL_MS).toISOString()
    const upsertResult = await db
      .from('course_seat_auth_sessions')
      .upsert({
        course_id: access.course.id,
        enrollment_id: access.enrollment.id,
        room_id: activeRoomId,
        device_key_hash: device.deviceHash,
        device_signature: parsed.data.deviceSignature ?? {},
        verification_method: 'qr',
        verified_at: new Date().toISOString(),
        expires_at: expiresAt,
        used_for_reservation_at: null,
        last_verified_rotation: verifiedRotation,
        is_active: true,
        presence_location_verified: presence ? presence.ok : false,
        presence_verified_at: presence?.ok ? new Date().toISOString() : null,
        presence_verification_event_id: presence?.eventId ?? null,
        presence_distance_m: presence?.distanceM ?? null,
        presence_accuracy_m: presence?.accuracyM ?? null,
        updated_at: new Date().toISOString(),
      }, {
        // 한 수강생은 강좌 안에서 하나의 현장 인증만 유지합니다. 다른 강의실 QR을 찍으면 인증 강의실이 이동합니다.
        onConflict: 'course_id,enrollment_id',
      })

    if (upsertResult.error) {
      return authFailure('현장 인증 세션을 저장하지 못했습니다.', 500)
    }

    await logDesignatedSeatEvent({
      course_id: access.course.id,
      enrollment_id: access.enrollment.id,
      seat_id: null,
      event_type: 'student_auth_success',
      details: {
        verification_method: 'qr',
        room_id: activeRoomId,
        display_session_id: displaySessionId,
        rotation: verifiedRotation,
      },
    })

    const state = await getDesignatedSeatStudentState({
      course: access.course,
      enrollmentId: access.enrollment.id,
      roomId: activeRoomId,
      deviceKeyHash: device.deviceHash,
    })

    const response = NextResponse.json({
      success: true,
      expiresAt,
      state,
    })

    if (device.cookieToSet) {
      attachStudentDeviceCookie(response, device.cookieToSet)
    }

    return response
  } catch (error) {
    return handleRouteError('designatedSeats.auth.POST', '현장 QR 인증을 처리하지 못했습니다.', error)
  }
}
