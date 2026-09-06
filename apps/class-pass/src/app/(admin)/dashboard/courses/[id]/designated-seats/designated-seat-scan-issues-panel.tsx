'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DESIGNATED_SEAT_SCAN_ISSUE_LABELS,
  type DesignatedSeatScanIssueEventType,
} from '@/lib/designated-seat/scan-telemetry'

type ScanIssue = {
  id: number
  eventType: DesignatedSeatScanIssueEventType
  details: Record<string, unknown>
  createdAt: string
  resolution: {
    eventId: number
    eventType: 'student_auth_success' | 'seat_reserved'
    resolvedAt: string
  } | null
  enrollment: {
    id: number
    name: string
    phone: string
    exam_number: string | null
  } | null
}

type ScanIssuesSummary = {
  totalIssues: number
  resolvedIssues: number
  unresolvedIssues: number
  affectedStudents: number
  unresolvedStudents: number
  noDecode: number
  cameraFailed: number
  authRejected: number
}

const EMPTY_SUMMARY: ScanIssuesSummary = {
  totalIssues: 0,
  resolvedIssues: 0,
  unresolvedIssues: 0,
  affectedStudents: 0,
  unresolvedStudents: 0,
  noDecode: 0,
  cameraFailed: 0,
  authRejected: 0,
}

type ScanIssuesPayload = {
  date: string
  issues: ScanIssue[]
  total: number
  summary: ScanIssuesSummary
  hasMore: boolean
  nextCursor: {
    createdAt: string
    id: number
  } | null
}

function getTodayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 4 ? `끝번호 ${digits.slice(-4)}` : value
}

function readDetail(details: Record<string, unknown>, key: string) {
  const value = details[key]
  return typeof value === 'string' ? value : ''
}

function detectBrowser(details: Record<string, unknown>) {
  const userAgent = readDetail(details, 'user_agent')
  if (/KAKAOTALK/i.test(userAgent)) return '카카오톡 내장 브라우저'
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    if (/CriOS/i.test(userAgent)) return 'iOS Chrome'
    return 'iOS Safari'
  }
  if (/Android/i.test(userAgent)) {
    if (/SamsungBrowser/i.test(userAgent)) return '삼성 인터넷'
    if (/Chrome/i.test(userAgent)) return 'Android Chrome'
    return 'Android 브라우저'
  }
  return '기타 브라우저'
}

function getCameraContext(details: Record<string, unknown>) {
  const settings = details.camera_settings
  if (!settings || typeof settings !== 'object') return ''

  const cameraSettings = settings as Record<string, unknown>
  const width = Number(cameraSettings.width)
  const height = Number(cameraSettings.height)
  const zoom = Number(cameraSettings.zoom)
  const focusMode = typeof cameraSettings.focusMode === 'string' ? cameraSettings.focusMode : ''
  const parts: string[] = []
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    parts.push(`${width}×${height}`)
  }
  if (Number.isFinite(zoom) && zoom > 0) {
    parts.push(`${zoom}배`)
  }
  if (focusMode) {
    parts.push(`초점 ${focusMode}`)
  }
  return parts.join(', ')
}

function describeCameraFailure(reason: string) {
  const messages: Record<string, string> = {
    camera_readiness_failed: '카메라 권한 또는 보안 연결 확인 실패',
    'not-supported': '브라우저가 카메라 선택을 지원하지 않음',
    'rear-camera-not-found': '후면 카메라를 찾지 못함',
    'safe-main-camera-not-found': '1배 기본 후면 카메라를 식별하지 못함',
    camera_start_failed: '선택한 카메라 스트림 시작 실패',
  }
  return messages[reason] ?? '카메라 시작 실패'
}

