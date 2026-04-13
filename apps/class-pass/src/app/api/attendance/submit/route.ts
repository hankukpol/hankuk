import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { ATTENDANCE_ERROR_MESSAGES } from '@/lib/attendance/route-helpers'
import {
  getActiveAttendanceDisplaySessionForCourse,
  verifyStudentAttendanceAccess,
} from '@/lib/attendance/service'
import {
  generateAttendanceRotationCode,
  getAttendanceRotationBucket,
} from '@/lib/attendance/token'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { attachStudentDeviceCookie, resolveStudentDevice } from '@/lib/designated-seat/device'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
  localDeviceKey: z.string().min(16).max(128),
})

function getAttendanceFailureMessage(code: string | undefined) {
  switch (code) {
    case 'ALREADY_ATTENDED':
      return { status: 409, message: '오늘은 이미 출석 처리되었습니다.' }
    case 'DEVICE_LOCKED':
      return { status: 409, message: '다른 기기에서 이미 출석 처리된 기기입니다.' }
    case 'ATTENDANCE_CLOSED':
      return { status: 403, message: '지금은 출석 체크 시간이 아닙니다.' }
    case 'FEATURE_DISABLED':
      return { status: 403, message: '이 강의는 출석 기능을 사용하지 않습니다.' }
    case 'COURSE_INACTIVE':
      return { status: 403, message: '현재 출석 처리할 수 없는 강의 상태입니다.' }
    default:
      return { status: 500, message: '출석 처리에 실패했습니다.' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const featureError = await requireAppFeature('attendance_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.invalidSubmitRequest }, { status: 400 })
    }

    const division = await getServerTenantType()
    const access = await verifyStudentAttendanceAccess({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      division,
    })

    if (!access) {
      return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 404 })
    }

    if (!access.course.feature_attendance) {
      return NextResponse.json(
        { error: '이 강의는 출석 기능을 사용하지 않습니다.', code: 'FEATURE_DISABLED' },
        { status: 403 },
      )
    }

    if (!access.course.attendance_open) {
      return NextResponse.json(
        { error: '현재 출석 체크가 열려 있지 않습니다.', code: 'ATTENDANCE_CLOSED' },
        { status: 403 },
      )
    }

    const device = await resolveStudentDevice(req, parsed.data.localDeviceKey)
    if (!device.ok) {
      return NextResponse.json({
        error: device.reason === 'DEVICE_MISMATCH'
          ? '등록된 기기 정보와 일치하지 않습니다.'
          : '기기 식별 값이 올바르지 않습니다.',
        code: device.reason,
      }, { status: 409 })
    }

    const displaySession = await getActiveAttendanceDisplaySessionForCourse(access.course.id)
    if (!displaySession) {
      return NextResponse.json(
        { error: '현재 출석 체크가 열려 있지 않습니다.', code: 'ATTENDANCE_CLOSED' },
        { status: 403 },
      )
    }

    const currentRotation = getAttendanceRotationBucket()
    const currentCode = generateAttendanceRotationCode({
      courseId: access.course.id,
      displaySessionId: displaySession.id,
      rotation: currentRotation,
    })
    const previousCode = generateAttendanceRotationCode({
      courseId: access.course.id,
      displaySessionId: displaySession.id,
      rotation: currentRotation - 1,
    })

    if (parsed.data.code !== currentCode && parsed.data.code !== previousCode) {
      return NextResponse.json(
        { error: '출석 코드가 올바르지 않거나 만료되었습니다.', code: 'INVALID_CODE' },
        { status: 400 },
      )
    }

    const db = createServerClient()
    const rpcResult = await db.rpc('submit_attendance', {
      p_course_id: access.course.id,
      p_enrollment_id: access.enrollment.id,
      p_display_session_id: displaySession.id,
      p_device_key_hash: device.deviceHash,
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '출석 처리에 실패했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as { ok?: boolean; code?: string; date?: string } | null
    if (!result?.ok) {
      const failure = getAttendanceFailureMessage(result?.code)
      return NextResponse.json(
        { error: failure.message, code: result?.code ?? 'UNKNOWN_ERROR' },
        { status: failure.status },
      )
    }

    await invalidateCache('attendance')

    const response = NextResponse.json({
      ok: true,
      date: result.date,
    })

    if (device.cookieToSet) {
      attachStudentDeviceCookie(response, device.cookieToSet)
    }

    return response
  } catch (error) {
    return handleRouteError('attendance.submit.POST', '출석 처리에 실패했습니다.', error)
  }
}
