'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import type { PassPayload } from '@/types/database'

const DEVICE_KEY_STORAGE = 'class_pass_designated_seat_device'

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

function buildDeviceSignature() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return {}
  }

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
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    return url.searchParams.get('token') ?? trimmed
  } catch {
    return trimmed
  }
}

export function StudentDesignatedSeatSection({
  data,
  courseTheme,
  onRefresh,
}: {
  data: PassPayload
  courseTheme: string
  onRefresh: () => Promise<void>
}) {
  const scannerRef = useRef<ScannerInstance | null>(null)
  const [deviceKey, setDeviceKey] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerLoading, setScannerLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const tenant = useTenantConfig()

  const state = data.designatedSeat

  useEffect(() => {
    setDeviceKey(ensureLocalDeviceKey())
  }, [])

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
    if (!deviceKey) {
      setError('기기 정보를 준비하는 중입니다. 잠시 후 다시 시도해주세요.')
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

    setMessage('현장 인증이 완료되었습니다. 2분 안에 좌석을 선택해주세요.')
    setCodeInput('')
    await onRefresh()
  }, [data.course.id, data.enrollment.id, data.enrollment.name, data.enrollment.phone, deviceKey, onRefresh, tenant.type])

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
      try {
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
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: qrBoxSize, height: qrBoxSize } },
          onSuccess,
        )

        if (!cancelled) {
          setScannerLoading(false)
        }
      } catch {
        if (!cancelled) {
          setScannerLoading(false)
          setError('카메라를 시작하지 못했습니다. 숫자 코드 입력으로 인증해주세요.')
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
    if (!deviceKey) {
      setError('기기 정보를 준비하는 중입니다. 잠시 후 다시 시도해주세요.')
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
      setError((result as { error?: string } | null)?.error ?? '좌석 지정에 실패했습니다.')
      return
    }

    const action = (result as { action?: string } | null)?.action ?? 'reserved'
    setMessage(action === 'changed' ? '좌석을 변경했습니다. 다음 변경은 다시 QR 인증이 필요합니다.' : '좌석을 확정했습니다.')
    await onRefresh()
  }

  const currentSeatId = state.reservation?.seat_id ?? null
  const currentSeatLabel = state.reservation?.seat?.label ?? null
  const legend = useMemo(
    () => [
      { label: '내 좌석', className: 'bg-emerald-500' },
      { label: '사용 중', className: 'bg-slate-300' },
      { label: '선택 가능', className: 'bg-white border border-slate-300' },
      { label: '비활성', className: 'bg-slate-100 border border-slate-200' },
    ],
    [],
  )

  if (!state.enabled) {
    return null
  }

  return (
    <>
      <section className="border-t border-gray-100 p-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold" style={{ color: courseTheme }}>지정좌석</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                현장 QR 인증 후 빈 좌석을 직접 선택할 수 있습니다. 좌석을 다시 바꾸려면 매번 QR 인증이 필요합니다.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.open ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
              {state.open ? '신청 열림' : '신청 닫힘'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">현재 좌석</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{currentSeatLabel ?? '미지정'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">현재 상태</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {state.verified
                  ? `인증 완료 · ${state.auth_expires_at ? new Date(state.auth_expires_at).toLocaleTimeString('ko-KR') : ''}까지 선택 가능`
                  : state.requires_reauth
                    ? '다시 QR 인증 후 좌석 변경 가능'
                    : state.restriction_reason ?? '현장 QR 인증 대기'}
              </p>
            </div>
          </div>

          {(error || message) ? (
            <div className="mt-4 flex flex-col gap-2">
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            </div>
          ) : null}

          {state.open && !state.verified ? (
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">
                {state.requires_reauth ? '좌석을 변경하려면 다시 현장 QR 인증이 필요합니다.' : '현장 QR 인증 후 좌석을 선택할 수 있습니다.'}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,auto]">
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="현장 코드 6자리"
                  className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-center text-lg font-black tracking-[0.28em] text-slate-900 outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => void handleVerify({ verificationMethod: 'code', rotationCode: codeInput })}
                  disabled={working || codeInput.length < 4}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60 hover:bg-blue-700"
                >
                  코드 인증
                </button>
              </div>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                disabled={working}
                className="mt-3 w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-60 hover:bg-blue-100"
              >
                카메라로 QR 스캔
              </button>
            </div>
          ) : null}

          {state.layout && state.seats.length > 0 ? (
            <>
              <div className="mt-5 rounded-2xl border border-slate-200 p-4">
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

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                {legend.map((item) => (
                  <div key={item.label} className="inline-flex items-center gap-2">
                    <span className={`h-3.5 w-3.5 rounded-full ${item.className}`} />
                    {item.label}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-gray-500">관리자가 아직 좌석 배치를 준비하지 않았습니다.</p>
          )}
        </div>
      </section>

      {scannerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5" onClick={() => setScannerOpen(false)}>
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-gray-900">현장 QR 스캔</h3>
              <button type="button" onClick={() => setScannerOpen(false)} className="text-sm font-semibold text-gray-400">
                닫기
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">강의실 모니터에 표시된 QR을 카메라로 비춰주세요.</p>
            <div id="designated-seat-qr-reader" className="mt-4 overflow-hidden rounded-2xl bg-black/90" style={{ minHeight: 320 }} />
            {scannerLoading ? <p className="mt-3 text-sm text-gray-500">카메라를 준비하는 중입니다...</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
