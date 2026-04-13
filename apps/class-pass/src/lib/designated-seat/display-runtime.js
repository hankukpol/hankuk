export const DESIGNATED_SEAT_DISPLAY_HEARTBEAT_MS = 60_000
export const DESIGNATED_SEAT_DISPLAY_REFRESH_LEAD_MS = 2_000
export const DESIGNATED_SEAT_DISPLAY_MIN_REFRESH_MS = 1_000
export const DESIGNATED_SEAT_DISPLAY_RETRY_MS = 1_500

export function getRotationExpiresAt(rotation) {
  return new Date((rotation + 1) * 15_000).toISOString()
}

export function shouldUpdateDisplayHeartbeat(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) {
    return true
  }

  const lastSeenAtMs = Date.parse(lastSeenAt)
  if (!Number.isFinite(lastSeenAtMs)) {
    return true
  }

  return now - lastSeenAtMs >= DESIGNATED_SEAT_DISPLAY_HEARTBEAT_MS
}

export function getDisplayRefreshDelay(rotationExpiresAt, now = Date.now()) {
  const rotationExpiresAtMs = Date.parse(rotationExpiresAt)
  if (!Number.isFinite(rotationExpiresAtMs)) {
    return DESIGNATED_SEAT_DISPLAY_RETRY_MS
  }

  return Math.max(
    DESIGNATED_SEAT_DISPLAY_MIN_REFRESH_MS,
    rotationExpiresAtMs - now - DESIGNATED_SEAT_DISPLAY_REFRESH_LEAD_MS,
  )
}
