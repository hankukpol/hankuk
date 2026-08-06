export const DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES = [
  'student_qr_no_decode',
  'student_qr_camera_failed',
  'student_qr_auth_rejected',
] as const

export type DesignatedSeatScanIssueEventType = typeof DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES[number]

export const DESIGNATED_SEAT_NO_DECODE_MIN_DURATION_MS = 8_000
export const DESIGNATED_SEAT_NO_DECODE_AUTO_REPORT_MS = 15_000

export const DESIGNATED_SEAT_SCAN_ISSUE_LABELS: Record<DesignatedSeatScanIssueEventType, string> = {
  student_qr_no_decode: 'QR 미인식',
  student_qr_camera_failed: '카메라 시작 실패',
  student_qr_auth_rejected: '인증 거절',
}

export function shouldReportDesignatedSeatNoDecode(params: {
  durationMs: number
  decoded: boolean
  alreadyReported: boolean
}) {
  return (
    !params.decoded
    && !params.alreadyReported
    && params.durationMs >= DESIGNATED_SEAT_NO_DECODE_MIN_DURATION_MS
  )
}

export function isDesignatedSeatScanIssueEventType(value: string): value is DesignatedSeatScanIssueEventType {
  return DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES.includes(value as DesignatedSeatScanIssueEventType)
}
