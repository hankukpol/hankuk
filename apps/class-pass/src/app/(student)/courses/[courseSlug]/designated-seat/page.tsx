'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraReadinessError } from '@/lib/camera/access'
import { getStrictMainRearCamera } from '@/lib/camera/main-rear-camera'
import { fetchDesignatedSeatState } from '@/lib/designated-seat/client-state'
import { withTenantPrefix } from '@/lib/tenant'
import type { DesignatedSeatStudentState, PassPayload } from '@/types/database'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'
const DEVICE_KEY_STORAGE = 'class_pass_designated_seat_device'

const STATE_REFRESH_REASONS = new Set([
  'SEAT_TAKEN',
  'AUTH_REQUIRED',
  'AUTH_EXPIRED',
  'AUTH_ALREADY_USED',
  'AUTH_DEVICE_MISMATCH',
  'DEVICE_LOCKED',
])

type ScannerInstance = {
  start: (
    camera: string | { facingMode: string | { exact: string } },
    config: { fps?: number; qrbox?: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
  ) => Promise<void>
  stop: () => Promise<void>
  clear: () => void
}

function ensureLocalDeviceKey() {
  if (typeof window === 'undefined') return ''

  const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE)
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
    return existing
  }

  const generated = `${crypto.randomUUID().replace(/-/g, '')}_${Date.now().toString(36)}`
  window.localStorage.setItem(DEVICE_KEY_STORAGE, generated)
  return generated
}

function buildDeviceSignature() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return {}

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

function normalizeScannedToken(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    return url.searchParams.get('token') ?? trimmed
  } catch {
    return trimmed
  }
}

