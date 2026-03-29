'use client'

import { useState, useEffect, useRef } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'

type ScanState = 'idle' | 'scanning' | 'processing' | 'selecting'
type TabMode = 'qr' | 'quick'
const SUCCESS_OVERLAY_MS = 900
const FAILURE_OVERLAY_MS = 1800
const SCAN_TOKEN_COOLDOWN_MS = 2500

interface ScanResult {
  success: boolean
  reason?: string
  materialName?: string
  studentName?: string
  examNumber?: string
  series?: string
  region?: string
  needsSelection?: boolean
  unreceived?: { id: number; name: string }[]
}

interface ResultOverlay {
  success: boolean
  title: string
  studentName?: string
}

interface Material {
  id: number
  name: string
  is_active: boolean
}

interface CameraOption {
  id: string
  label: string
}

type ExtendedTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[]
  zoom?: MediaSettingsRange
}

type ExtendedTrackSettings = MediaTrackSettings & { zoom?: number }

type ExtendedConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
  zoom?: number
}

type ScannerInstance = {
  stop: () => Promise<void>
  clear: () => void
  getRunningTrackCapabilities?: () => ExtendedTrackCapabilities
  getRunningTrackSettings?: () => ExtendedTrackSettings
  applyVideoConstraints?: (constraints: MediaTrackConstraints) => Promise<void>
}

