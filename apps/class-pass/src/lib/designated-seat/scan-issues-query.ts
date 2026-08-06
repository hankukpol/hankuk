export const DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE = 200
export const DESIGNATED_SEAT_SCAN_ISSUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const DESIGNATED_SEAT_SCAN_ISSUE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidKstDateKey(dateKey: string) {
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return (
    candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
  )
}

export function getKstDateBounds(dateKey: string) {
  if (!isValidKstDateKey(dateKey)) {
    throw new Error('Invalid KST date key')
  }

  const start = new Date(`${dateKey}T00:00:00+09:00`)
  return {
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function normalizeDesignatedSeatScanIssueOccurredAt(clientOccurredAt: string, now = Date.now()) {
  const clientTime = new Date(clientOccurredAt).getTime()
  const adjusted = (
    clientTime < now - DESIGNATED_SEAT_SCAN_ISSUE_MAX_AGE_MS
    || clientTime > now + DESIGNATED_SEAT_SCAN_ISSUE_MAX_FUTURE_SKEW_MS
  )
  return {
    occurredAt: adjusted ? new Date(now).toISOString() : clientOccurredAt,
    adjusted,
  }
}
