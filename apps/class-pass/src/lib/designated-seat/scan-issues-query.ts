export const DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE = 200
export const DESIGNATED_SEAT_SCAN_ISSUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const DESIGNATED_SEAT_SCAN_ISSUE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
export const DESIGNATED_SEAT_SCAN_RESOLUTION_EVENT_TYPES = [
  'student_auth_success',
  'seat_reserved',
] as const

export type DesignatedSeatScanResolutionEventType = typeof DESIGNATED_SEAT_SCAN_RESOLUTION_EVENT_TYPES[number]

export type DesignatedSeatScanIssueRecord = {
  id: number
  enrollmentId: number | null
  recordedAt: string
}

export type DesignatedSeatScanResolutionRecord = {
  id: number
  enrollmentId: number | null
  eventType: DesignatedSeatScanResolutionEventType
  recordedAt: string
}

export type DesignatedSeatScanIssueResolution = {
  eventId: number
  eventType: DesignatedSeatScanResolutionEventType
  resolvedAt: string
}

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

export function buildDesignatedSeatScanIssueResolutionMap(
  issues: DesignatedSeatScanIssueRecord[],
  resolutionEvents: DesignatedSeatScanResolutionRecord[],
) {
  const resolutionEventsByEnrollment = new Map<number, DesignatedSeatScanResolutionRecord[]>()
  for (const event of resolutionEvents) {
    if (!event.enrollmentId) continue
    const current = resolutionEventsByEnrollment.get(event.enrollmentId) ?? []
    current.push(event)
    resolutionEventsByEnrollment.set(event.enrollmentId, current)
  }
  for (const events of resolutionEventsByEnrollment.values()) {
    events.sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt))
  }

  const resolutions = new Map<number, DesignatedSeatScanIssueResolution>()
  for (const issue of issues) {
    if (!issue.enrollmentId) continue
    const issueTime = Date.parse(issue.recordedAt)
    if (!Number.isFinite(issueTime)) continue
    const laterEvents = (resolutionEventsByEnrollment.get(issue.enrollmentId) ?? []).filter((event) => {
      const eventTime = Date.parse(event.recordedAt)
      return Number.isFinite(eventTime) && eventTime > issueTime
    })
    // 좌석 지정은 재인증보다 강한 해결 근거이므로 둘 다 있으면 완료 상태를 우선 보여 줍니다.
    const resolution = laterEvents.find((event) => event.eventType === 'seat_reserved') ?? laterEvents[0]
    if (!resolution) continue
    resolutions.set(issue.id, {
      eventId: resolution.id,
      eventType: resolution.eventType,
      resolvedAt: resolution.recordedAt,
    })
  }
  return resolutions
}
