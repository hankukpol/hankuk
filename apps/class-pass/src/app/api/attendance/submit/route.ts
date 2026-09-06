import { NextRequest, NextResponse } from 'next/server'
import { requireStudentSession } from '@/lib/auth/student-session'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import {
  ATTENDANCE_ERROR_MESSAGES,
  hasCourseAttendanceStarted,
} from '@/lib/attendance/route-helpers'
import {
  enforceAttendanceDeviceBinding,
  getActiveAttendanceDisplaySessionForCourse,
  getAttendanceTodayKey,
  hasValidSeatAssignmentForSubject,
  logAttendanceEvent,
  tryLogAttendanceEvent,
  verifyStudentAttendanceAccess,
} from '@/lib/attendance/service'
import { buildAttendanceCodeInvalidEventDetails } from '@/lib/attendance/submit-event-details'
import {
  generateAttendanceRotationCode,
  getAttendanceRotationBucket,
} from '@/lib/attendance/token'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { attachStudentDeviceCookie, resolveStudentDevice } from '@/lib/designated-seat/device'
import { verifyPresenceLocation } from '@/lib/presence/location'
import { presenceErrorSchema, presenceLocationSchema } from '@/lib/presence/schema'
import { isPresenceLocationFeatureActive } from '@/lib/presence/shared'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
  localDeviceKey: z.string().min(16).max(128),
  presenceLocation: presenceLocationSchema.optional(),
  presenceError: presenceErrorSchema.optional(),
})

function getAttendanceFailureMessage(code: string | undefined) {
  switch (code) {
    case 'ALREADY_ATTENDED':
      return { status: 409, message: '오늘은 이미 출석 처리되었습니다.' }
    case 'DEVICE_LOCKED':
      return { status: 409, message: '이 기기는 다른 수강생의 출석 기기로 등록되어 있습니다.' }
    case 'DEVICE_REBIND_REQUIRED':
      return { status: 409, message: '등록 가능한 출석 기기 3대를 초과한 새 기기로 감지되어 관리자에게 재등록 승인 요청을 보냈습니다. 승인 후 다시 출석해 주세요.' }
    case 'ATTENDANCE_CLOSED':
      return { status: 403, message: '지금은 출석 체크 시간이 아닙니다.' }
    case 'FEATURE_DISABLED':
      return { status: 403, message: '이 강의는 출석 기능을 사용하지 않습니다.' }
    case 'COURSE_INACTIVE':
      return { status: 403, message: '현재 출석 처리할 수 없는 강의 상태입니다.' }
    case 'ATTENDANCE_NOT_STARTED':
      return { status: 403, message: '아직 수강 시작 전이라 출석 체크를 할 수 없습니다.' }
    default:
      return { status: 500, message: '출석 처리에 실패했습니다.' }
  }
}

function jsonWithStudentDeviceCookie(
  body: unknown,
  init: ResponseInit,
  cookieToSet: string | null | undefined,
) {
  const response = NextResponse.json(body, init)

  if (cookieToSet) {
    attachStudentDeviceCookie(response, cookieToSet)
  }

  return response
}

