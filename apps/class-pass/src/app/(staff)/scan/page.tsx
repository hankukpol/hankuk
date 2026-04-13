'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraReadinessError } from '@/lib/camera/access'
import { withTenantPrefix } from '@/lib/tenant'

type TabMode = 'qr' | 'quick'
type ScanState = 'idle' | 'scanning' | 'processing' | 'selecting'

type CourseItem = {
  id: number
  name: string
}

type MaterialItem = {
  id: number
  name: string
}

type ScanResponse = {
  success: boolean
  reason?: string
  studentName?: string
  materialName?: string
  needsSelection?: boolean
  unreceived?: MaterialItem[]
}

type OverlayState = {
  success: boolean
  title: string
  description?: string
}

type SessionResponse = {
  role: 'staff' | 'admin'
  division?: string
  adminId?: string
}

type BootstrapResponse = {
  courses: CourseItem[]
  materials: MaterialItem[]
}

type ScannerInstance = {
  start: (
    cameraIdOrConfig: string | { facingMode: 'environment' | { exact: 'environment' } },
    config: { fps: number; qrbox: { width: number; height: number } },
    successCallback: (decodedText: string) => void | Promise<void>,
    errorCallback?: (errorMessage: string) => void,
  ) => Promise<unknown>
  stop: () => Promise<void>
  clear: () => void
}

type LastScanState = {
  token: string
  at: number
}

const OVERLAY_TIMEOUT_MS = 1800
const ERROR_OVERLAY_TIMEOUT_MS = 2200
const SCAN_COOLDOWN_MS = 2500

