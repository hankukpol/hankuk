'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { PresenceFailureActions } from '@/components/student/PresenceFailureActions'
import { StudentAccessGuide } from '@/components/student/StudentAccessGuide'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraReadinessError } from '@/lib/camera/access'
import { getPresenceLocation, type ClientPresenceError } from '@/lib/client/geolocation'
import { getStrictMainRearCamera } from '@/lib/camera/main-rear-camera'
import { fetchDesignatedSeatState } from '@/lib/designated-seat/client-state'
import {
  parseDesignatedSeatScanValue,
  type DesignatedSeatVerificationPayload,
} from '@/lib/designated-seat/scan'
import { isPresenceLocationEnforced, isPresenceLocationFeatureActive } from '@/lib/presence/shared'
import { withTenantPrefix } from '@/lib/tenant'
import type { DesignatedSeat, DesignatedSeatStudentState, PassPayload } from '@/types/database'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'
const DEVICE_KEY_STORAGE = 'class_pass_designated_seat_device'

const STATE_REFRESH_REASONS = new Set([
  'SEAT_TAKEN',
  'AUTH_REQUIRED',
  'AUTH_EXPIRED',
  'AUTH_ALREADY_USED',
  'AUTH_DEVICE_MISMATCH',
  'LOCATION_REQUIRED',
  'DEVICE_LOCKED',
  'ROOM_CLOSED',
])

