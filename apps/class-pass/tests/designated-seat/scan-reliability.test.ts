import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import {
  DESIGNATED_SEAT_COMPACT_QR_FRAME_PADDING,
  DESIGNATED_SEAT_COMPACT_QR_MIN_SIZE,
  DESIGNATED_SEAT_COMPACT_VERTICAL_RESERVE,
  DESIGNATED_SEAT_MULTI_QR_SIZE,
  DESIGNATED_SEAT_SINGLE_QR_SIZE,
  DESIGNATED_SEAT_TWO_UP_QR_SIZE,
  getDesignatedSeatCompactQrFrameWidth,
  getDesignatedSeatQrSize,
} from '../../src/lib/designated-seat/display-layout'
import {
  appendDesignatedSeatScanIssue,
  flushDesignatedSeatScanIssueQueue,
  readDesignatedSeatScanIssueQueue,
  shouldDiscardQueuedScanIssueResponse,
  type QueuedDesignatedSeatScanIssue,
} from '../../src/lib/designated-seat/scan-issue-queue'
import {
  buildDesignatedSeatScanIssueResolutionMap,
  DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE,
  getKstDateBounds,
  isValidKstDateKey,
  normalizeDesignatedSeatScanIssueOccurredAt,
} from '../../src/lib/designated-seat/scan-issues-query'
import {
  DESIGNATED_SEAT_NO_DECODE_AUTO_REPORT_MS,
  DESIGNATED_SEAT_NO_DECODE_MIN_DURATION_MS,
  DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES,
  isDesignatedSeatScanIssueEventType,
  shouldReportDesignatedSeatNoDecode,
} from '../../src/lib/designated-seat/scan-telemetry'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

function createQueuedIssue(overrides: Partial<QueuedDesignatedSeatScanIssue> = {}): QueuedDesignatedSeatScanIssue {
  return {
    eventId: '4f93f62d-25f4-478e-bcbf-60fb92057b46',
    occurredAt: '2026-08-06T00:00:00.000Z',
    courseId: 32,
    enrollmentId: 101,
    roomId: 1,
    name: '테스트 학생',
    phone: '01012345678',
    eventType: 'student_qr_no_decode',
    reason: 'decode_timeout',
    durationMs: 15_000,
    ...overrides,
  }
}

function getQrModuleCount(value: string) {
  const markup = renderToStaticMarkup(createElement(QRCodeSVG, {
    value,
    size: DESIGNATED_SEAT_TWO_UP_QR_SIZE,
    level: 'M',
    includeMargin: true,
  }))
  const viewBox = markup.match(/viewBox="0 0 (\d+) (\d+)"/)
  assert.ok(viewBox)
  return Number(viewBox[1])
}

test('two-up designated-seat display enlarges QR while preserving safe sizes for other layouts', () => {
  assert.equal(getDesignatedSeatQrSize(1, false), DESIGNATED_SEAT_SINGLE_QR_SIZE)
  assert.equal(getDesignatedSeatQrSize(2, true), DESIGNATED_SEAT_TWO_UP_QR_SIZE)
  assert.equal(getDesignatedSeatQrSize(3, true), DESIGNATED_SEAT_MULTI_QR_SIZE)
  assert.ok(DESIGNATED_SEAT_TWO_UP_QR_SIZE > DESIGNATED_SEAT_MULTI_QR_SIZE)
})

test('two-up QR keeps at least six rendered pixels per module for the current token density', () => {
  const representativeValue = `https://designated-seat.local/verify?token=${'x'.repeat(205)}`
  const moduleCount = getQrModuleCount(representativeValue)

  assert.equal(moduleCount, 69)
  assert.ok(DESIGNATED_SEAT_TWO_UP_QR_SIZE / moduleCount >= 6)
  assert.ok(DESIGNATED_SEAT_SINGLE_QR_SIZE / moduleCount >= 7.5)
})

test('compact QR frame clamps by viewport height while preserving the minimum readable size', () => {
  assert.equal(DESIGNATED_SEAT_COMPACT_QR_MIN_SIZE, 260)
  assert.equal(DESIGNATED_SEAT_COMPACT_QR_FRAME_PADDING, 40)
  assert.equal(DESIGNATED_SEAT_COMPACT_VERTICAL_RESERVE, 280)
  assert.equal(
    getDesignatedSeatCompactQrFrameWidth(2),
    'min(100%, clamp(300px, calc(100dvh - 280px), 460px))',
  )
})

