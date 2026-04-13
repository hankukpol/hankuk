'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraReadinessError } from '@/lib/camera/access'
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
  const courseTheme = data?.course.theme_color || '#1e40af'

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
      setError('기기 정보를 준비하고 있습니다. 잠시 후 다시 시도해주세요.')
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

    setMessage('현장 인증이 완료되었습니다. 원하는 좌석을 선택해주세요.')
  }, [applyDesignatedSeatState, data, deviceKey, refreshDesignatedSeatState, tenant.type])

  useEffect(() => {
    if (!scannerOpen) {
      void stopScanner()
      return
    }

    let cancelled = false

    async function findMainCamera(): Promise<string | null> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((device) => device.kind === 'videoinput')
        const backCameras = videoDevices.filter((device) => {
          const label = device.label.toLowerCase()
          return label.includes('back') || label.includes('rear') || label.includes('후면') || label.includes('환경')
        })

        if (backCameras.length === 0) {
          return null
        }

        const mainCamera = backCameras.find((device) => {
          const label = device.label.toLowerCase()
          return !label.includes('wide') && !label.includes('ultra') && !label.includes('광각')
        })

        return (mainCamera ?? backCameras[0]).deviceId || null
      } catch {
        return null
      }
    }

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
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        tempStream.getTracks().forEach((track) => track.stop())

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
        const mainCameraId = await findMainCamera()
        try {
          const cameraConfig = mainCameraId
            ? mainCameraId
            : { facingMode: { exact: 'environment' as const } }

          await scanner.start(
            cameraConfig as string | { facingMode: string | { exact: string } },
            { fps: 10, qrbox: { width: qrBoxSize, height: qrBoxSize } },
            onSuccess,
          )
        } catch {
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: qrBoxSize, height: qrBoxSize } },
            onSuccess,
          )
        }

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
    setMessage(action === 'changed' ? '좌석이 변경되었습니다.' : '좌석이 확정되었습니다.')
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
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    )
  }

  if (!data || !state?.enabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-gray-500">{error || '지정좌석 기능을 사용할 수 없습니다.'}</p>
        <button onClick={goBack} className="px-6 py-2 text-sm font-medium text-white" style={{ background: courseTheme }}>
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <div className="text-white" style={{ background: courseTheme }}>
        <div className="flex items-center justify-between px-4 py-4">
          <button onClick={goBack} className="text-sm text-white/80 hover:text-white">
            수강증으로
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.open ? 'bg-white/20' : 'bg-white/10 text-white/60'}`}>
            {state.open ? '신청 가능' : '신청 마감'}
          </span>
        </div>
        <div className="px-4 pb-5">
          <h1 className="text-lg font-bold">지정좌석</h1>
          <p className="mt-1 text-sm text-white/80">{data.course.name}</p>
        </div>
      </div>

      <div className="bg-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">현재 좌석</p>
            <p className="mt-0.5 text-2xl font-black text-gray-900">{currentSeatLabel ?? '미지정'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">상태</p>
            <p className="mt-0.5 text-sm font-medium text-gray-700">
              {state.verified
                ? '인증 완료'
                : state.requires_reauth
                  ? 'QR 재인증 필요'
                  : state.restriction_reason ?? 'QR 인증 대기'}
            </p>
          </div>
        </div>
      </div>

      {(error || message) ? (
        <div className="px-4 pt-3">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      ) : null}

      {state.open && !state.verified ? (
        <div className="border-t border-gray-100 bg-white px-4 py-4">
          <p className="text-sm font-medium text-gray-800">
            {state.requires_reauth
              ? '좌석을 변경하려면 다시 현장 QR 인증이 필요합니다.'
              : '현장 QR 인증 후 좌석을 선택할 수 있습니다.'}
          </p>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={working}
            className="mt-3 w-full py-3 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: courseTheme }}
          >
            QR 스캔으로 현장 인증
          </button>
        </div>
      ) : null}

      {state.layout && state.seats.length > 0 ? (
        <div className="flex-1 px-4 py-4">
          <div className="overflow-x-auto bg-white p-3">
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

          <div className="mt-3 flex justify-center gap-4 text-xs text-gray-500">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded-full ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 py-8">
          <p className="text-center text-sm text-gray-500">관리자가 아직 좌석 배치를 준비하지 않았습니다.</p>
        </div>
      )}

      <div className="px-4 pb-6">
        <button
          onClick={goBack}
          className="w-full border border-gray-200 py-3 text-sm text-gray-500"
        >
          수강증으로 돌아가기
        </button>
      </div>

      {scannerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5" onClick={() => setScannerOpen(false)}>
          <div className="w-full max-w-md bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">현장 QR 스캔</h3>
              <button type="button" onClick={() => setScannerOpen(false)} className="text-sm text-gray-400">
                닫기
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">강의실 모니터에 표시된 QR을 카메라로 비춰주세요.</p>
            <div id="designated-seat-qr-reader" className="mt-4 overflow-hidden bg-black/90" style={{ minHeight: 320 }} />
            {scannerLoading ? <p className="mt-3 text-sm text-gray-500">카메라를 준비하고 있습니다...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