type ScannerInstance = {
  start: (
    camera: string | { facingMode: string | { exact: string } },
    config: { fps?: number; qrbox?: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
  ) => Promise<void>
  stop: () => Promise<void>
  clear: () => void
  applyVideoConstraints?: (constraints: MediaTrackConstraints) => Promise<void>
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

function resolveClientRoomId(state: DesignatedSeatStudentState | null | undefined, selectedRoomId: number | null) {
  if (!state) {
    return null
  }

  if (selectedRoomId && state.rooms.some((room) => room.id === selectedRoomId)) {
    return selectedRoomId
  }

  if (state.active_room_id) {
    return state.active_room_id
  }

  return state.rooms.length === 1 ? state.rooms[0]?.id ?? null : null
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
  const [codeInput, setCodeInput] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerLoading, setScannerLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [presenceFailure, setPresenceFailure] = useState<ClientPresenceError | null>(null)
  const [lastScanDebug, setLastScanDebug] = useState('')
  const [reserveTarget, setReserveTarget] = useState<DesignatedSeat | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [roomLoading, setRoomLoading] = useState(false)
  const scannerRef = useRef<ScannerInstance | null>(null)
  const roomStateRequestRef = useRef(0)

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
  const activeRoomId = resolveClientRoomId(state, selectedRoomId)
  const activeRoom = state?.rooms.find((room) => room.id === activeRoomId) ?? null
  const needsRoomSelection = Boolean(state && state.rooms.length > 1 && !activeRoomId)
  const currentSeatRoom = state?.reservation
    ? state.rooms.find((room) => room.id === state.reservation?.room_id) ?? null
    : activeRoom
  const selectedRoomStateReady = !state || !activeRoomId || state.active_room_id === activeRoomId

  const applyDesignatedSeatState = useCallback((nextState: DesignatedSeatStudentState) => {
    setSelectedRoomId(resolveClientRoomId(nextState, null))
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

  useEffect(() => {
    if (!state) {
      return
    }

    setSelectedRoomId((current) => {
      if (current && state.rooms.some((room) => room.id === current)) {
        return current
      }

      return resolveClientRoomId(state, null)
    })
  }, [state])

  const refreshDesignatedSeatState = useCallback(async (roomId: number | null = activeRoomId, requestId?: number) => {
    if (!data) {
      return null
    }

    const nextState = await fetchDesignatedSeatState({
      tenantType: tenant.type,
      courseId: data.course.id,
      enrollmentId: data.enrollment.id,
      roomId,
      name: data.enrollment.name,
      phone: data.enrollment.phone,
    })

    if (requestId && requestId !== roomStateRequestRef.current) {
      return null
    }

    applyDesignatedSeatState(nextState)
    return nextState
  }, [activeRoomId, applyDesignatedSeatState, data, tenant.type])

  const handleSelectRoom = useCallback(async (roomId: number) => {
    if (roomId === activeRoomId) {
      return
    }

    const targetRoom = state?.rooms.find((room) => room.id === roomId)
    if (targetRoom && !targetRoom.is_open) {
      setError(`${targetRoom.name} 좌석 신청은 아직 열리지 않았습니다.`)
      return
    }

    setReserveTarget(null)
    setError('')
    setMessage('')
    setRoomLoading(true)
    const requestId = ++roomStateRequestRef.current
    try {
      await refreshDesignatedSeatState(roomId, requestId)
    } catch (reason) {
      if (requestId === roomStateRequestRef.current) {
        setError(reason instanceof Error ? reason.message : '강의실 좌석 상태를 불러오지 못했습니다.')
      }
    } finally {
      if (requestId === roomStateRequestRef.current) {
        setRoomLoading(false)
      }
    }
  }, [activeRoomId, refreshDesignatedSeatState, state?.rooms])

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

  const handleVerify = useCallback(async (payload: DesignatedSeatVerificationPayload) => {
    if (!data || !deviceKey) {
      setError('기기 정보를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    if (!activeRoomId) {
      setError('강의실을 먼저 선택해 주세요.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')
    setPresenceFailure(null)

    const shouldCheckPresence = isPresenceLocationFeatureActive(data.course, 'designated_seat')
    const presenceEnforced = isPresenceLocationEnforced(data.course, 'designated_seat')
    const presenceResult = shouldCheckPresence ? await getPresenceLocation() : null

    if (presenceResult && !presenceResult.ok) {
      if (presenceEnforced) {
        setPresenceFailure(presenceResult.error)
        setWorking(false)
        setError(presenceResult.error.message)
        return
      }
    }

    const response = await fetch(withTenantPrefix('/api/designated-seats/auth', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: data.course.id,
        enrollmentId: data.enrollment.id,
        roomId: activeRoomId,
        name: data.enrollment.name,
        phone: data.enrollment.phone,
        localDeviceKey: deviceKey,
        deviceSignature: buildDeviceSignature(),
        presenceLocation: presenceResult?.ok ? presenceResult.location : undefined,
        presenceError: presenceResult && !presenceResult.ok ? presenceResult.error : undefined,
        ...payload,
      }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      const failure = result as {
        error?: string
        code?: string
        presence?: { code?: string; message?: string }
        state?: DesignatedSeatStudentState | null
      } | null
      setError(failure?.error ?? '현장 인증에 실패했습니다.')
      if (failure?.state) {
        applyDesignatedSeatState(failure.state)
      }
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

    const nextState = (result as { state?: DesignatedSeatStudentState } | null)?.state
    if (nextState) {
      applyDesignatedSeatState(nextState)
    } else {
      await refreshDesignatedSeatState().catch(() => null)
    }

    setPresenceFailure(null)
    setMessage('현장 인증이 완료되었습니다. 원하시는 좌석을 선택해 주세요.')
  }, [activeRoomId, applyDesignatedSeatState, data, deviceKey, refreshDesignatedSeatState, tenant.type])

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
          setLastScanDebug(decodedText)
          const verificationPayload = parseDesignatedSeatScanValue(decodedText)
          if (!verificationPayload) {
            return
          }

          setScannerOpen(false)
          void handleVerify(verificationPayload)
        }

        const qrBoxSize = Math.max(220, Math.min(window.innerWidth - 80, 320))
        await scanner.start(
          cameraSelection.deviceId,
          { fps: 10, qrbox: { width: qrBoxSize, height: qrBoxSize } },
          onSuccess,
        )

        // Force 1x main lens on multi-camera phones (iPhone 11+, Galaxy S-series, etc.).
        // advanced[] is best-effort, so unsupported browsers silently skip it.
        try {
          await scanner.applyVideoConstraints?.({
            advanced: [{ zoom: 1 } as unknown as MediaTrackConstraintSet],
          })
        } catch {
          // ignore if the browser rejects the zoom constraint
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
        roomId: activeRoomId,
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
          await refreshDesignatedSeatState(null).catch(() => null)
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

  async function handleReserveConfirmed() {
    const seat = reserveTarget
    if (!seat) {
      return
    }

    await handleReserve(seat.id)
    setReserveTarget(null)
  }

  const goBack = useCallback(() => {
    router.push(withTenantPrefix(`/courses/${params.courseSlug}?enrollmentId=${enrollmentId}`, tenant.type))
  }, [router, params.courseSlug, enrollmentId, tenant.type])

  const currentSeatId = state?.reservation?.seat_id ?? null
  const currentSeatLabel = state?.reservation?.seat?.label ?? null
  const manualCodeEntryEnabled = false

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
      <ConfirmationModal
        open={Boolean(reserveTarget)}
        title={currentSeatLabel ? '좌석을 변경할까요?' : '좌석을 확정할까요?'}
        description={reserveTarget ? (
          currentSeatLabel
            ? `현재 ${currentSeatLabel} 좌석에서 ${reserveTarget.label} 좌석으로 변경합니다. 좌석 변경 후 다시 바꾸려면 QR 인증이 다시 필요합니다.`
            : `${reserveTarget.label} 좌석을 내 좌석으로 확정합니다.`
        ) : undefined}
        confirmLabel={currentSeatLabel ? '좌석 변경' : '좌석 확정'}
        pendingLabel="처리 중..."
        submitting={working}
        onClose={() => {
          if (!working) {
            setReserveTarget(null)
          }
        }}
        onConfirm={() => {
          void handleReserveConfirmed()
        }}
      />
      <section className="student-hero px-4 pb-6 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={goBack} className="text-[13px] font-semibold tracking-[-0.02em] text-white/56 transition-all duration-200 ease-ios hover:text-white active:scale-[0.97]">
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
              {currentSeatRoom ? (
                <p className="mt-1 text-[12px] text-[var(--student-text-muted)]">{currentSeatRoom.name}</p>
              ) : null}
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

        {state.rooms.length > 1 ? (
          <section className="student-card px-4 py-4">
            <p className="student-eyebrow student-eyebrow-light">강의실</p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {state.rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => void handleSelectRoom(room.id)}
                  disabled={working || roomLoading || room.id === activeRoomId || !room.is_open}
                  className={`shrink-0 rounded-[999px] px-4 py-2 text-[13px] font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100 ${
                    room.id === activeRoomId
                      ? 'bg-[var(--student-text)] text-white disabled:opacity-100'
                      : !room.is_open
                        ? 'bg-[var(--student-surface-soft)] text-[var(--student-text-muted)] opacity-60'
                      : 'bg-[var(--student-surface-soft)] text-[var(--student-text)]'
                  }`}
                >
                  {room.name}{room.is_open ? '' : ' · 마감'}
                </button>
              ))}
            </div>
            {needsRoomSelection ? (
              <p className="mt-2 text-[12px] font-semibold text-[var(--student-link)]">QR 인증 전에 강의실을 선택해 주세요.</p>
            ) : null}
          </section>
        ) : null}

        {(error || message) ? (
          <section className="student-card px-4 py-3">
            {error ? <p className="text-[14px] font-medium text-[#c2410c]">{error}</p> : null}
            {message ? <p className="text-[14px] font-medium text-[#19703a]">{message}</p> : null}
            {presenceFailure ? (
              <PresenceFailureActions
                courseId={data.course.id}
                enrollmentId={data.enrollment.id}
                name={data.enrollment.name}
                phone={data.enrollment.phone}
                feature="designated_seat"
                browserContext={presenceFailure.browserContext}
                errorCode={presenceFailure.errorCode}
                message={presenceFailure.message}
                onRetry={() => setScannerOpen(true)}
              />
            ) : null}
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
              disabled={working || needsRoomSelection}
              className="student-pill-button student-pill-primary mt-3 w-full disabled:opacity-40"
              style={{ backgroundColor: courseTheme, borderColor: courseTheme }}
            >
              {working ? '위치 확인 중...' : 'QR 스캔으로 현장 인증'}
            </button>
            <div className={`mt-3 grid gap-2 sm:grid-cols-[1fr,auto] ${manualCodeEntryEnabled ? '' : 'hidden'}`}>
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="현장 코드 6자리"
                inputMode="numeric"
                className="h-12 rounded-[999px] border border-[rgba(0,0,0,0.08)] bg-[var(--student-surface-soft)] px-4 text-center text-[15px] font-semibold tracking-[0.24em] text-[var(--student-text)] outline-none transition focus:border-[var(--student-blue)] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => void handleVerify({ verificationMethod: 'code', rotationCode: codeInput })}
                disabled={working || needsRoomSelection || codeInput.length < 4}
                className="student-pill-button student-pill-outline w-full disabled:opacity-40 sm:w-auto"
              >
                코드 인증
              </button>
            </div>
            {process.env.NODE_ENV !== 'production' && lastScanDebug ? (
              <p className="mt-3 break-all text-[11px] leading-5 text-[var(--student-text-muted)]">
                디버그 스캔값: {lastScanDebug}
              </p>
            ) : null}
          </section>
        ) : null}

        {!selectedRoomStateReady || roomLoading ? (
          <section className="student-card px-4 py-5 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--student-blue)] border-t-transparent" />
            <p className="mt-3 text-[14px] text-[var(--student-text-muted)]">강의실 좌석을 불러오는 중입니다.</p>
          </section>
        ) : needsRoomSelection ? (
          <section className="student-card px-4 py-5 text-center">
            <p className="text-[14px] font-semibold text-[var(--student-link)]">강의실을 선택하면 좌석 배치가 표시됩니다.</p>
          </section>
        ) : state.rooms.length === 0 ? (
          <section className="student-card px-4 py-6 text-center">
            <p className="student-body">모든 강의실의 좌석 신청이 마감되었습니다.</p>
          </section>
        ) : state.layout && state.seats.length > 0 ? (
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
                  if (!selectedRoomStateReady || !state.writable || working) {
                    return
                  }

                  setReserveTarget(seat)
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

      <div className="px-4 pt-3 sm:px-5">
        <StudentAccessGuide compact onlyWhenKakao storageKey="class_pass_seat_access_guide_dismissed_until" />
      </div>

      {scannerOpen ? (
        <div className="student-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setScannerOpen(false)}>
          <div className="student-card w-full max-w-md bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[var(--student-text)]">현장 QR 스캔</h3>
              <button type="button" onClick={() => setScannerOpen(false)} className="text-[13px] text-[var(--student-link)] transition-all duration-200 ease-ios active:scale-[0.97]">
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