export default function DesignatedSeatPage() {
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tenant = useTenantConfig()

  const enrollmentId = Number(searchParams.get('enrollmentId'))

  const [data, setData] = useState<PassPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [deviceKey, setDeviceKey] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerLoading, setScannerLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const scannerRef = useRef<ScannerInstance | null>(null)

  useEffect(() => {
    setDeviceKey(ensureLocalDeviceKey())
  }, [])

  const loadData = useCallback(async () => {
    const name = sessionStorage.getItem(LS_NAME) ?? ''
    const phone = sessionStorage.getItem(LS_PHONE) ?? ''

    if (!name || !phone || !enrollmentId) {
      router.replace(withTenantPrefix('/', tenant.type))
      return
    }

    const response = await fetch(withTenantPrefix('/api/enrollments/pass', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, courseSlug: params.courseSlug, name, phone }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '데이터를 불러오지 못했습니다.')
      setLoading(false)
      return
    }

    setData(payload as PassPayload)
    setLoading(false)
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const state = data?.designatedSeat
  const courseTheme = data?.course.theme_color || '#0071e3'

  const applyDesignatedSeatState = useCallback((nextState: DesignatedSeatStudentState) => {
    setData((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        designatedSeat: nextState,
      }
    })
  }, [])

  const refreshDesignatedSeatState = useCallback(async () => {
    if (!data) {
      return null
    }

    const nextState = await fetchDesignatedSeatState({
      tenantType: tenant.type,
      courseId: data.course.id,
      enrollmentId: data.enrollment.id,
      name: data.enrollment.name,
      phone: data.enrollment.phone,
    })

    applyDesignatedSeatState(nextState)
    return nextState
  }, [applyDesignatedSeatState, data, tenant.type])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null

    if (!scanner) {
      return
    }

    try {
      await scanner.stop()
    } catch {
      // ignore stop failures
    }

    try {
      scanner.clear()
    } catch {
      // ignore clear failures
    }
  }, [])

  const handleVerify = useCallback(async (payload: { verificationMethod: 'qr' | 'code'; rotationToken?: string; rotationCode?: string }) => {
    if (!data || !deviceKey) {
      setError('기기 정보를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch(withTenantPrefix('/api/designated-seats/auth', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: data.course.id,
        enrollmentId: data.enrollment.id,
        name: data.enrollment.name,
        phone: data.enrollment.phone,
        localDeviceKey: deviceKey,
        deviceSignature: buildDeviceSignature(),
        ...payload,
      }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '현장 인증에 실패했습니다.')
      return
    }

    const nextState = (result as { state?: DesignatedSeatStudentState } | null)?.state
    if (nextState) {
      applyDesignatedSeatState(nextState)
    } else {
      await refreshDesignatedSeatState().catch(() => null)
    }

    setMessage('현장 인증이 완료되었습니다. 원하시는 좌석을 선택해 주세요.')
  }, [applyDesignatedSeatState, data, deviceKey, refreshDesignatedSeatState, tenant.type])

  useEffect(() => {
    if (!scannerOpen) {
      void stopScanner()
      return
    }

    let cancelled = false

    async function startScanner() {
      if (typeof window === 'undefined') {
        return
      }

      setScannerLoading(true)
      setError('')

      const readinessError = await getCameraReadinessError()
      if (readinessError) {
        if (!cancelled) {
          setScannerLoading(false)
          setError(readinessError)
          setScannerOpen(false)
        }
        return
      }

      try {
        const cameraSelection = await getStrictMainRearCamera()
        if (!cameraSelection.ok) {
          if (!cancelled) {
            setScannerLoading(false)
            setError(
              cameraSelection.reason === 'rear-camera-not-found'
                ? '후면 카메라를 찾지 못했습니다. 카메라 권한을 확인한 뒤 다시 시도해 주세요.'
                : '기본 1배 후면 카메라를 확인하지 못했습니다. 광각·망원 렌즈는 허용하지 않으므로 아이폰은 Safari, 갤럭시는 Chrome에서 다시 시도해 주세요.',
            )
            setScannerOpen(false)
          }
          return
        }

        const qrModule = await import('html5-qrcode')
        const scanner = new qrModule.Html5Qrcode('designated-seat-qr-reader') as unknown as ScannerInstance
        scannerRef.current = scanner

        const onSuccess = (decodedText: string) => {
          const token = normalizeScannedToken(decodedText)
          if (!token) {
            return
          }

          setScannerOpen(false)
          void handleVerify({ verificationMethod: 'qr', rotationToken: token })
        }

        const qrBoxSize = Math.max(220, Math.min(window.innerWidth - 80, 320))
        await scanner.start(
          cameraSelection.deviceId,
          { fps: 10, qrbox: { width: qrBoxSize, height: qrBoxSize } },
          onSuccess,
        )

        if (!cancelled) {
          setScannerLoading(false)
        }
      } catch {
        if (!cancelled) {
          setScannerLoading(false)
          setError('카메라를 시작하지 못했습니다.')
          setScannerOpen(false)
        }
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [handleVerify, scannerOpen, stopScanner])

  async function handleReserve(seatId: number) {
    if (!data || !deviceKey) {
      setError('기기 정보를 준비하고 있습니다.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch(withTenantPrefix('/api/designated-seats/reserve', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: data.course.id,
        enrollmentId: data.enrollment.id,
        seatId,
        name: data.enrollment.name,
        phone: data.enrollment.phone,
        localDeviceKey: deviceKey,
      }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      const failureResult = result as {
        error?: string
        reason?: string
        state?: DesignatedSeatStudentState | null
      } | null

      setError(failureResult?.error ?? '좌석 지정에 실패했습니다.')

      if (failureResult?.reason && STATE_REFRESH_REASONS.has(failureResult.reason)) {
        if (failureResult.state) {
          applyDesignatedSeatState(failureResult.state)
        } else {
          await refreshDesignatedSeatState().catch(() => null)
        }
      }

      return
    }

    const successResult = result as { action?: string; state?: DesignatedSeatStudentState } | null
    if (successResult?.state) {
      applyDesignatedSeatState(successResult.state)
    } else {
      await refreshDesignatedSeatState().catch(() => null)
    }

    const action = successResult?.action ?? 'reserved'
    setMessage(action === 'changed' ? '좌석이 변경되었습니다.' : '좌석을 확정했습니다.')
  }

  const goBack = useCallback(() => {
    router.push(withTenantPrefix(`/courses/${params.courseSlug}?enrollmentId=${enrollmentId}`, tenant.type))
  }, [router, params.courseSlug, enrollmentId, tenant.type])

  const currentSeatId = state?.reservation?.seat_id ?? null
  const currentSeatLabel = state?.reservation?.seat?.label ?? null

  const legend = useMemo(
    () => [
      { label: '내 좌석', color: 'bg-emerald-500' },
      { label: '사용 중', color: 'bg-slate-300' },
      { label: '선택 가능', color: 'bg-white border border-slate-300' },
    ],
    [],
  )

  if (loading) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--student-blue)] border-t-transparent" />
      </div>
    )
  }

  if (!data || !state?.enabled) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[15px] text-[var(--student-text-muted)]">{error || '지정좌석 기능을 사용할 수 없습니다.'}</p>
          <button onClick={goBack} className="student-pill-button student-pill-primary mt-6 w-full">
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="student-page student-safe-bottom">
      <section className="student-hero px-4 pb-6 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={goBack} className="text-[13px] font-semibold tracking-[-0.02em] text-white/56 transition-opacity hover:text-white">
            수강증으로
          </button>
          <span className={`student-chip student-chip-dark ${state.open ? '' : 'opacity-70'}`}>
            {state.open ? '좌석 선택 가능' : '좌석 선택 마감'}
          </span>
        </div>
        <p className="student-eyebrow student-eyebrow-dark mt-4">지정좌석</p>
        <h1 className="student-display mt-2">지정좌석</h1>
        <p className="student-body student-body-dark mt-2">{data.course.name}</p>
      </section>

      <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
        <section className="student-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="student-eyebrow student-eyebrow-light">현재 좌석</p>
              <p className="mt-2 text-[26px] font-semibold leading-[1.07] tracking-[-0.02em] text-[var(--student-text)]">
                {currentSeatLabel ?? '미정'}
              </p>
            </div>
            <div className="text-right">
              <p className="student-eyebrow student-eyebrow-light">상태</p>
              <p className="mt-1.5 text-[12px] text-[var(--student-text-muted)]">
                {state.verified
                  ? '인증 완료'
                  : state.requires_reauth
                    ? 'QR 재인증 필요'
                    : state.restriction_reason ?? 'QR 인증 대기'}
              </p>
            </div>
          </div>
        </section>

        {(error || message) ? (
          <section className="student-card px-4 py-3">
            {error ? <p className="text-[14px] font-medium text-[#c2410c]">{error}</p> : null}
            {message ? <p className="text-[14px] font-medium text-[#19703a]">{message}</p> : null}
          </section>
        ) : null}

        {state.open && !state.verified ? (
          <section className="student-card px-4 py-4">
            <p className="text-[14px] leading-[1.47] text-[var(--student-text)]">
              {state.requires_reauth
                ? '좌석을 변경하려면 다시 현장 QR 인증이 필요합니다.'
                : '현장 QR 인증 후 빈 좌석을 직접 선택할 수 있습니다.'}
            </p>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={working}
              className="student-pill-button student-pill-primary mt-3 w-full disabled:opacity-40"
              style={{ backgroundColor: courseTheme, borderColor: courseTheme }}
            >
              QR 스캔으로 현장 인증
            </button>
          </section>
        ) : null}

        {state.layout && state.seats.length > 0 ? (
          <section className="student-card px-4 py-4">
            <div className="overflow-x-auto rounded-[12px] bg-[var(--student-surface-soft)] p-3">
              <SeatGrid
                columns={state.layout.columns}
                rows={state.layout.rows}
                aisleColumns={state.layout.aisle_columns}
                seats={state.seats}
                occupiedSeatIds={state.occupied_seat_ids}
                currentSeatId={currentSeatId}
                onSeatClick={(seat) => {
                  if (!state.writable || working) {
                    return
                  }

                  const confirmed = window.confirm(
                    currentSeatLabel
                      ? `${seat.label} 좌석으로 변경할까요?`
                      : `${seat.label} 좌석을 확정할까요?`,
                  )
                  if (!confirmed) {
                    return
                  }

                  void handleReserve(seat.id)
                }}
                mode="student"
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-[var(--student-text-muted)]">
              {legend.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span className={`inline-block h-3 w-3 rounded-full ${item.color}`} />
                  {item.label}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <section className="student-card px-4 py-6 text-center">
            <p className="student-body">관리자가 아직 좌석 배치를 준비하지 않았습니다.</p>
          </section>
        )}

        <button onClick={goBack} className="student-pill-button student-pill-outline w-full">
          수강증으로 돌아가기
        </button>
      </div>

      {scannerOpen ? (
        <div className="student-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setScannerOpen(false)}>
          <div className="student-card w-full max-w-md bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[var(--student-text)]">현장 QR 스캔</h3>
              <button type="button" onClick={() => setScannerOpen(false)} className="text-[13px] text-[var(--student-link)]">
                닫기
              </button>
            </div>
            <p className="student-body mt-1.5">강의실 모니터에 표시된 QR을 카메라로 비춰주세요.</p>
            <div id="designated-seat-qr-reader" className="mt-3 overflow-hidden rounded-[12px] bg-black/90" style={{ minHeight: 280 }} />
            {scannerLoading ? <p className="student-body mt-3">카메라를 준비하고 있습니다...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