export async function POST(req: NextRequest) {
  try {
    const studentSession = await requireStudentSession(req)
    if (studentSession instanceof NextResponse) return studentSession

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
      studentId: studentSession.studentId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      division,
    })

    if (!access) {
      return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 404 })
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

    if (!access.course.feature_attendance) {
      return jsonWithStudentDeviceCookie(
        { error: '이 강의는 출석 기능을 사용하지 않습니다.', code: 'FEATURE_DISABLED' },
        { status: 403 },
        device.cookieToSet,
      )
    }

    if (!hasCourseAttendanceStarted(access.course)) {
      const failure = getAttendanceFailureMessage('ATTENDANCE_NOT_STARTED')
      return jsonWithStudentDeviceCookie(
        { error: failure.message, code: 'ATTENDANCE_NOT_STARTED' },
        { status: failure.status },
        device.cookieToSet,
      )
    }

    if (!access.course.attendance_open) {
      return jsonWithStudentDeviceCookie(
        { error: '현재 출석 체크가 열려 있지 않습니다.', code: 'ATTENDANCE_CLOSED' },
        { status: 403 },
        device.cookieToSet,
      )
    }

    const displaySession = await getActiveAttendanceDisplaySessionForCourse(access.course.id)
    if (!displaySession) {
      return jsonWithStudentDeviceCookie(
        { error: '현재 출석 체크가 열려 있지 않습니다.', code: 'ATTENDANCE_CLOSED' },
        { status: 403 },
        device.cookieToSet,
      )
    }

    if (displaySession.subject_id != null) {
      const hasValidSeatAssignment = await hasValidSeatAssignmentForSubject({
        enrollmentId: access.enrollment.id,
        subjectId: displaySession.subject_id,
      })

      if (!hasValidSeatAssignment) {
        return jsonWithStudentDeviceCookie(
          {
            error: '이 과목은 좌석 번호가 있는 수강생만 출석 대상입니다.',
            code: 'SUBJECT_SEAT_REQUIRED',
          },
          { status: 403 },
          device.cookieToSet,
        )
      }
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
      await tryLogAttendanceEvent({
        course_id: access.course.id,
        event_type: 'attendance_code_invalid',
        details: buildAttendanceCodeInvalidEventDetails({
          enrollmentId: access.enrollment.id,
          displaySessionId: displaySession.id,
          subjectId: displaySession.subject_id,
          currentRotation,
          userAgent: req.headers.get('user-agent'),
          deviceSource: device.source,
          localKeyMatchedCookie: device.localKeyMatchedCookie,
        }),
      })

      return jsonWithStudentDeviceCookie(
        { error: '출석 코드가 올바르지 않거나 만료되었습니다.', code: 'INVALID_CODE' },
        { status: 400 },
        device.cookieToSet,
      )
    }

    if (isPresenceLocationFeatureActive(access.course, 'attendance')) {
      const presence = await verifyPresenceLocation({
        course: access.course,
        enrollmentId: access.enrollment.id,
        feature: 'attendance',
        location: parsed.data.presenceLocation ?? null,
        presenceError: parsed.data.presenceError ?? null,
        details: {
          display_session_id: displaySession.id,
          subject_id: displaySession.subject_id,
          user_agent: req.headers.get('user-agent'),
        },
      })

      if (presence.shouldBlock) {
        return jsonWithStudentDeviceCookie(
          {
            error: presence.message ?? '위치 확인이 필요합니다. 다시 시도해 주세요.',
            code: `PRESENCE_${presence.code ?? 'FAILED'}`.toUpperCase(),
            presence,
          },
          { status: presence.code === 'config_required' ? 503 : 403 },
          device.cookieToSet,
        )
      }
    }

    const db = createServerClient()
    const attendedDate = getAttendanceTodayKey()
    const existingAttendanceQuery = db
      .from('attendance_records')
      .select('id')
      .eq('course_id', access.course.id)
      .eq('enrollment_id', access.enrollment.id)
      .eq('attended_date', attendedDate)

    const scopedExistingAttendanceQuery = displaySession.subject_id == null
      ? existingAttendanceQuery.is('subject_id', null)
      : existingAttendanceQuery.eq('subject_id', displaySession.subject_id)

    const [existingAttendance, existingDeviceAttendance] = await Promise.all([
      scopedExistingAttendanceQuery.maybeSingle(),
      db
        .from('attendance_records')
        .select('id,enrollment_id')
        .eq('course_id', access.course.id)
        .eq('device_key_hash', device.deviceHash)
        .eq('attended_date', attendedDate)
        .neq('enrollment_id', access.enrollment.id)
        .limit(1)
        .maybeSingle(),
    ])

    if (existingAttendance.error || existingDeviceAttendance.error) {
      return jsonWithStudentDeviceCookie(
        { error: '출석 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 },
        device.cookieToSet,
      )
    }

    if (existingAttendance.data?.id) {
      const failure = getAttendanceFailureMessage('ALREADY_ATTENDED')
      return jsonWithStudentDeviceCookie(
        { error: failure.message, code: 'ALREADY_ATTENDED' },
        { status: failure.status },
        device.cookieToSet,
      )
    }

    if (existingDeviceAttendance.data?.id) {
      await tryLogAttendanceEvent({
        course_id: access.course.id,
        event_type: 'attendance_device_locked',
        details: {
          enrollment_id: access.enrollment.id,
          registered_enrollment_id: Number(existingDeviceAttendance.data.enrollment_id),
          date: attendedDate,
          reason: 'attendance_record_device_collision',
        },
      })

      const failure = getAttendanceFailureMessage('DEVICE_LOCKED')
      return jsonWithStudentDeviceCookie(
        { error: failure.message, code: 'DEVICE_LOCKED' },
        { status: failure.status },
        device.cookieToSet,
      )
    }

    const deviceBinding = await enforceAttendanceDeviceBinding({
      courseId: access.course.id,
      enrollmentId: access.enrollment.id,
      deviceKeyHash: device.deviceHash,
      userAgent: req.headers.get('user-agent'),
    })

    if (!deviceBinding.ok) {
      const failure = getAttendanceFailureMessage(deviceBinding.code)
      await invalidateCache('enrollments')
      return jsonWithStudentDeviceCookie(
        { error: failure.message, code: deviceBinding.code, device: deviceBinding.state },
        { status: failure.status },
        device.cookieToSet,
      )
    }

    const insertResult = await db.rpc('submit_student_attendance', {
      p_course_id: access.course.id,
      p_enrollment_id: access.enrollment.id,
      p_student_id: studentSession.studentId,
      p_division: division,
      p_display_session_id: displaySession.id,
      p_subject_id: displaySession.subject_id,
      p_device_key_hash: device.deviceHash,
      p_attended_date: attendedDate,
    })
    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const failure = getAttendanceFailureMessage('ALREADY_ATTENDED')
        return jsonWithStudentDeviceCookie(
          { error: failure.message, code: 'ALREADY_ATTENDED' },
          { status: failure.status },
          device.cookieToSet,
        )
      }

      return jsonWithStudentDeviceCookie(
        { error: '출석 처리에 실패했습니다.' },
        { status: 500 },
        device.cookieToSet,
      )
    }

    if (!insertResult.data?.ok) {
      const code = insertResult.data?.code
      return jsonWithStudentDeviceCookie({
        error: code === 'ENROLLMENT_INACTIVE' ? '현재 출석할 수 없는 수강 상태입니다.'
          : code === 'ALREADY_ATTENDED' ? '이미 출석 처리되었습니다.'
            : '출석 가능 상태가 변경되었습니다. 현장 코드를 다시 확인해 주세요.',
        code: ['ENROLLMENT_INACTIVE', 'ALREADY_ATTENDED', 'COURSE_INACTIVE', 'DISPLAY_EXPIRED'].includes(code) ? code : 'ATTENDANCE_FAILED',
      }, { status: code === 'ALREADY_ATTENDED' ? 409 : 403 }, device.cookieToSet)
    }

    await logAttendanceEvent({
      course_id: access.course.id,
      event_type: 'student_checked_in',
      details: {
        enrollment_id: access.enrollment.id,
        date: attendedDate,
        display_session_id: displaySession.id,
        subject_id: displaySession.subject_id,
      },
    })

    await invalidateCache('attendance')
    await invalidateCache('enrollments')

    return jsonWithStudentDeviceCookie({
      ok: true,
      date: attendedDate,
    }, { status: 200 }, device.cookieToSet)
  } catch (error) {
    return handleRouteError('attendance.submit.POST', '출석 처리에 실패했습니다.', error)
  }
}
