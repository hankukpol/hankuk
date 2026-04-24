'use client'

import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { PresenceFailureActions } from '@/components/student/PresenceFailureActions'
import { StudentAccessGuide } from '@/components/student/StudentAccessGuide'
import { useTenantConfig } from '@/components/TenantProvider'
import { getPresenceLocation, type ClientPresenceError } from '@/lib/client/geolocation'
import { isPresenceLocationEnforced, isPresenceLocationFeatureActive } from '@/lib/presence/shared'
import type { PassPayload } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'
const DEVICE_KEY_STORAGE = 'class_pass_designated_seat_device'
const DIGIT_COUNT = 6

function ensureLocalDeviceKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE)
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
    return existing
  }

  const generated = `${crypto.randomUUID().replace(/-/g, '')}_${Date.now().toString(36)}`
  window.localStorage.setItem(DEVICE_KEY_STORAGE, generated)
  return generated
}

function formatTime(value: string | null) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAttendanceDate(value: string | null) {
  if (!value) {
    return ''
  }

  return getKstDateKey(value).replace(/-/g, '.')
}

function formatAttendanceDateKey(value: string) {
  return value.replace(/-/g, '.')
}

function getKstDateKey(value: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function isCourseAttendanceNotStarted(enrolledFrom: string | null) {
  if (!enrolledFrom) {
    return false
  }

  return getKstDateKey() < enrolledFrom.slice(0, 10)
}

function getInitialDigits() {
  return Array.from({ length: DIGIT_COUNT }, () => '')
}

export default function StudentAttendancePage() {
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tenant = useTenantConfig()
  const enrollmentId = Number(searchParams.get('enrollmentId'))

  const [data, setData] = useState<PassPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deviceKey, setDeviceKey] = useState('')
  const [presenceFailure, setPresenceFailure] = useState<ClientPresenceError | null>(null)
  const [digits, setDigits] = useState<string[]>(getInitialDigits)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    setDeviceKey(ensureLocalDeviceKey())
  }, [])

  const goBack = useCallback(() => {
    router.push(withTenantPrefix(`/courses/${params.courseSlug}?enrollmentId=${enrollmentId}`, tenant.type))
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  const loadData = useCallback(async () => {
    const name = sessionStorage.getItem(LS_NAME) ?? ''
    const phone = sessionStorage.getItem(LS_PHONE) ?? ''

    if (!name || !phone || !Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      router.replace(withTenantPrefix('/', tenant.type))
      return
    }

    const response = await fetch(withTenantPrefix('/api/enrollments/pass', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        courseSlug: params.courseSlug,
        name,
        phone,
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.error ?? '출결 정보를 불러오지 못했습니다.')
    }

    setData(payload as PassPayload)
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  useEffect(() => {
    let cancelled = false

    loadData()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '출결 정보를 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadData])

  const codeValue = useMemo(() => digits.join(''), [digits])

  function updateDigit(index: number, rawValue: string) {
    const nextChar = rawValue.replace(/\D/g, '').slice(-1)
    setDigits((current) => {
      const next = [...current]
      next[index] = nextChar
      return next
    })

    if (nextChar && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
      setDigits((current) => {
        const next = [...current]
        next[index - 1] = ''
        return next
      })
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }

    if (event.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(value: string) {
    const pasted = value.replace(/\D/g, '').slice(0, DIGIT_COUNT)
    if (!pasted) {
      return
    }

    setDigits(Array.from({ length: DIGIT_COUNT }, (_, index) => pasted[index] ?? ''))
    inputRefs.current[Math.min(pasted.length, DIGIT_COUNT) - 1]?.focus()
  }

  async function handleSubmit() {
    if (!data) {
      return
    }

    if (codeValue.length !== DIGIT_COUNT) {
      setError('6자리 코드를 모두 입력해 주세요.')
      return
    }

    if (!deviceKey) {
      setError('기기 정보를 준비하는 중입니다. 잠시 뒤 다시 시도해 주세요.')
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    setPresenceFailure(null)

    const shouldCheckPresence = isPresenceLocationFeatureActive(data.course, 'attendance')
    const presenceEnforced = isPresenceLocationEnforced(data.course, 'attendance')
    const presenceResult = shouldCheckPresence ? await getPresenceLocation() : null

    if (presenceResult && !presenceResult.ok) {
      if (presenceEnforced) {
        setPresenceFailure(presenceResult.error)
        setSubmitting(false)
        setError(presenceResult.error.message)
        return
      }
    }

    const response = await fetch(withTenantPrefix('/api/attendance/submit', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: data.course.id,
        enrollmentId: data.enrollment.id,
        name: data.enrollment.name,
        phone: data.enrollment.phone,
        code: codeValue,
        localDeviceKey: deviceKey,
        presenceLocation: presenceResult?.ok ? presenceResult.location : undefined,
        presenceError: presenceResult && !presenceResult.ok ? presenceResult.error : undefined,
      }),
    })
    const result = await response.json().catch(() => null)
    setSubmitting(false)

    if (!response.ok) {
      const failure = result as {
        error?: string
        code?: string
        presence?: { code?: string; message?: string }
      } | null
      setError(failure?.error ?? '출석 처리에 실패했습니다.')
      if (failure?.code?.startsWith('PRESENCE_')) {
        setPresenceFailure({
          errorCode: (failure.presence?.code ?? 'position_unavailable') as ClientPresenceError['errorCode'],
          message: failure.presence?.message ?? failure.error ?? '위치 확인이 필요합니다.',
          browserContext: presenceResult?.ok === false ? presenceResult.error.browserContext : 'other',
        })
      } else {
        setPresenceFailure(null)
      }
      return
    }

    setDigits(getInitialDigits())
    setPresenceFailure(null)
    setMessage('오늘 출석이 완료되었습니다.')
    await loadData().catch(() => null)
  }

  if (loading) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--student-blue)] border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[15px] font-medium text-[#c2410c]">{error}</p>
          <button
            type="button"
            onClick={goBack}
            className="student-pill-button student-pill-primary mt-5 w-full"
          >
            강의 페이지로
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const attendanceNotStarted = isCourseAttendanceNotStarted(data.course.enrolled_from)

  if (!data.attendance.enabled) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">
            이 강의는 출석 체크를 사용하지 않습니다.
          </p>
          <button
            type="button"
            onClick={goBack}
            className="student-pill-button student-pill-primary mt-6 w-full"
          >
            강의 페이지로
          </button>
        </div>
      </div>
    )
  }

  const statusLabel = data.attendance.attended_today
    ? '출석 완료'
    : data.attendance.open
      ? '입력 가능'
      : '대기 중'
  const attendedDateLabel = data.attendance.attended_at
    ? formatAttendanceDate(data.attendance.attended_at)
    : ''
  const attendanceHistory = data.attendanceHistory ?? []
  const statusDescription = data.attendance.open
    ? '교실 화면에 표시된 6자리 코드를 입력해 주세요.'
    : attendanceNotStarted
      ? `수강 시작일 ${data.course.enrolled_from} 이후부터 출석 체크를 할 수 있습니다.`
      : '현재 출석 체크가 열려 있지 않습니다.'

  return (
    <div className="student-page student-safe-bottom">
      <section className="student-hero px-4 pb-5 pt-4 sm:px-5">
        <button
          type="button"
          onClick={goBack}
          className="text-[13px] font-semibold tracking-[-0.02em] text-white/56 transition-opacity hover:text-white"
        >
          강의 페이지
        </button>
        <p className="student-eyebrow student-eyebrow-dark mt-4">출석 체크</p>
        <h1 className="student-display mt-2">출석 체크</h1>
        <p className="student-body student-body-dark mt-2">{data.course.name}</p>
      </section>

      <div className="px-4 pt-4 sm:px-5">
        <section className="student-card px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="student-eyebrow student-eyebrow-light">상태</p>
              <p className="mt-2 text-[20px] font-semibold leading-[1.07] tracking-[-0.02em] text-[var(--student-text)]">
                {statusLabel}
              </p>
              {data.attendance.attended_today ? (
                <div className="student-body mt-2">
                  <span className="block">오늘의 출석 완료</span>
                  {attendedDateLabel ? <span className="block">({attendedDateLabel})</span> : null}
                  {data.attendance.attended_at ? (
                    <span className="mt-1 block text-[12px] text-[var(--student-text-muted)]">
                      출석 시간 {formatTime(data.attendance.attended_at)}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="student-body mt-2">{statusDescription}</p>
              )}
            </div>
            <span
              className={`student-chip ${
                data.attendance.attended_today
                  ? 'bg-[#eefaf1] text-[#19703a]'
                  : data.attendance.open
                    ? 'bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]'
                    : ''
              }`}
            >
              {data.attendance.attended_today ? '완료' : data.attendance.open ? '진행 중' : '대기'}
            </span>
          </div>

          {(error || message) ? (
            <div className="student-card-muted mt-3 px-4 py-3">
              {error ? <p className="text-[14px] font-medium text-[#c2410c]">{error}</p> : null}
              {message ? <p className="text-[14px] font-medium text-[#19703a]">{message}</p> : null}
            </div>
          ) : null}

          {presenceFailure ? (
            <PresenceFailureActions
              courseId={data.course.id}
              enrollmentId={data.enrollment.id}
              name={data.enrollment.name}
              phone={data.enrollment.phone}
              feature="attendance"
              browserContext={presenceFailure.browserContext}
              errorCode={presenceFailure.errorCode}
              message={presenceFailure.message}
              onRetry={() => void handleSubmit()}
            />
          ) : null}

          <div className="mt-4">
            <p className="student-eyebrow student-eyebrow-light">6자리 코드</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    inputRefs.current[index] = node
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={submitting || !data.attendance.open || data.attendance.attended_today}
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={(event) => {
                    event.preventDefault()
                    handlePaste(event.clipboardData.getData('text'))
                  }}
                  className="aspect-square w-full max-w-[52px] rounded-[12px] bg-[var(--student-surface-muted)] text-center text-[24px] font-semibold tracking-[-0.05em] text-[var(--student-text)] outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,113,227,0.3)] disabled:opacity-50"
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !data.attendance.open || data.attendance.attended_today}
            className="student-pill-button student-pill-primary mt-6 w-full disabled:translate-y-0 disabled:opacity-50"
          >
            {data.attendance.attended_today ? (
              <span className="flex flex-col items-center leading-tight">
                <span>오늘의 출석 완료</span>
                {attendedDateLabel ? <span className="mt-0.5 text-[13px] font-medium">({attendedDateLabel})</span> : null}
              </span>
            ) : submitting ? '위치 확인 중...' : '출석하기'}
          </button>

          <div className="mt-5 border-t border-[var(--student-line)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="student-eyebrow student-eyebrow-light">출석 기록</p>
                <p className="mt-1 text-[13px] text-[var(--student-text-muted)]">
                  본인 출석 날짜를 최근 순서대로 확인할 수 있습니다.
                </p>
              </div>
              <span className="student-chip shrink-0">{attendanceHistory.length}회</span>
            </div>

            {attendanceHistory.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {attendanceHistory.map((entry, index) => {
                  const isToday = entry.attended_date === getKstDateKey()

                  return (
                    <li
                      key={`${entry.attended_date}:${entry.attended_at}:${index}`}
                      className="student-card-muted flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--student-text)]">
                          {formatAttendanceDateKey(entry.attended_date)}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--student-text-muted)]">
                          {isToday ? '오늘 출석' : '출석 완료'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-semibold text-[var(--student-blue)]">
                          {formatTime(entry.attended_at)}
                        </p>
                        {isToday ? (
                          <span className="mt-1 inline-flex rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[var(--student-blue)]">
                            오늘
                          </span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="student-card-muted mt-3 px-4 py-3">
                <p className="text-[14px] text-[var(--student-text-muted)]">아직 확인할 출석 기록이 없습니다.</p>
              </div>
            )}
          </div>
        </section>
        <div className="mt-3">
          <StudentAccessGuide compact onlyWhenKakao storageKey="class_pass_attendance_access_guide_dismissed_until" />
        </div>
      </div>
    </div>
  )
}
