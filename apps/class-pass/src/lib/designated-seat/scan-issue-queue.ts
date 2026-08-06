import type { DesignatedSeatScanIssueEventType } from '@/lib/designated-seat/scan-telemetry'
import { withTenantPrefix } from '@/lib/tenant'

const STORAGE_PREFIX = 'class_pass_designated_seat_scan_issue_queue'
const MAX_QUEUED_ISSUES = 50
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_DELAY_MS = 30_000

type ScanIssueCameraSettings = {
  width?: number
  height?: number
  frameRate?: number
  aspectRatio?: number
  zoom?: number
  focusMode?: string
  focusDistance?: number
}

type ScanIssueDeviceSignature = {
  platform?: string
  language?: string
  screen?: string
  timezone?: string
}

export type DesignatedSeatScanIssueInput = {
  courseId: number
  enrollmentId: number
  roomId?: number | null
  name: string
  phone: string
  eventType: DesignatedSeatScanIssueEventType
  reason: string
  durationMs?: number
  cameraLabel?: string
  cameraSettings?: ScanIssueCameraSettings
  responseStatus?: number
  responseCode?: string
  responseMessage?: string
  deviceSignature?: ScanIssueDeviceSignature
}

export type QueuedDesignatedSeatScanIssue = DesignatedSeatScanIssueInput & {
  eventId: string
  occurredAt: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const activeFlushes = new Map<string, Promise<void>>()
const retryTimers = new Map<string, number>()

function getStorageKey(tenantType: string) {
  return `${STORAGE_PREFIX}:${tenantType}`
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isQueuedIssue(value: unknown): value is QueuedDesignatedSeatScanIssue {
  if (!value || typeof value !== 'object') return false
  const issue = value as Partial<QueuedDesignatedSeatScanIssue>
  return (
    typeof issue.eventId === 'string'
    && typeof issue.occurredAt === 'string'
    && typeof issue.courseId === 'number'
    && typeof issue.enrollmentId === 'number'
    && typeof issue.name === 'string'
    && typeof issue.phone === 'string'
    && typeof issue.eventType === 'string'
    && typeof issue.reason === 'string'
  )
}

function makeEventId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

export function readDesignatedSeatScanIssueQueue(
  storage: StorageLike,
  tenantType: string,
  now = Date.now(),
) {
  try {
    const parsed = JSON.parse(storage.getItem(getStorageKey(tenantType)) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(isQueuedIssue)
      .filter((issue) => {
        const occurredAt = new Date(issue.occurredAt).getTime()
        return Number.isFinite(occurredAt) && now - occurredAt <= MAX_QUEUE_AGE_MS
      })
      .slice(-MAX_QUEUED_ISSUES)
  } catch {
    return []
  }
}

function writeQueue(storage: StorageLike, tenantType: string, issues: QueuedDesignatedSeatScanIssue[]) {
  storage.setItem(getStorageKey(tenantType), JSON.stringify(issues.slice(-MAX_QUEUED_ISSUES)))
}

export function appendDesignatedSeatScanIssue(
  storage: StorageLike,
  tenantType: string,
  issue: QueuedDesignatedSeatScanIssue,
) {
  const current = readDesignatedSeatScanIssueQueue(storage, tenantType)
  const withoutDuplicate = current.filter((item) => item.eventId !== issue.eventId)
  writeQueue(storage, tenantType, [...withoutDuplicate, issue])
}

function removeQueuedIssue(storage: StorageLike, tenantType: string, eventId: string) {
  const current = readDesignatedSeatScanIssueQueue(storage, tenantType)
  writeQueue(storage, tenantType, current.filter((issue) => issue.eventId !== eventId))
}

export function shouldDiscardQueuedScanIssueResponse(response: Pick<Response, 'ok' | 'status'>) {
  return response.ok || (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429)
}

async function sendIssue(issue: QueuedDesignatedSeatScanIssue, tenantType: string, fetcher: FetchLike) {
  return fetcher(withTenantPrefix('/api/designated-seats/scan-events', tenantType), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(issue),
  })
}

async function flushQueue(storage: StorageLike, tenantType: string, fetcher: FetchLike) {
  try {
    while (true) {
      const [nextIssue] = readDesignatedSeatScanIssueQueue(storage, tenantType)
      if (!nextIssue) {
        writeQueue(storage, tenantType, [])
        return false
      }

      let response: Response
      try {
        response = await sendIssue(nextIssue, tenantType, fetcher)
      } catch {
        return true
      }

      if (!shouldDiscardQueuedScanIssueResponse(response)) {
        return true
      }

      removeQueuedIssue(storage, tenantType, nextIssue.eventId)
    }
  } catch {
    return true
  }
}

function scheduleRetry(storage: StorageLike, tenantType: string, fetcher: FetchLike) {
  if (typeof window === 'undefined' || retryTimers.has(tenantType)) return

  const timer = window.setTimeout(() => {
    retryTimers.delete(tenantType)
    void flushDesignatedSeatScanIssueQueue(tenantType, { storage, fetcher })
  }, RETRY_DELAY_MS)
  retryTimers.set(tenantType, timer)
}

function clearScheduledRetry(tenantType: string) {
  if (typeof window === 'undefined') return
  const timer = retryTimers.get(tenantType)
  if (timer === undefined) return
  window.clearTimeout(timer)
  retryTimers.delete(tenantType)
}

export function flushDesignatedSeatScanIssueQueue(
  tenantType: string,
  options: { storage?: StorageLike | null; fetcher?: FetchLike } = {},
) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const fetcher = options.fetcher ?? fetch
  if (!storage) return Promise.resolve()

  const active = activeFlushes.get(tenantType)
  if (active) return active

  const pending = flushQueue(storage, tenantType, fetcher).then((shouldRetry) => {
    if (shouldRetry) {
      scheduleRetry(storage, tenantType, fetcher)
    } else {
      clearScheduledRetry(tenantType)
    }
  })
  activeFlushes.set(tenantType, pending)
  void pending.finally(() => {
    if (activeFlushes.get(tenantType) === pending) {
      activeFlushes.delete(tenantType)
    }
  })
  return pending
}

export function queueDesignatedSeatScanIssue(
  input: DesignatedSeatScanIssueInput,
  tenantType: string,
  options: { storage?: StorageLike | null; fetcher?: FetchLike; now?: Date } = {},
) {
  const issue: QueuedDesignatedSeatScanIssue = {
    ...input,
    eventId: makeEventId(),
    occurredAt: (options.now ?? new Date()).toISOString(),
  }
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const fetcher = options.fetcher ?? fetch

  if (!storage) {
    void sendIssue(issue, tenantType, fetcher).catch(() => null)
    return issue
  }

  try {
    appendDesignatedSeatScanIssue(storage, tenantType, issue)
  } catch {
    void sendIssue(issue, tenantType, fetcher).catch(() => null)
    return issue
  }

  void flushDesignatedSeatScanIssueQueue(tenantType, { storage, fetcher })
  return issue
}