test('scan issue telemetry accepts only the three operational failure stages', () => {
  assert.deepEqual(DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES, [
    'student_qr_no_decode',
    'student_qr_camera_failed',
    'student_qr_auth_rejected',
  ])
  assert.equal(isDesignatedSeatScanIssueEventType('student_qr_no_decode'), true)
  assert.equal(isDesignatedSeatScanIssueEventType('student_auth_success'), false)
  assert.equal(DESIGNATED_SEAT_NO_DECODE_MIN_DURATION_MS, 8_000)
  assert.equal(DESIGNATED_SEAT_NO_DECODE_AUTO_REPORT_MS, 15_000)
  assert.equal(shouldReportDesignatedSeatNoDecode({ durationMs: 7_999, decoded: false, alreadyReported: false }), false)
  assert.equal(shouldReportDesignatedSeatNoDecode({ durationMs: 8_000, decoded: false, alreadyReported: false }), true)
  assert.equal(shouldReportDesignatedSeatNoDecode({ durationMs: 20_000, decoded: true, alreadyReported: false }), false)
  assert.equal(shouldReportDesignatedSeatNoDecode({ durationMs: 20_000, decoded: false, alreadyReported: true }), false)
})

test('scan issue queue survives network failure and removes only delivered records', async (t) => {
  // Keep the retry scenario inside the queue TTL, independent of the test run date.
  t.mock.method(Date, 'now', () => Date.parse('2026-08-06T00:01:00.000Z'))
  const storage = new MemoryStorage()
  const tenantType = 'queue-test'
  appendDesignatedSeatScanIssue(storage, tenantType, createQueuedIssue())

  await flushDesignatedSeatScanIssueQueue(tenantType, {
    storage,
    fetcher: async () => {
      throw new TypeError('offline')
    },
  })
  assert.equal(readDesignatedSeatScanIssueQueue(storage, tenantType, Date.parse('2026-08-06T00:01:00.000Z')).length, 1)

  await flushDesignatedSeatScanIssueQueue(tenantType, {
    storage,
    fetcher: async () => new Response('{}', { status: 200 }),
  })
  assert.equal(readDesignatedSeatScanIssueQueue(storage, tenantType, Date.parse('2026-08-06T00:01:00.000Z')).length, 0)
  assert.equal(shouldDiscardQueuedScanIssueResponse({ ok: false, status: 503 }), false)
  assert.equal(shouldDiscardQueuedScanIssueResponse({ ok: false, status: 429 }), false)
  assert.equal(shouldDiscardQueuedScanIssueResponse({ ok: false, status: 404 }), true)
})

test('KST scan issue date validation rejects normalized and impossible dates', () => {
  assert.equal(isValidKstDateKey('2026-08-06'), true)
  assert.equal(isValidKstDateKey('2026-02-29'), false)
  assert.equal(isValidKstDateKey('2026-02-30'), false)
  assert.equal(isValidKstDateKey('2026-99-99'), false)
  assert.deepEqual(getKstDateBounds('2026-08-06'), {
    startIso: '2026-08-05T15:00:00.000Z',
    endIso: '2026-08-06T15:00:00.000Z',
  })
  const serverNow = Date.parse('2026-08-06T01:00:00.000Z')
  assert.deepEqual(normalizeDesignatedSeatScanIssueOccurredAt('2026-08-06T00:59:00.000Z', serverNow), {
    occurredAt: '2026-08-06T00:59:00.000Z',
    adjusted: false,
  })
  assert.deepEqual(normalizeDesignatedSeatScanIssueOccurredAt('2025-08-06T00:00:00.000Z', serverNow), {
    occurredAt: '2026-08-06T01:00:00.000Z',
    adjusted: true,
  })
  assert.equal(DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE, 200)
})

test('later authentication or reservation resolves only earlier scan issues for the same student', () => {
  const resolutions = buildDesignatedSeatScanIssueResolutionMap(
    [
      { id: 1, enrollmentId: 101, recordedAt: '2026-08-06T01:58:24.000Z' },
      { id: 2, enrollmentId: 102, recordedAt: '2026-08-06T01:58:24.000Z' },
      { id: 3, enrollmentId: 101, recordedAt: '2026-08-06T01:59:40.000Z' },
    ],
    [
      {
        id: 11,
        enrollmentId: 101,
        eventType: 'student_auth_success',
        recordedAt: '2026-08-06T01:58:28.000Z',
      },
      {
        id: 12,
        enrollmentId: 102,
        eventType: 'seat_reserved',
        recordedAt: '2026-08-06T01:58:45.000Z',
      },
      {
        id: 13,
        enrollmentId: 101,
        eventType: 'seat_reserved',
        recordedAt: '2026-08-06T01:59:10.000Z',
      },
    ],
  )

  assert.deepEqual(resolutions.get(1), {
    eventId: 13,
    eventType: 'seat_reserved',
    resolvedAt: '2026-08-06T01:59:10.000Z',
  })
  assert.deepEqual(resolutions.get(2), {
    eventId: 12,
    eventType: 'seat_reserved',
    resolvedAt: '2026-08-06T01:58:45.000Z',
  })
  assert.equal(resolutions.has(3), false)
})