export default function ScanPage() {
  const tenant = useTenantConfig()
  const [tab, setTab] = useState<TabMode>('qr')
  const [state, setState] = useState<ScanState>('idle')
  const [isFeatureLoading, setIsFeatureLoading] = useState(true)
  const [staffScanEnabled, setStaffScanEnabled] = useState(true)
  const [staffQuickEnabled, setStaffQuickEnabled] = useState(true)
  const [selectResult, setSelectResult] = useState<ScanResult | null>(null)
  const [overlay, setOverlay] = useState<ResultOverlay | null>(null)
  const [lastStudentName, setLastStudentName] = useState('')
  const scannerRef = useRef<ScannerInstance | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingTokenRef = useRef<string>('')
  const isProcessingRef = useRef(false)
  const isStartingRef = useRef(false)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentScanRef = useRef<Map<string, number>>(new Map())
  const initialUrlTokenRef = useRef('')

  const [materials, setMaterials] = useState<Material[]>([])
  const [quickPhone, setQuickPhone] = useState('')
  const [quickMatId, setQuickMatId] = useState<number | null>(null)
  const [quickLoading, setQuickLoading] = useState(false)
  const [quickMsg, setQuickMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false

    if (typeof window !== 'undefined') {
      initialUrlTokenRef.current = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
    }

    const bootScanner = async () => {
      const appConfig = await fetch('/api/config/app', { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null) as {
          staff_scan_enabled?: boolean
          staff_quick_distribution_enabled?: boolean
        } | null

      if (cancelled) return

      const scanEnabled = appConfig?.staff_scan_enabled ?? true
      const quickEnabled = appConfig?.staff_quick_distribution_enabled ?? true
      setStaffScanEnabled(scanEnabled)
      setStaffQuickEnabled(quickEnabled)
      setIsFeatureLoading(false)

      if (!scanEnabled && !quickEnabled) {
        clearUrlToken()
        await stopScanner()
        setState('idle')
        return
      }

      setTab(scanEnabled ? 'qr' : 'quick')

      if (quickEnabled) {
        const materialsResponse = await fetch('/api/materials')
          .then((r) => r.json())
          .catch(() => null) as { materials?: Material[] } | null

        if (cancelled) return

        const active = (materialsResponse?.materials ?? []).filter((m: Material) => m.is_active)
        setMaterials(active)
        if (active.length > 0) setQuickMatId(active[0].id)
      }

      if (scanEnabled) {
        if (initialUrlTokenRef.current) {
          clearUrlToken()
          await handleScan(initialUrlTokenRef.current)
        }

        await startScanner()
      } else {
        clearUrlToken()
        await stopScanner()
      }
    }

    const rafId = requestAnimationFrame(() => {
      void bootScanner()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/staff/logout', { method: 'POST' })
    localStorage.removeItem('staff_auth_mode')
    localStorage.removeItem('staff_auth_id')
    localStorage.removeItem('staff_auth_pin')
    window.location.href = '/staff/login'
  }

  function clearScannerContainer() {
    const qrEl = document.getElementById('qr-reader')
    if (qrEl) qrEl.innerHTML = ''
  }

  function clearUrlToken() {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    if (!url.searchParams.has('token')) return

    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function parseCameraZoom(label: string) {
    const match = label.toLowerCase().match(/(\d+(?:\.\d+)?)\s*x\b/)
    if (!match) return null

    const zoom = Number(match[1])
    return Number.isFinite(zoom) ? zoom : null
  }

  function getCameraPriority(camera: CameraOption) {
    const label = camera.label.trim().toLowerCase()
    const zoom = parseCameraZoom(label)
    let score = 0

    if (!label) return -50
    if (/(front|user|selfie|face|전면)/i.test(label)) score -= 600
    if (/(back|rear|environment|후면)/i.test(label)) score += 400
    if (/(main|standard|default|기본)/i.test(label)) score += 160
    if (/\b1x\b/.test(label)) score += 220
    if (/wide/.test(label) && !/ultra[\s-]?wide/.test(label)) score += 40
    if (/(ultra[\s-]?wide|0\.5x|macro|depth|tof|virtual)/i.test(label)) score -= 260
    if (/(tele|telephoto|periscope)/i.test(label)) score -= 120

    if (zoom !== null) {
      score += 180 - Math.round(Math.abs(zoom - 1) * 140)
    }

    return score
  }

  function getRankedCameraTargets(cameras: CameraOption[]) {
    const withLabels = cameras.filter((camera) => camera.label.trim())
    const ranked = [...withLabels].sort((left, right) => {
      const priorityDiff = getCameraPriority(right) - getCameraPriority(left)
      if (priorityDiff !== 0) return priorityDiff
      return left.label.localeCompare(right.label)
    })

    return ranked.map((camera) => camera.id)
  }

  async function optimizeRunningCamera(scanner: ScannerInstance) {
    if (!scanner.applyVideoConstraints) return

    try {
      const capabilities = scanner.getRunningTrackCapabilities?.()
      const settings = scanner.getRunningTrackSettings?.()
      const advanced: ExtendedConstraintSet[] = []

      if (Array.isArray(capabilities?.focusMode)) {
        if (capabilities.focusMode.includes('continuous')) {
          advanced.push({ focusMode: 'continuous' })
        } else if (capabilities.focusMode.includes('single-shot')) {
          advanced.push({ focusMode: 'single-shot' })
        }
      }

      if (capabilities?.zoom) {
        const { min, max } = capabilities.zoom
        const canResetToOneX = typeof min === 'number' && typeof max === 'number' && min <= 1 && max >= 1
        const currentZoom = typeof settings?.zoom === 'number' ? settings.zoom : null
        if (canResetToOneX && (currentZoom === null || currentZoom < 0.95 || currentZoom > 1.25)) {
          advanced.push({ zoom: 1 })
        }
      }

      if (advanced.length > 0) {
        await scanner.applyVideoConstraints({ advanced })
      }
    } catch {
      // Camera-specific tuning failures are non-fatal.
    }
  }

  function optimizeScannerVideo() {
    const video = document.querySelector('#qr-reader video') as HTMLVideoElement | null
    if (!video) return
    video.muted = true
    video.setAttribute('muted', 'true')
    video.setAttribute('autoplay', 'true')
    video.setAttribute('playsinline', 'true')
    void video.play().catch(() => {})
  }

  function getCameraErrorMessage(error: unknown) {
    const message = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''

    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        return '카메라 권한이 차단되었습니다. 브라우저 설정에서 카메라를 허용해 주세요.'
      }
      if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        return '사용 가능한 카메라를 찾지 못했습니다. 다른 브라우저나 기기에서 다시 시도해 주세요.'
      }
      if (error.name === 'NotReadableError') {
        return '카메라가 다른 앱에서 사용 중입니다. 카메라 앱을 종료한 뒤 다시 시도해 주세요.'
      }
    }

    if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
      return '카메라 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.'
    }
    if (message.includes('Requested device not found') || message.includes('NotFoundError') || message.includes('no-camera')) {
      return '사용 가능한 카메라를 찾지 못했습니다.'
    }
    if (message.includes('NotReadableError')) {
      return '카메라가 이미 사용 중입니다. 다른 앱을 종료한 뒤 다시 시도해 주세요.'
    }

    return '카메라를 시작할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
  }

  function normalizeScanToken(decodedText: string) {
    try {
      const url = new URL(decodedText)
      return url.searchParams.get('token') ?? decodedText
    } catch {
      return decodedText
    }
  }

  function isRecentlyProcessed(token: string) {
    const now = Date.now()
    for (const [savedToken, savedAt] of recentScanRef.current.entries()) {
      if (now - savedAt > SCAN_TOKEN_COOLDOWN_MS) recentScanRef.current.delete(savedToken)
    }

    const lastProcessedAt = recentScanRef.current.get(token)
    return typeof lastProcessedAt === 'number' && now - lastProcessedAt < SCAN_TOKEN_COOLDOWN_MS
  }

  function markRecentlyProcessed(token: string) {
    recentScanRef.current.set(token, Date.now())
  }

  function notifyScanHandled(success: boolean) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    navigator.vibrate(success ? 45 : 120)
  }

  function isPermissionDeniedError(error: unknown) {
    const message = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''

    return (error instanceof DOMException && error.name === 'NotAllowedError')
      || message.includes('Permission denied')
      || message.includes('NotAllowedError')
  }

  async function startScanner() {
    if (typeof window === 'undefined') return
    if (scannerRef.current) return
    if (isStartingRef.current) return

    if (!window.isSecureContext) {
      setState('idle')
      showOverlay(
        { success: false, title: '카메라 스캔은 HTTPS 또는 localhost에서만 사용할 수 있습니다.' },
        5000,
      )
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('idle')
      showOverlay({ success: false, title: '이 브라우저는 카메라 접근을 지원하지 않습니다.' }, 5000)
      return
    }

    isStartingRef.current = true
    setState('scanning')
    isProcessingRef.current = false

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      const containerWidth = containerRef.current?.offsetWidth ?? 300
      const boxSize = Math.max(150, Math.min(250, containerWidth - 40))
      const config = { fps: 10, qrbox: { width: boxSize, height: boxSize }, aspectRatio: 1 }
      const cb = async (text: string) => {
        await handleScan(text)
      }
      const createScanner = () =>
        new Html5Qrcode('qr-reader', {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        })
      const targets: Array<string | { facingMode: 'environment' | { exact: 'environment' } }> = []

      try {
        const cameras = await Html5Qrcode.getCameras()
        const rankedTargets = getRankedCameraTargets(cameras)
        targets.push(...rankedTargets)
      } catch (error) {
        if (isPermissionDeniedError(error)) throw error
      }

      targets.push({ facingMode: { exact: 'environment' } })
      targets.push({ facingMode: 'environment' })

      let lastError: unknown = null
      for (const target of targets) {
        clearScannerContainer()
        const scanner = createScanner()
        try {
          await scanner.start(target, config, cb, undefined)
          scannerRef.current = scanner
          await optimizeRunningCamera(scanner)
          optimizeScannerVideo()
          return
        } catch (error) {
          lastError = error
          try {
            await scanner.stop()
          } catch {
            // ignore
          }
          try {
            scanner.clear()
          } catch {
            // ignore
          }
        }
      }

      if (!isPermissionDeniedError(lastError)) {
        const cameras = await Html5Qrcode.getCameras()
        const fallbackTargets = cameras.map((camera) => camera.id).filter(Boolean)

        for (const target of fallbackTargets) {
          clearScannerContainer()
          const scanner = createScanner()
          try {
            await scanner.start(target, config, cb, undefined)
            scannerRef.current = scanner
            await optimizeRunningCamera(scanner)
            optimizeScannerVideo()
            return
          } catch (error) {
            lastError = error
            try {
              await scanner.stop()
            } catch {
              // ignore
            }
            try {
              scanner.clear()
            } catch {
              // ignore
            }
          }
        }
      }

      throw lastError ?? new Error('camera-start-failed')
    } catch (error) {
      clearScannerContainer()
      scannerRef.current = null
      setState('idle')
      showOverlay({ success: false, title: getCameraErrorMessage(error) }, 5000)
    } finally {
      isStartingRef.current = false
    }
  }

  async function stopScanner() {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }

    const scanner = scannerRef.current
    scannerRef.current = null
    isStartingRef.current = false
    isProcessingRef.current = false

    if (scanner) {
      try {
        await (scanner as { stop: () => Promise<void> }).stop()
      } catch {
        // ignore
      }
      try {
        scanner.clear()
      } catch {
        // ignore
      }
    }

    clearScannerContainer()
  }

  function showOverlay(o: ResultOverlay, durationMs = 2500) {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    setOverlay(o)
    overlayTimerRef.current = setTimeout(() => {
      setOverlay(null)
      isProcessingRef.current = false
    }, durationMs)
  }

  async function handleScan(decodedText: string) {
    const token = normalizeScanToken(decodedText)
    if (isRecentlyProcessed(token)) return
    if (isProcessingRef.current) return

    isProcessingRef.current = true
    setState('processing')
    pendingTokenRef.current = token

    try {
      const res = await fetch('/api/distribution/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data: ScanResult = await res.json()
      if (data.studentName) setLastStudentName(data.studentName)

      if (data.needsSelection) {
        setSelectResult(data)
        setState('selecting')
        return
      }

      setState('scanning')

      if (data.success) {
        markRecentlyProcessed(token)
        notifyScanHandled(true)
        showOverlay(
          { success: true, title: `${data.materialName} 배부 완료`, studentName: data.studentName },
          SUCCESS_OVERLAY_MS,
        )
      } else {
        let title = '처리 실패'
        if (data.reason === 'ALREADY_RECEIVED') title = '이미 수령한 자료입니다'
        else if (data.reason === 'ALL_RECEIVED') title = '모든 자료를 이미 수령했습니다'
        else if (data.reason === 'INVALID_TOKEN') title = '유효하지 않은 QR 코드'
        else if (data.reason) title = data.reason

        markRecentlyProcessed(token)
        notifyScanHandled(false)
        showOverlay({ success: false, title, studentName: data.studentName }, FAILURE_OVERLAY_MS)
      }
    } catch {
      setState('scanning')
      showOverlay({ success: false, title: '네트워크 오류가 발생했습니다' }, FAILURE_OVERLAY_MS)
    }
  }

  async function handleSelectMaterial(materialId: number) {
    setState('processing')
    const token = pendingTokenRef.current

    try {
      const res = await fetch('/api/distribution/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, material_id: materialId }),
      })
      const data: ScanResult = await res.json()
      if (data.studentName) setLastStudentName(data.studentName)
      setSelectResult(null)
      setState('scanning')

      if (data.success) {
        markRecentlyProcessed(token)
        notifyScanHandled(true)
        showOverlay(
          { success: true, title: `${data.materialName} 배부 완료`, studentName: data.studentName },
          SUCCESS_OVERLAY_MS,
        )
      } else {
        markRecentlyProcessed(token)
        notifyScanHandled(false)
        showOverlay({ success: false, title: '처리 실패' }, FAILURE_OVERLAY_MS)
      }
    } catch {
      setSelectResult(null)
      setState('scanning')
      showOverlay({ success: false, title: '네트워크 오류가 발생했습니다' }, FAILURE_OVERLAY_MS)
    }
  }

  async function handleQuickDistribute() {
    if (!quickPhone.trim() || !quickMatId) return

    setQuickLoading(true)
    setQuickMsg(null)

    const res = await fetch('/api/distribution/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: quickPhone.replace(/\D/g, ''), material_id: quickMatId }),
    })
    const data = await res.json()

    setQuickLoading(false)

    if (res.ok) {
      setQuickMsg({ text: `${data.student_name} - ${data.material_name} 배부 완료`, ok: true })
      setQuickPhone('')
    } else {
      setQuickMsg({ text: data.error ?? '배부 실패', ok: false })
    }

    setTimeout(() => setQuickMsg(null), 4000)
  }

  if (isFeatureLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F9FAFB] px-5">
        <p className="text-sm text-gray-500">기능 설정을 확인하는 중입니다...</p>
      </div>
    )
  }

  if (!staffScanEnabled && !staffQuickEnabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F9FAFB] px-5 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-lg font-bold text-amber-900">직원 스캔 기능이 비활성화되었습니다.</p>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            관리자 설정에 따라 현재 스캔과 빠른 배부 기능을 사용할 수 없습니다.
          </p>
        </div>
        <button
          onClick={() => void handleLogout()}
          className="mt-6 text-xs text-gray-400 underline"
        >
          로그아웃
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center px-5 py-6"
      style={{ background: tab === 'quick' ? '#F9FAFB' : '#F0F2F8' }}
    >
      {staffScanEnabled && staffQuickEnabled ? (
        <div className="mb-5 flex w-full max-w-sm overflow-hidden border border-gray-200">
          {(['qr', 'quick'] as TabMode[]).map((t) => (
            <button
              key={t}
              onClick={async () => {
                if (t === 'quick') {
                  await stopScanner()
                  setTab(t)
                  setState('idle')
                  setSelectResult(null)
                  setOverlay(null)
                } else {
                  setTab(t)
                  requestAnimationFrame(() => startScanner())
                }
              }}
              className="flex-1 py-2.5 text-sm font-medium transition-colors"
              style={
                tab === t
                  ? { background: 'var(--theme)', color: '#fff' }
                  : { background: '#fff', color: '#6b7280' }
              }
            >
              {t === 'qr' ? 'QR 스캔' : '번호 입력'}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'qr' && staffScanEnabled && (
        <>
          {lastStudentName && (
            <div className="mb-4 w-full max-w-sm border border-gray-100 bg-white px-4 py-2.5 text-center text-sm">
              <span className="text-gray-400">마지막 처리:</span>{' '}
              <span className="font-semibold text-green-700">{lastStudentName}</span>
            </div>
          )}

          <div className="relative mb-4 w-full max-w-sm overflow-hidden">
            <div
              id="qr-reader"
              ref={containerRef}
              className="w-full"
              style={{ minHeight: state !== 'idle' || !!overlay ? 300 : 4 }}
            />

            {state === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="h-14 w-14 animate-spin rounded-full border-4 border-t-transparent border-white" />
              </div>
            )}

            {overlay && state !== 'processing' && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center px-4"
                style={{
                  background: overlay.success
                    ? 'rgba(27,94,32,0.92)'
                    : 'rgba(183,28,28,0.92)',
                }}
              >
                <p className="mb-1 text-center text-xl font-bold text-white">{overlay.title}</p>
                {overlay.studentName ? (
                  <p className="text-sm text-white/80">{overlay.studentName}</p>
                ) : null}
              </div>
            )}
          </div>

          {state === 'selecting' && selectResult ? (
            <div className="w-full max-w-sm">
              <div className="mb-3 border border-gray-100 bg-white p-4">
                {selectResult.studentName ? (
                  <div className="flex justify-between border-b border-gray-50 py-2">
                    <span className="text-sm text-gray-500">이름</span>
                    <span className="text-sm font-semibold">{selectResult.studentName}</span>
                  </div>
                ) : null}
                {selectResult.examNumber ? (
                  <div className="flex justify-between border-b border-gray-50 py-2">
                    <span className="text-sm text-gray-500">수험번호</span>
                    <span className="text-sm font-semibold">{selectResult.examNumber}</span>
                  </div>
                ) : null}
                {selectResult.series ? (
                  <div className="flex justify-between border-b border-gray-50 py-2">
                    <span className="text-sm text-gray-500">{tenant.labels.series}</span>
                    <span className="text-sm font-semibold">{selectResult.series}</span>
                  </div>
                ) : null}
                {tenant.showRegionInScan && selectResult.region ? (
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-500">{tenant.labels.region}</span>
                    <span className="text-sm font-semibold">{selectResult.region}</span>
                  </div>
                ) : null}
              </div>

              <p className="mb-2 text-sm font-semibold text-gray-700">
                배부할 자료를 선택해 주세요
              </p>
              <div className="flex flex-col gap-2">
                {(selectResult.unreceived ?? []).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMaterial(m.id)}
                    className="w-full py-3 text-base font-bold text-white"
                    style={{ background: 'var(--theme)' }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectResult(null)
                  setState('scanning')
                  isProcessingRef.current = false
                }}
                className="mt-2 w-full bg-gray-200 py-3 text-sm font-medium text-gray-600"
              >
                취소
              </button>
            </div>
          ) : null}

          {state === 'idle' ? (
            <button
              onClick={startScanner}
              className="w-full max-w-sm py-4 text-lg font-bold text-white"
              style={{ background: 'var(--theme)' }}
            >
              QR 스캔 시작
            </button>
          ) : null}

          {state === 'scanning' && !overlay && !selectResult ? (
            <p className="text-center text-sm text-gray-500">
              카메라로 학생의 QR 코드를 스캔해 주세요
            </p>
          ) : null}
        </>
      )}

      {tab === 'quick' && staffQuickEnabled ? (
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-bold text-gray-900">휴대전화 번호로 빠른 배부</h1>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">
                휴대전화 번호
              </label>
              <input
                type="tel"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickDistribute()}
                placeholder="예: 01012345678"
                inputMode="numeric"
                className="w-full border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">자료 선택</label>
              <div className="flex flex-col gap-1">
                {materials.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setQuickMatId(m.id)}
                    className="border px-4 py-2.5 text-left text-sm font-medium transition-colors"
                    style={
                      quickMatId === m.id
                        ? {
                            background: 'var(--theme)',
                            color: '#fff',
                            borderColor: 'var(--theme)',
                          }
                        : {
                            background: '#fff',
                            color: '#374151',
                            borderColor: '#d1d5db',
                          }
                    }
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleQuickDistribute}
              disabled={quickLoading || !quickPhone.trim() || !quickMatId}
              className="w-full py-3 text-base font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--theme)' }}
            >
              {quickLoading ? '처리 중...' : '배부 처리'}
            </button>

            {quickMsg ? (
              <p
                className={`py-2 text-center text-sm font-medium ${
                  quickMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}
              >
                {quickMsg.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        onClick={() => void handleLogout()}
        className="mt-8 text-xs text-gray-400 underline"
      >
        로그아웃
      </button>
    </div>
  )
}
