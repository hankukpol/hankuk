import { createServerClient } from '@/lib/supabase/server'
import {
  isPresenceLocationEnforced,
  isPresenceLocationFeatureActive,
  type PresenceFeature,
} from '@/lib/presence/shared'
import type { Course } from '@/types/database'

export type PresenceBrowserContext = 'kakao' | 'safari' | 'chrome' | 'pwa' | 'other'
export type PresenceErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'policy_blocked'
  | 'not_mobile'
  | 'missing_location'
  | 'invalid_location'
  | 'stale_location'
  | 'low_accuracy'
  | 'outside_radius'
  | 'config_required'

export type PresenceLocationPayload = {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: string
  source: 'browser-geolocation'
  browserContext?: PresenceBrowserContext
}

export type PresenceErrorPayload = {
  errorCode: PresenceErrorCode
  message?: string
  browserContext?: PresenceBrowserContext
}

export type PresenceVerificationResult = {
  required: boolean
  enforced: boolean
  ok: boolean
  shouldBlock: boolean
  code?: PresenceErrorCode
  message?: string
  distanceM?: number | null
  accuracyM?: number | null
  eventId?: number | null
}

type PresenceCourse = Pick<
  Course,
  | 'id'
  | 'presence_location_enabled'
  | 'presence_enforcement_mode'
  | 'presence_latitude'
  | 'presence_longitude'
  | 'presence_radius_m'
  | 'presence_accuracy_max_m'
  | 'presence_required_for_attendance'
  | 'presence_required_for_designated_seat'
>

type VerificationInput = {
  course: PresenceCourse
  enrollmentId: number
  feature: PresenceFeature
  location?: PresenceLocationPayload | null
  presenceError?: PresenceErrorPayload | null
  details?: Record<string, unknown>
}

const LOCATION_FRESHNESS_MS = 30_000
const MAX_ACCURACY_SLACK_M = 100

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180
}

function getDistanceMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const earthRadiusM = 6_371_000
  const latDelta = degreesToRadians(right.latitude - left.latitude)
  const lonDelta = degreesToRadians(right.longitude - left.longitude)
  const leftLat = degreesToRadians(left.latitude)
  const rightLat = degreesToRadians(right.latitude)

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lonDelta / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusM * c
}

function getPresenceFailureMessage(code: PresenceErrorCode) {
  switch (code) {
    case 'permission_denied':
      return '위치 권한이 허용되지 않았습니다. 위치 권한을 허용한 뒤 다시 시도해 주세요.'
    case 'timeout':
      return '위치 확인 시간이 초과되었습니다. 창을 닫지 말고 다시 시도해 주세요.'
    case 'position_unavailable':
      return '현재 기기에서 위치를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
    case 'policy_blocked':
      return '브라우저 정책 때문에 위치 확인이 차단되었습니다. Safari 또는 Chrome에서 다시 열어 주세요.'
    case 'unsupported':
      return '이 브라우저는 위치 확인을 지원하지 않습니다. Safari 또는 Chrome에서 이용해 주세요.'
    case 'not_mobile':
      return '출석과 좌석지정은 학생 본인의 스마트폰에서 진행해 주세요.'
    case 'stale_location':
      return '위치 정보가 오래되었습니다. 다시 시도해 주세요.'
    case 'low_accuracy':
      return '위치 정확도가 낮습니다. 창가 또는 통신이 잘 되는 곳에서 다시 시도해 주세요.'
    case 'outside_radius':
      return '학원 반경 밖으로 확인되었습니다. 현장에 있다면 다시 시도하거나 관리자에게 요청해 주세요.'
    case 'config_required':
      return '강의 위치 기준이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.'
    case 'invalid_location':
    case 'missing_location':
    default:
      return '위치 확인이 필요합니다. 다시 시도해 주세요.'
  }
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(3))
}

async function insertPresenceEvent(input: {
  courseId: number
  enrollmentId: number
  feature: PresenceFeature | 'exception_request'
  result: 'passed' | 'failed' | 'monitor_failed' | 'skipped' | 'exception_requested'
  enforcementMode: 'monitor' | 'enforce'
  distanceM?: number | null
  accuracyM?: number | null
  allowedRadiusM?: number | null
  allowedAccuracyM?: number | null
  location?: PresenceLocationPayload | null
  browserContext?: PresenceBrowserContext | null
  errorCode?: string | null
  message?: string | null
  details?: Record<string, unknown>
}) {
  const db = createServerClient()
  const { data, error } = await db
    .from('presence_verification_events')
    .insert({
      course_id: input.courseId,
      enrollment_id: input.enrollmentId,
      feature: input.feature,
      result: input.result,
      enforcement_mode: input.enforcementMode,
      distance_m: input.distanceM ?? null,
      accuracy_m: input.accuracyM ?? null,
      allowed_radius_m: input.allowedRadiusM ?? null,
      allowed_accuracy_m: input.allowedAccuracyM ?? null,
      rounded_latitude: input.location ? roundCoordinate(input.location.latitude) : null,
      rounded_longitude: input.location ? roundCoordinate(input.location.longitude) : null,
      browser_context: input.browserContext ?? input.location?.browserContext ?? null,
      error_code: input.errorCode ?? null,
      message: input.message ?? null,
      details: input.details ?? {},
    })
    .select('id')
    .maybeSingle()

  if (error) {
    return null
  }

  return typeof data?.id === 'number' ? data.id : null
}

