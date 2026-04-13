import { NextRequest, NextResponse } from 'next/server'
import type { AppFeatureKey } from '@/lib/app-config.shared'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getCourseById } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Course, StaffJwtPayload } from '@/types/database'

export const ATTENDANCE_ERROR_MESSAGES = {
  invalidDisplayRequest: '출석 화면 요청 형식이 올바르지 않습니다.',
  invalidSubmitRequest: '출석 요청 형식이 올바르지 않습니다.',
  invalidDisplaySessionRequest: '출석 세션 요청 형식이 올바르지 않습니다.',
  invalidDisplayStopRequest: '출석 종료 요청 형식이 올바르지 않습니다.',
  invalidDashboardRequest: '출석 대시보드 요청 형식이 올바르지 않습니다.',
  invalidAbsenceReportRequest: '결석 리포트 요청 형식이 올바르지 않습니다.',
  invalidOverrideRequest: '수동 출석 요청 형식이 올바르지 않습니다.',
  courseNotFound: '강의를 찾을 수 없습니다.',
  attendanceNotEnabledForCourse: '이 강의는 출석 기능을 사용하지 않습니다.',
  loadDisplayFailed: '출석 화면 정보를 불러오지 못했습니다.',
  loadDashboardFailed: '출석 현황을 불러오지 못했습니다.',
  loadAbsenceReportFailed: '결석 리포트를 불러오지 못했습니다.',
  startSessionFailed: '출석 세션을 시작하지 못했습니다.',
  stopSessionFailed: '출석 세션을 종료하지 못했습니다.',
  overrideFailed: '수동 출석 처리에 실패했습니다.',
} as const

type AttendanceCourseContext = {
  course: Course
  division: string
}

type AttendanceAdminCourseContext = AttendanceCourseContext & {
  payload: StaffJwtPayload | null
}

type GuardResult<T> =
  | { response: NextResponse; context: null }
  | { response: null; context: T }

export async function requireAttendanceCourse(courseId: number): Promise<GuardResult<AttendanceCourseContext>> {
  const featureError = await requireAppFeature('attendance_enabled')
  if (featureError) {
    return { response: featureError, context: null }
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)

  if (!course) {
    return {
      response: NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.courseNotFound }, { status: 404 }),
      context: null,
    }
  }

  if (!course.feature_attendance) {
    return {
      response: NextResponse.json(
        { error: ATTENDANCE_ERROR_MESSAGES.attendanceNotEnabledForCourse },
        { status: 409 },
      ),
      context: null,
    }
  }

  return {
    response: null,
    context: { course, division },
  }
}

export async function requireAttendanceAdminCourseRequest(
  req: NextRequest,
  courseId: number,
  feature: AppFeatureKey = 'admin_student_management_enabled',
): Promise<GuardResult<AttendanceAdminCourseContext>> {
  const { error, payload } = await authenticateAdminRequest(req)
  if (error) {
    return { response: error, context: null }
  }

  const appFeatureError = await requireAppFeature('attendance_enabled')
  if (appFeatureError) {
    return { response: appFeatureError, context: null }
  }

  const featureError = await requireAppFeature(feature)
  if (featureError) {
    return { response: featureError, context: null }
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)

  if (!course) {
    return {
      response: NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.courseNotFound }, { status: 404 }),
      context: null,
    }
  }

  if (!course.feature_attendance) {
    return {
      response: NextResponse.json(
        { error: ATTENDANCE_ERROR_MESSAGES.attendanceNotEnabledForCourse },
        { status: 409 },
      ),
      context: null,
    }
  }

  return {
    response: null,
    context: { course, division, payload },
  }
}
