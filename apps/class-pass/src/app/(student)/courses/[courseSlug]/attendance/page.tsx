'use client'

import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
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
      }),
    })
    const result = await response.json().catch(() => null)
    setSubmitting(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '출석 처리에 실패했습니다.')
      return
    }

    setDigits(getInitialDigits())
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

  const statusDescription = data.attendance.attended_today
    ? `오늘 출석이 완료되었습니다.${data.attendance.attended_at ? ` (${formatTime(data.attendance.attended_at)})` : ''}`
    : data.attendance.open
      ? '교실 화면에 표시된 6자리 코드를 입력해 주세요.'
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
              <p className="student-body mt-2">{statusDescription}</p>
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
            {data.attendance.attended_today ? '오늘 출석 완료' : submitting ? '처리 중...' : '출석하기'}
          </button>
        </section>
      </div>
    </div>
  )
}