export async function logPresenceExceptionRequest(input: {
  courseId: number
  enrollmentId: number
  feature: PresenceFeature
  browserContext?: PresenceBrowserContext | null
  errorCode?: string | null
  message?: string | null
  details?: Record<string, unknown>
}) {
  return insertPresenceEvent({
    courseId: input.courseId,
    enrollmentId: input.enrollmentId,
    feature: 'exception_request',
    result: 'exception_requested',
    enforcementMode: 'enforce',
    browserContext: input.browserContext ?? null,
    errorCode: input.errorCode ?? null,
    message: input.message ?? null,
    details: {
      requested_feature: input.feature,
      ...(input.details ?? {}),
    },
  })
}

export async function verifyPresenceLocation(input: VerificationInput): Promise<PresenceVerificationResult> {
  const required = isPresenceLocationFeatureActive(input.course, input.feature)
  const enforced = isPresenceLocationEnforced(input.course, input.feature)
  const enforcementMode: 'monitor' | 'enforce' = (input.course.presence_enforcement_mode ?? 'monitor') === 'enforce'
    ? 'enforce'
    : 'monitor'
  const allowedRadiusM = input.course.presence_radius_m ?? 180
  const allowedAccuracyM = input.course.presence_accuracy_max_m ?? 250

  if (!required) {
    return {
      required: false,
      enforced: false,
      ok: true,
      shouldBlock: false,
      eventId: await insertPresenceEvent({
        courseId: input.course.id,
        enrollmentId: input.enrollmentId,
        feature: input.feature,
        result: 'skipped',
        enforcementMode,
        details: input.details,
      }),
    }
  }

  const baseLog = {
    courseId: input.course.id,
    enrollmentId: input.enrollmentId,
    feature: input.feature,
    enforcementMode,
    allowedRadiusM,
    allowedAccuracyM,
    details: input.details,
  }

  const latitude = toFiniteNumber(input.location?.latitude)
  const longitude = toFiniteNumber(input.location?.longitude)
  const accuracy = toFiniteNumber(input.location?.accuracy)
  const targetLatitude = toFiniteNumber(input.course.presence_latitude)
  const targetLongitude = toFiniteNumber(input.course.presence_longitude)

  let failureCode: PresenceErrorCode | null = null
  let distanceM: number | null = null

  if (targetLatitude == null || targetLongitude == null) {
    failureCode = 'config_required'
  } else if (!input.location) {
    failureCode = input.presenceError?.errorCode ?? 'missing_location'
  } else if (
    latitude == null
    || longitude == null
    || accuracy == null
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) {
    failureCode = 'invalid_location'
  } else {
    const capturedAtMs = Date.parse(input.location.capturedAt)
    if (!Number.isFinite(capturedAtMs) || Date.now() - capturedAtMs > LOCATION_FRESHNESS_MS) {
      failureCode = 'stale_location'
    } else if (accuracy > allowedAccuracyM) {
      failureCode = 'low_accuracy'
    } else {
      distanceM = getDistanceMeters(
        { latitude: targetLatitude, longitude: targetLongitude },
        { latitude, longitude },
      )
      const allowedDistanceM = allowedRadiusM + Math.min(accuracy, MAX_ACCURACY_SLACK_M)

      if (distanceM > allowedDistanceM) {
        failureCode = 'outside_radius'
      }
    }
  }

  if (failureCode) {
    const message = input.presenceError?.message || getPresenceFailureMessage(failureCode)
    const result = enforced ? 'failed' : 'monitor_failed'
    const eventId = await insertPresenceEvent({
      ...baseLog,
      result,
      location: input.location ?? null,
      browserContext: input.presenceError?.browserContext ?? input.location?.browserContext ?? null,
      distanceM,
      accuracyM: accuracy,
      errorCode: failureCode,
      message,
    })

    return {
      required,
      enforced,
      ok: !enforced,
      shouldBlock: enforced,
      code: failureCode,
      message,
      distanceM,
      accuracyM: accuracy,
      eventId,
    }
  }

  const eventId = await insertPresenceEvent({
    ...baseLog,
    result: 'passed',
    location: input.location,
    distanceM,
    accuracyM: accuracy,
  })

  return {
    required,
    enforced,
    ok: true,
    shouldBlock: false,
    distanceM,
    accuracyM: accuracy,
    eventId,
  }
}