function describeIssue(issue: ScanIssue) {
  const duration = Number(issue.details.duration_ms)
  const durationLabel = Number.isFinite(duration) && duration > 0
    ? `${Math.max(1, Math.round(duration / 1000))}초`
    : ''
  const responseMessage = readDetail(issue.details, 'response_message')
  const responseCode = readDetail(issue.details, 'response_code')
  const cameraLabel = readDetail(issue.details, 'camera_label')
  const reason = readDetail(issue.details, 'reason')
  const cameraContext = getCameraContext(issue.details)

  if (issue.eventType === 'student_qr_no_decode') {
    const context = [cameraLabel, cameraContext].filter(Boolean).join(', ')
    const description = reason === 'decode_timeout'
      ? `${durationLabel || '15초 이상'} QR을 읽지 못해 장시간 미인식으로 기록`
      : reason === 'page_hidden_without_decode'
        ? `${durationLabel || '8초 이상'} QR을 읽기 전에 화면을 벗어남`
        : `${durationLabel || '8초 이상'} QR을 읽지 못하고 스캔을 종료`
    return `${description}${context ? ` (${context})` : ''}`
  }
  if (issue.eventType === 'student_qr_camera_failed') {
    return describeCameraFailure(reason)
  }
  const rejectionMessages: Record<string, string> = {
    QR_COURSE_MISMATCH: '다른 강좌 QR을 인식했습니다. 현재 수강증과 같은 강좌 QR만 카메라 화면에 담아 다시 스캔해야 합니다.',
    QR_TOKEN_INVALID_OR_EXPIRED: 'QR이 만료되었거나 검증할 수 없습니다. 모니터의 최신 QR을 다시 스캔해야 합니다.',
    QR_TOKEN_TIME_INVALID: 'QR 교체 시간이 지나 인증되지 않았습니다. 새로 표시된 QR을 다시 스캔해야 합니다.',
    QR_SESSION_EXPIRED: '모니터의 QR 표시 세션이 종료되었습니다. 관리자가 표시를 다시 시작해야 합니다.',
    QR_ROOM_MISMATCH: '선택한 강의실과 다른 강의실 QR을 인식했습니다.',
  }
  if (responseCode && rejectionMessages[responseCode]) {
    return rejectionMessages[responseCode]
  }
  return responseMessage || (reason === 'network_error' ? '네트워크 연결 실패' : 'QR 해독 후 서버 인증 거절')
}

function getResolutionLabel(issue: ScanIssue) {
  if (!issue.resolution) return null
  return issue.resolution.eventType === 'seat_reserved' ? '좌석 지정 완료' : '재인증 성공'
}

