import { ATTENDANCE_ROTATION_MS } from '@/lib/attendance/constants'

export const ATTENDANCE_DISPLAY_HEARTBEAT_MS = 60_000
export const ATTENDANCE_DISPLAY_REFRESH_LEAD_MS = 2_000
export const ATTENDANCE_DISPLAY_MIN_REFRESH_MS = 1_000
export const ATTENDANCE_DISPLAY_RETRY_MS = 1_500

export function getAttendanceRotationExpiresAt(rotation: number) {
  return new Date((rotation + 1) * ATTENDANCE_ROTATION_MS).toISOString()
}

export function shouldUpdateAttendanceHeartbeat(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) {
    return true
  }

  const lastSeenAtMs = Date.parse(lastSeenAt)
  if (!Number.isFinite(lastSeenAtMs)) {
    return true
  }

  return now - lastSeenAtMs >= ATTENDANCE_DISPLAY_HEARTBEAT_MS
}

export function getAttendanceDisplayRefreshDelay(rotationExpiresAt: string, now = Date.now()) {
  const rotationExpiresAtMs = Date.parse(rotationExpiresAt)
  if (!Number.isFinite(rotationExpiresAtMs)) {
    return ATTENDANCE_DISPLAY_RETRY_MS
  }

  return Math.max(
    ATTENDANCE_DISPLAY_MIN_REFRESH_MS,
    rotationExpiresAtMs - now - ATTENDANCE_DISPLAY_REFRESH_LEAD_MS,
  )
}
