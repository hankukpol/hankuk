import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { attachStudentDeviceCookie, resolveStudentDevice } from '@/lib/designated-seat/device'
import {
  getActiveDisplaySessionById,
  getActiveDisplaySessionForCourse,
  getDesignatedSeatStudentState,
  logDesignatedSeatEvent,
  verifyStudentSeatAccess,
} from '@/lib/designated-seat/service'
import {
  DESIGNATED_SEAT_AUTH_TTL_MS,
  generateRotationCode,
  getRotationBucket,
  verifyRotationToken,
} from '@/lib/designated-seat/token'
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
  name: z.string().min(1),
  phone: z.string().min(10),
  localDeviceKey: z.string().min(16).max(128),
  verificationMethod: z.enum(['qr', 'code']),
  rotationToken: z.string().optional(),
  rotationCode: z.string().regex(/^\d{4,6}$/).optional(),
  deviceSignature: deviceSignatureSchema.optional(),
})

function authFailure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return authFailure('현장 QR 인증 요청 형식이 올바르지 않습니다.')
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
      return authFailure('학생 정보를 다시 확인해 주세요.', 404)
    }

    if (!access.course.feature_designated_seat) {
      return authFailure('이 강의는 지정좌석 기능을 사용하지 않습니다.', 403)
    }

    if (!access.course.designated_seat_open) {
      return authFailure('현재 좌석 신청이 닫혀 있습니다.', 403)
    }

    const device = await resolveStudentDevice(req, parsed.data.localDeviceKey)
    if (!device.ok) {
      return authFailure(
        device.reason === 'DEVICE_MISMATCH'
          ? '기기 정보가 일치하지 않습니다. 같은 브라우저에서 다시 시도해 주세요.'
          : '기기 식별 정보가 올바르지 않습니다.',
        409,
      )
    }

    let verifiedRotation = 0
    let displaySessionId = 0

    if (parsed.data.verificationMethod === 'qr') {
      if (!parsed.data.rotationToken) {
        return authFailure('QR 토큰이 필요합니다.')
      }

      const tokenPayload = await verifyRotationToken(parsed.data.rotationToken)
      if (!tokenPayload || tokenPayload.courseId !== access.course.id) {
        return authFailure('QR 인증 정보가 만료되었거나 올바르지 않습니다.')
      }

      const currentRotation = getRotationBucket()
      if (tokenPayload.rotation < currentRotation - 1 || tokenPayload.rotation > currentRotation) {
        return authFailure('QR 인증 시간이 맞지 않습니다. 화면에 표시된 최신 QR로 다시 인증해 주세요.')
      }

      const displaySession = await getActiveDisplaySessionById(access.course.id, tokenPayload.displaySessionId)
      if (!displaySession) {
        return authFailure('현장 QR 표시 세션이 만료되었습니다.')
      }

      verifiedRotation = tokenPayload.rotation
      displaySessionId = displaySession.id
    } else {
      if (!parsed.data.rotationCode) {
        return authFailure('현장 인증 코드를 입력해 주세요.')
      }

      const displaySession = await getActiveDisplaySessionForCourse(access.course.id)
      if (!displaySession) {
        return authFailure('현재 활성화된 현장 QR이 없습니다.', 404)
      }

      const currentRotation = getRotationBucket()
      const currentCode = generateRotationCode({
        courseId: access.course.id,
        displaySessionId: displaySession.id,
        rotation: currentRotation,
      })
      const previousCode = generateRotationCode({
        courseId: access.course.id,
        displaySessionId: displaySession.id,
        rotation: currentRotation - 1,
      })

      if (parsed.data.rotationCode !== currentCode && parsed.data.rotationCode !== previousCode) {
        return authFailure('현장 인증 코드가 올바르지 않거나 만료되었습니다.')
      }

      verifiedRotation = parsed.data.rotationCode === currentCode ? currentRotation : currentRotation - 1
      displaySessionId = displaySession.id
    }

    const db = createServerClient()
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
          verification_method: parsed.data.verificationMethod,
        },
      })
    }

    const expiresAt = new Date(Date.now() + DESIGNATED_SEAT_AUTH_TTL_MS).toISOString()
    const upsertResult = await db
      .from('course_seat_auth_sessions')
      .upsert({
        course_id: access.course.id,
        enrollment_id: access.enrollment.id,
        device_key_hash: device.deviceHash,
        device_signature: parsed.data.deviceSignature ?? {},
        verification_method: parsed.data.verificationMethod,
        verified_at: new Date().toISOString(),
        expires_at: expiresAt,
        used_for_reservation_at: null,
        last_verified_rotation: verifiedRotation,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
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
        verification_method: parsed.data.verificationMethod,
        display_session_id: displaySessionId,
        rotation: verifiedRotation,
      },
    })

    const state = await getDesignatedSeatStudentState({
      course: access.course,
      enrollmentId: access.enrollment.id,
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