async function fetchBootstrapData(courseId?: number | null): Promise<BootstrapResponse> {
  const query = courseId ? `?courseId=${courseId}` : ''
  const response = await fetch(`/api/distribution/staff-bootstrap${query}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as BootstrapResponse | null

  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? '직원 배부 데이터를 불러오지 못했습니다.')
  }

  return {
    courses: payload?.courses ?? [],
    materials: payload?.materials ?? [],
  }
}

async function fetchSessionAndConfigData() {
  const [configResponse, sessionResponse] = await Promise.all([
    fetch('/api/config/app', { cache: 'no-store' }),
    fetch('/api/auth/staff/session', { cache: 'no-store' }),
  ])

  const configPayload = await configResponse.json().catch(() => null)
  const sessionPayload = await sessionResponse.json().catch(() => null)

  if (!sessionResponse.ok) {
    throw new Error(sessionPayload?.error ?? '직원 세션을 확인하지 못했습니다.')
  }

  return {
    session: sessionPayload as SessionResponse,
    staffScanEnabled: configPayload?.staff_scan_enabled !== false,
  }
}

function normalizeToken(rawValue: string) {
  try {
    const url = new URL(rawValue)
    return url.searchParams.get('token') ?? rawValue
  } catch {
    return rawValue
  }
}

function describeScanReason(reason?: string) {
  switch (reason) {
    case 'INVALID_TOKEN':
      return '유효하지 않은 QR 코드입니다.'
    case 'ENROLLMENT_NOT_FOUND':
      return '수강생 정보를 찾을 수 없습니다.'
    case 'ALL_RECEIVED':
      return '모든 자료를 이미 수령했습니다.'
    case 'SELECT_MATERIAL':
      return '배부할 자료를 선택해 주세요.'
    case 'DISTRIBUTION_FAILED':
      return '배부에 실패했습니다. 다시 시도해 주세요.'
    default:
      return reason || '스캔을 처리하지 못했습니다.'
  }
}

export default function StaffScanPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scannerRef = useRef<ScannerInstance | null>(null)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef = useRef(false)
  const lastScanRef = useRef<LastScanState>({ token: '', at: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [isFeatureLoading, setIsFeatureLoading] = useState(true)
  const [staffScanEnabled, setStaffScanEnabled] = useState(true)
  const [tab, setTab] = useState<TabMode>('qr')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null)
  const [quickPhone, setQuickPhone] = useState('')
  const [quickLoading, setQuickLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [selectOptions, setSelectOptions] = useState<MaterialItem[]>([])
  const [pendingToken, setPendingToken] = useState('')
  const [lastStudentName, setLastStudentName] = useState('')

  const tokenFromUrl = searchParams.get('token')?.trim() ?? ''
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  )

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null

    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }

    processingRef.current = false

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

  const showOverlay = useCallback((nextOverlay: OverlayState, timeoutMs = OVERLAY_TIMEOUT_MS) => {
    setOverlay(nextOverlay)

    // Haptic feedback
    try {
      navigator.vibrate?.(nextOverlay.success ? 45 : 120)
    } catch {
      // vibration not supported
    }

    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
    }

    overlayTimerRef.current = setTimeout(() => {
      setOverlay(null)
      processingRef.current = false
      setScanState('scanning')
    }, timeoutMs)
  }, [])

  const handleScan = useCallback(
    async (decodedText: string) => {
      const token = normalizeToken(decodedText).trim()
      const now = Date.now()

      if (!token || processingRef.current) {
        return
      }

      if (lastScanRef.current.token === token && now - lastScanRef.current.at < SCAN_COOLDOWN_MS) {
        return
      }

      lastScanRef.current = { token, at: now }
      processingRef.current = true
      setScanState('processing')
      setSelectOptions([])
      setPendingToken(token)
      setMessage('')
      setError('')

      try {
        const response = await fetch('/api/distribution/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const payload = (await response.json().catch(() => null)) as ScanResponse | null

        const studentName = payload?.studentName ?? ''
        if (studentName) {
          setLastStudentName(studentName)
        }

        if (response.ok && payload?.success) {
          showOverlay(
            {
              success: true,
              title: `${payload.materialName ?? '자료'} 배부 완료`,
              description: studentName || undefined,
            },
            OVERLAY_TIMEOUT_MS,
          )
          return
        }

        if (payload?.needsSelection && payload.unreceived?.length) {
          setSelectOptions(payload.unreceived)
          setScanState('selecting')
          processingRef.current = false
          return
        }

        showOverlay(
          {
            success: false,
            title: '스캔을 완료하지 못했습니다.',
            description: payload?.studentName || describeScanReason(payload?.reason),
          },
          ERROR_OVERLAY_TIMEOUT_MS,
        )
      } catch {
        processingRef.current = false
        setScanState('scanning')
        setError('스캔 요청에 실패했습니다. 다시 시도해 주세요.')
      }
    },
    [showOverlay],
  )

  const startScanner = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    if (scannerRef.current) {
      return
    }

    const readinessError = await getCameraReadinessError()
    if (readinessError) {
      setScanState('idle')
      setError(readinessError)
      return
    }

    try {
      const qrModule = (await import('html5-qrcode')) as {
        Html5Qrcode: new (elementId: string) => ScannerInstance
      }

      const boxSize = Math.max(180, Math.min(containerRef.current?.offsetWidth ?? 260, 260))
      const scanner = new qrModule.Html5Qrcode('class-pass-qr-reader')
      const onSuccess = (decodedText: string) => {
        void handleScan(decodedText)
      }

      // Camera priority: prefer back camera with 1x zoom
      let bestCameraId: string | null = null
      try {
        const Html5QrcodeClass = qrModule.Html5Qrcode as unknown as {
          getCameras: () => Promise<{ id: string; label: string }[]>
        }
        if (typeof Html5QrcodeClass.getCameras === 'function') {
          const devices = await Html5QrcodeClass.getCameras()
          if (devices.length > 0) {
            const backCameras = devices.filter((d) => /back|rear|environment/i.test(d.label))
            const preferred = backCameras.find((d) => !/wide|ultra/i.test(d.label)) ?? backCameras[0]
            bestCameraId = preferred?.id ?? null
          }
        }
      } catch {
        // Fall back to facingMode constraint
      }

      try {
        if (bestCameraId) {
          await scanner.start(
            bestCameraId,
            { fps: 10, qrbox: { width: boxSize, height: boxSize } },
            onSuccess,
          )
        } else {
          await scanner.start(
            { facingMode: { exact: 'environment' } },
            { fps: 10, qrbox: { width: boxSize, height: boxSize } },
            onSuccess,
          )
        }
      } catch {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: boxSize, height: boxSize } },
          onSuccess,
        )
      }

      scannerRef.current = scanner
      setScanState('scanning')
    } catch {
      setScanState('idle')
      setError('카메라에 접근할 수 없습니다. HTTPS 및 브라우저 권한을 확인해 주세요.')
    }
  }, [handleScan])

  const handleSelectMaterial = useCallback(
    async (materialId: number) => {
      if (!pendingToken) {
        return
      }

      processingRef.current = true
      setScanState('processing')
      setError('')

      try {
        const response = await fetch('/api/distribution/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: pendingToken,
            materialId,
          }),
        })
        const payload = (await response.json().catch(() => null)) as ScanResponse | null

        setSelectOptions([])
        setPendingToken('')

        if (response.ok && payload?.success) {
          showOverlay(
            {
              success: true,
              title: `${payload.materialName ?? '자료'} 배부 완료`,
              description: payload.studentName || undefined,
            },
            OVERLAY_TIMEOUT_MS,
          )
          return
        }

        showOverlay(
          {
            success: false,
            title: '자료 선택을 완료하지 못했습니다.',
            description: payload?.studentName || describeScanReason(payload?.reason),
          },
          ERROR_OVERLAY_TIMEOUT_MS,
        )
      } catch {
        processingRef.current = false
        setScanState('selecting')
        setError('자료 선택 요청에 실패했습니다. 다시 시도해 주세요.')
      }
    },
    [pendingToken, showOverlay],
  )

  async function handleQuickDistribute() {
    if (!selectedCourseId || !quickPhone.trim()) {
      setError('강좌를 선택하고 전화번호를 입력해 주세요.')
      return
    }

    setQuickLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/distribution/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourseId,
          phone: quickPhone.replace(/\D/g, ''),
          materialId: selectedMaterialId ?? undefined,
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '수동 배부에 실패했습니다.')
        return
      }

      setMessage(`${payload?.student_name ?? '수강생'} - ${payload?.material_name ?? '자료'} 배부 완료`)
      setQuickPhone('')
    } catch {
      setError('수동 배부 요청에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      setQuickLoading(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/staff/logout', { method: 'POST' }).catch(() => null)
    router.push(withTenantPrefix('/staff/login', tenant.type))
  }

  useEffect(() => {
    let cancelled = false

    fetchSessionAndConfigData()
      .then(async (data) => {
        if (cancelled) {
          return
        }

        setSession(data.session)
        setStaffScanEnabled(data.staffScanEnabled)
        setTab(data.staffScanEnabled ? 'qr' : 'quick')

        const bootstrap = await fetchBootstrapData()
        if (cancelled) {
          return
        }

        setCourses(bootstrap.courses)
        if (bootstrap.courses.length > 0) {
          setSelectedCourseId(bootstrap.courses[0].id)
        } else {
          setSelectedCourseId(null)
          setMaterials([])
          setSelectedMaterialId(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '직원 화면을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFeatureLoading(false)
        }
      })

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [stopScanner])

  useEffect(() => {
    if (!selectedCourseId) {
      setMaterials([])
      setSelectedMaterialId(null)
      return
    }

    let cancelled = false

    fetchBootstrapData(selectedCourseId)
      .then((data) => {
        if (cancelled) {
          return
        }

        setCourses(data.courses)
        setMaterials(data.materials)
        setSelectedMaterialId((current) =>
          data.materials.some((material) => material.id === current)
            ? current
            : (data.materials[0]?.id ?? null),
        )
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '이 강좌의 자료를 불러오지 못했습니다.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedCourseId])

  useEffect(() => {
    if (!staffScanEnabled || tab !== 'qr' || isFeatureLoading) {
      void stopScanner()
      return
    }

    if (tokenFromUrl) {
      void handleScan(tokenFromUrl)
      router.replace(withTenantPrefix('/staff/scan', tenant.type), { scroll: false })
    }

    void startScanner()

    return () => {
      void stopScanner()
    }
  }, [handleScan, isFeatureLoading, router, staffScanEnabled, startScanner, stopScanner, tab, tenant.type, tokenFromUrl])

  if (isFeatureLoading) {
    return <p className="px-5 py-10 text-sm text-gray-500">직원 화면을 준비하는 중...</p>
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] px-5 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                직원 배부
              </p>
              <h1 className="mt-3 text-3xl font-extrabold text-gray-900">현장 스캔 및 배부</h1>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                현장에서 QR 스캔과 수동 배부를 한 곳에서 처리합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {session ? (
                <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                  {session.role === 'admin' ? `관리자 ${session.adminId ?? ''}` : '직원 세션'}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                로그아웃
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1fr,220px]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-gray-700">강좌</span>
              <select
                value={selectedCourseId ?? ''}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSelectedCourseId(event.target.value ? Number(event.target.value) : null)
                }
                className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
              >
                <option value="">강좌를 선택하세요</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setTab('qr')}
                disabled={!staffScanEnabled}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  tab === 'qr' ? 'bg-slate-900 text-white' : 'text-slate-600'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                QR 스캔
              </button>
              <button
                type="button"
                onClick={() => setTab('quick')}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  tab === 'quick' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                수동 배부
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        {tab === 'qr' ? (
          <section className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">QR 스캐너</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {staffScanEnabled
                      ? '수강생 QR 코드를 스캔하면 다음 필요한 자료를 즉시 배부합니다.'
                      : 'QR 스캔 기능이 현재 비활성화되어 있습니다.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    void stopScanner().then(() => startScanner())
                  }}
                  disabled={!staffScanEnabled}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                >
                  다시 시작
                </button>
              </div>

              <div ref={containerRef} className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                <div id="class-pass-qr-reader" className="min-h-[320px] w-full" />

                {scanState === 'processing' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/65">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
                  </div>
                ) : null}

                {overlay ? (
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center px-5 text-center ${
                      overlay.success ? 'bg-emerald-700/90' : 'bg-red-700/90'
                    }`}
                  >
                    <p className="text-2xl font-bold text-white">{overlay.title}</p>
                    {overlay.description ? (
                      <p className="mt-2 text-sm text-white/80">{overlay.description}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {lastStudentName ? (
                <p className="mt-4 text-sm text-gray-500">
                  마지막 수강생: <span className="font-semibold text-gray-900">{lastStudentName}</span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-6">
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-extrabold text-gray-900">선택된 강좌</h2>
                <p className="mt-2 text-sm text-gray-500">
                  QR 토큰에 강좌 정보가 포함되어 있지만, 현장 직원이 세션을 확인할 수 있도록 현재 강좌를 표시합니다.
                </p>

                <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-gray-500">현재 강좌</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{selectedCourse?.name ?? '선택된 강좌 없음'}</p>
                  <p className="mt-2 text-sm text-gray-500">활성 자료 {materials.length}</p>
                </div>
              </section>

              {selectOptions.length > 0 ? (
                <section className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-extrabold text-gray-900">자료 선택</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    이 수강생은 아직 수령하지 않은 자료가 여러 개 있습니다. 지금 배부할 자료를 선택해 주세요.
                  </p>

                  <div className="mt-5 grid gap-3">
                    {selectOptions.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        onClick={() => void handleSelectMaterial(material.id)}
                        className="rounded-2xl bg-slate-900 px-4 py-4 text-left text-sm font-semibold text-white"
                      >
                        {material.name}
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-extrabold text-gray-900">안내</h2>
                  <p className="mt-3 text-sm leading-6 text-gray-500">
                    수강생이 수강증 페이지 URL을 직접 열면 토큰이 자동으로 처리됩니다. 카메라 접근이 차단된 경우 전화번호로 수동 배부를 이용해 주세요.
                  </p>
                </section>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                void handleQuickDistribute()
              }}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <h2 className="text-2xl font-extrabold text-gray-900">수동 배부</h2>
              <p className="mt-2 text-sm text-gray-500">
                현장에서 QR 스캔이 어려운 경우, 전화번호로 수강생을 찾아 수동으로 자료를 배부합니다.
              </p>

              <div className="mt-6 grid gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-gray-700">전화번호</span>
                  <input
                    value={quickPhone}
                    onChange={(event) => setQuickPhone(event.target.value.replace(/\D/g, ''))}
                    placeholder="01012345678"
                    inputMode="numeric"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-gray-700">자료</span>
                  <select
                    value={selectedMaterialId ?? ''}
                    onChange={(event) =>
                      setSelectedMaterialId(event.target.value ? Number(event.target.value) : null)
                    }
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                  >
                    <option value="">자동 선택 또는 직접 선택</option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={quickLoading}
                className="mt-6 rounded-2xl px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--theme)' }}
              >
                {quickLoading ? '처리 중...' : '배부 실행'}
              </button>
            </form>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900">현장 메모</h2>
              <div className="mt-5 grid gap-4">
                <article className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-gray-500">현재 강좌</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{selectedCourse?.name ?? '선택된 강좌 없음'}</p>
                </article>
                <article className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-gray-500">활성 자료</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{materials.length}</p>
                </article>
                <article className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-gray-500">팁</p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    전화번호 배부는 선택된 강좌 내에서 수강생을 검색합니다. 강좌를 먼저 확인하면 가장 빠르게 조회할 수 있습니다.
                  </p>
                </article>
              </div>
            </section>
          </section>
        )}
      </div>
    </div>
  )
}
