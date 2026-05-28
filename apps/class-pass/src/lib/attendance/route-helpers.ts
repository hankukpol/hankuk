import { NextRequest, NextResponse } from 'next/server'
import type { AppFeatureKey } from '@/lib/app-config.shared'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { checkRateLimit } from '@/lib/auth/rateLimiter'
import { getCourseById } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Course, StaffJwtPayload } from '@/types/database'
export { hasCourseAttendanceStarted } from '@/lib/attendance/date'

export const ATTENDANCE_ERROR_MESSAGES = {
  invalidDisplayRequest: '출석 화면 요청 형식이 올바르지 않습니다.',
  invalidSubmitRequest: '출석 요청 형식이 올바르지 않습니다.',
  invalidDisplaySessionRequest: '출석 세션 요청 형식이 올바르지 않습니다.',
  invalidDisplayStopRequest: '출석 종료 요청 형식이 올바르지 않습니다.',
  invalidDashboardRequest: '출석 대시보드 요청 형식이 올바르지 않습니다.',
  invalidAbsenceReportRequest: '결석 리포트 요청 형식이 올바르지 않습니다.',
  invalidOverrideRequest: '수동 출석 요청 형식이 올바르지 않습니다.',
  invalidExcuseRequest: '사유서 요청 형식이 올바르지 않습니다.',
  courseNotFound: '강의를 찾을 수 없습니다.',
  attendanceNotEnabledForCourse: '이 강의는 출석 기능을 사용하지 않습니다.',
  attendanceNotStarted: '수강 시작일 이후부터 출석 체크를 진행할 수 있습니다.',
  loadDisplayFailed: '출석 화면 정보를 불러오지 못했습니다.',
  loadDashboardFailed: '출석 현황을 불러오지 못했습니다.',
  loadAbsenceReportFailed: '결석 리포트를 불러오지 못했습니다.',
  loadExcusesFailed: '사유서 목록을 불러오지 못했습니다.',
  startSessionFailed: '출석 세션을 시작하지 못했습니다.',
  stopSessionFailed: '출석 세션을 종료하지 못했습니다.',
  overrideFailed: '수동 출석 처리에 실패했습니다.',
  createExcuseFailed: '사유서를 등록하지 못했습니다.',
  updateExcuseFailed: '사유서를 수정하지 못했습니다.',
  deleteExcuseFailed: '사유서를 삭제하지 못했습니다.',
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

const ATTENDANCE_CARE_RATE_LIMIT = {
  maxAttempts: 60,
  windowSeconds: 60,
} as const

const ATTENDANCE_CARE_PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex',
} as const

function mergeAttendanceCareHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers)
  for (const [key, value] of Object.entries(ATTENDANCE_CARE_PRIVATE_HEADERS)) {
    nextHeaders.set(key, value)
  }
  return nextHeaders
}

export function withAttendanceCareHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(ATTENDANCE_CARE_PRIVATE_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export function attendanceCareJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: mergeAttendanceCareHeaders(init.headers),
  })
}

function getAttendanceCareRateLimitActor(payload: StaffJwtPayload | null) {
  return (
    payload?.adminId?.trim()
    || payload?.sub?.trim()
    || (payload?.accountId == null ? null : String(payload.accountId))
    || payload?.staffName?.trim()
    || 'unknown'
  )
}

export async function requireAttendanceCareRateLimit(
  payload: StaffJwtPayload | null,
  courseId: number,
): Promise<NextResponse | null> {
  const actor = getAttendanceCareRateLimitActor(payload)
  const rateLimit = await checkRateLimit(`attendance-care:${actor}:course:${courseId}`, ATTENDANCE_CARE_RATE_LIMIT)

  if (rateLimit.allowed) {
    return null
  }

  const retryAfterSec = Math.max(Math.ceil(rateLimit.retryAfterMs / 1000), 1)
  return attendanceCareJson(
    {
      error: 'Too many requests. Try again later.',
      retryAfterMs: rateLimit.retryAfterMs,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  )
}

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

export async function requireCareAdminCourseRequest(
  req: NextRequest,
  courseId: number,
): Promise<GuardResult<AttendanceAdminCourseContext>> {
  const { error, payload } = await authenticateAdminRequest(req)
  if (error) {
    return { response: error, context: null }
  }

  const studentFeatureError = await requireAppFeature('admin_student_management_enabled')
  const seatFeatureError = await requireAppFeature('admin_seat_management_enabled')
  if (studentFeatureError && seatFeatureError) {
    return {
      response: NextResponse.json(
        { error: '결석자 관리 기능을 사용할 수 없습니다. 학생 관리 또는 좌석 관리 권한이 필요합니다.' },
        { status: 403 },
      ),
      context: null,
    }
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)

  if (!course) {
    return {
      response: NextResponse.json({ error: ATTENDANCE_ERROR_MESSAGES.courseNotFound }, { status: 404 }),
      context: null,
    }
  }

  if (!course.feature_attendance && !course.feature_designated_seat) {
    return {
      response: NextResponse.json(
        { error: '이 강의는 출석 또는 지정좌석 기능을 사용하지 않습니다.' },
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