export function DesignatedSeatScanIssuesPanel({ courseId }: { courseId: number }) {
  const today = getTodayKst()
  const [date, setDate] = useState(today)
  const [issues, setIssues] = useState<ScanIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<ScanIssuesSummary>(EMPTY_SUMMARY)
  const [nextCursor, setNextCursor] = useState<ScanIssuesPayload['nextCursor']>(null)
  const requestSequenceRef = useRef(0)
  const requestAbortRef = useRef<AbortController | null>(null)

  const loadIssues = useCallback(async (
    targetDate: string,
    cursor: ScanIssuesPayload['nextCursor'] = null,
    append = false,
  ) => {
    const requestId = ++requestSequenceRef.current
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setIssues([])
      setTotal(0)
      setSummary(EMPTY_SUMMARY)
      setNextCursor(null)
    }
    setError('')
    try {
      const query = new URLSearchParams({ courseId: String(courseId), date: targetDate })
      if (cursor) {
        query.set('cursorCreatedAt', cursor.createdAt)
        query.set('cursorId', String(cursor.id))
      }
      const response = await fetch(`/api/designated-seats/admin/scan-issues?${query.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = (await response.json().catch(() => null)) as ScanIssuesPayload | { error?: string } | null
      if (!response.ok) {
        throw new Error(payload && 'error' in payload ? payload.error ?? 'QR 문제 내역을 불러오지 못했습니다.' : 'QR 문제 내역을 불러오지 못했습니다.')
      }
      const successPayload = payload as ScanIssuesPayload
      if (successPayload.date !== targetDate || requestId !== requestSequenceRef.current) {
        return
      }

      setIssues((current) => {
        if (!append) return successPayload.issues
        const merged = new Map(current.map((issue) => [issue.id, issue]))
        successPayload.issues.forEach((issue) => merged.set(issue.id, issue))
        return [...merged.values()]
      })
      if (!append) {
        setTotal(successPayload.total)
      }
      setSummary(successPayload.summary)
      setNextCursor(successPayload.hasMore ? successPayload.nextCursor : null)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      if (requestId === requestSequenceRef.current) {
        setError(reason instanceof Error ? reason.message : 'QR 문제 내역을 불러오지 못했습니다.')
      }
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [courseId])

  useEffect(() => {
    void loadIssues(date)
    return () => {
      requestSequenceRef.current += 1
      requestAbortRef.current?.abort()
    }
  }, [date, loadIssues])

  return (
    <section className="rounded-[8px] bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="admin-section-title">QR 문제 추적</h3>
          <p className="mt-1 text-sm leading-6 text-[#86868b]">
            학생이 QR을 읽지 못했거나 카메라 시작 또는 인증 단계에서 실패한 내역과 후속 해결 상태입니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#86868b]">조회 날짜</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value || today)}
              className="rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3]"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadIssues(date)}
            disabled={loading}
            className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
          >
            {loading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="admin-metric-strip mt-5">
        {[
          { label: '발생 기록', value: summary.totalIssues, valueClassName: 'text-[#1d1d1f]' },
          {
            label: '현재 미해결',
            value: summary.unresolvedIssues,
            valueClassName: summary.unresolvedIssues > 0 ? 'text-[#ff3b30]' : 'text-[#047857]',
          },
          { label: 'QR 미인식', value: summary.noDecode },
          { label: '카메라 실패', value: summary.cameraFailed },
          { label: '인증 거절', value: summary.authRejected },
        ].map((item) => (
          <div key={item.label} className="bg-[#f5f5f7]">
            <p className="text-xs font-semibold text-[#86868b]">{item.label}</p>
            <p className={`mt-1 font-semibold ${item.valueClassName ?? 'text-[#1d1d1f]'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {summary.totalIssues > 0 ? (
        <p className="mt-3 text-xs text-[#86868b]">
          영향 학생 {summary.affectedStudents.toLocaleString('ko-KR')}명, 해결 완료 {summary.resolvedIssues.toLocaleString('ko-KR')}건,
          현재 조치 필요 {summary.unresolvedStudents.toLocaleString('ko-KR')}명입니다.
        </p>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 text-xs text-[#86868b] sm:flex-row sm:items-center sm:justify-between">
          <p>
            현재 {issues.length.toLocaleString('ko-KR')}건 / 전체 {total.toLocaleString('ko-KR')}건을 표시하고 있습니다.
          </p>
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void loadIssues(date, nextCursor, true)}
              disabled={loading || loadingMore}
              className="self-start rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#0066cc] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 sm:self-auto"
            >
              {loadingMore ? '추가 기록 불러오는 중...' : '이전 기록 더 보기'}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-[#ff3b30]">{getUserErrorMessage(error)}</p> : null}

      {!loading && !error && issues.length === 0 ? (
        <div className="mt-5 rounded-[8px] bg-[#f5f5f7] px-4 py-8 text-center">
          <p className="text-sm font-semibold text-[#1d1d1f]">기록된 QR 문제가 없습니다.</p>
          <p className="mt-1 text-xs text-[#86868b]">문제 기록은 이 기능이 배포된 이후부터 수집됩니다.</p>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <>
          <div className="mt-5 space-y-3 sm:hidden">
            {issues.map((issue) => (
              <article key={issue.id} className="rounded-[8px] border border-[#d2d2d7] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{issue.enrollment?.name ?? '학생 정보 없음'}</p>
                    <p className="mt-1 text-xs text-[#86868b]">
                      {issue.enrollment?.exam_number ? `수험번호 ${issue.enrollment.exam_number}` : '수험번호 없음'}
                      {issue.enrollment?.phone ? `, ${maskPhone(issue.enrollment.phone)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-xs font-semibold text-[#0066cc]">
                      {DESIGNATED_SEAT_SCAN_ISSUE_LABELS[issue.eventType]}
                    </p>
                    {issue.resolution ? (
                      <span className="rounded-[8px] bg-[#ecfdf5] px-2 py-1 text-[11px] font-semibold text-[#047857]">해결됨</span>
                    ) : (
                      <span className="rounded-[8px] bg-[#f5f5f7] px-2 py-1 text-[11px] font-semibold text-[#ff3b30]">확인 필요</span>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#1d1d1f]">{describeIssue(issue)}</p>
                {issue.resolution ? (
                  <p className="mt-2 text-xs font-semibold text-[#047857]">
                    {formatTime(issue.resolution.resolvedAt)} {getResolutionLabel(issue)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[#86868b]">{formatTime(issue.createdAt)}, {detectBrowser(issue.details)}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#d2d2d7] text-xs font-semibold text-[#86868b]">
                  <th className="px-3 py-3">시간</th>
                  <th className="px-3 py-3">학생</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3">상세</th>
                  <th className="px-3 py-3">브라우저</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className="border-b border-[#f5f5f7] align-top last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-3 text-[#86868b]">{formatTime(issue.createdAt)}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-[#1d1d1f]">{issue.enrollment?.name ?? '학생 정보 없음'}</p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        {issue.enrollment?.exam_number ? `수험번호 ${issue.enrollment.exam_number}` : '수험번호 없음'}
                        {issue.enrollment?.phone ? `, ${maskPhone(issue.enrollment.phone)}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#0066cc]">
                      {DESIGNATED_SEAT_SCAN_ISSUE_LABELS[issue.eventType]}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {issue.resolution ? (
                        <div>
                          <span className="inline-flex rounded-[8px] bg-[#ecfdf5] px-2 py-1 text-xs font-semibold text-[#047857]">해결됨</span>
                          <p className="mt-1 text-xs text-[#86868b]">
                            {formatTime(issue.resolution.resolvedAt)} {getResolutionLabel(issue)}
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-[8px] bg-[#f5f5f7] px-2 py-1 text-xs font-semibold text-[#ff3b30]">확인 필요</span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-3 leading-6 text-[#1d1d1f]">{describeIssue(issue)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#86868b]">{detectBrowser(issue.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
