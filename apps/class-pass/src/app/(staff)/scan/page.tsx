'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraReadinessError } from '@/lib/camera/access'
import { withTenantPrefix } from '@/lib/tenant'
import { QuickDistributionPanel } from './quick-distribution-panel'
import { QrDistributionPanel } from './qr-distribution-panel'
import {
  ERROR_OVERLAY_TIMEOUT_MS,
  OVERLAY_TIMEOUT_MS,
  SCAN_COOLDOWN_MS,
  fetchBootstrapData,
  formatMaterialLabel,
  getScanReasonMessage,
  normalizeToken,
} from './scan-page-utils'
import type {
  CourseItem,
  LastScanState,
  MaterialItem,
  OverlayState,
  QuickDistributionResponse,
  ScanResponse,
  ScanState,
  ScannerInstance,
  SessionResponse,
  TabMode,
} from './scan-page-types'

export default function StaffScanPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scannerRef = useRef<ScannerInstance | null>(null)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef = useRef(false)
  const lastScanRef = useRef<LastScanState>({ token: '', at: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bootstrappedCourseIdRef = useRef<number | null>(null)

  const [isFeatureLoading, setIsFeatureLoading] = useState(true)
  const [staffScanEnabled, setStaffScanEnabled] = useState(true)
  const [tab, setTab] = useState<TabMode>('qr')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [courseMaterials, setCourseMaterials] = useState<MaterialItem[]>([])
  const [quickMaterials, setQuickMaterials] = useState<MaterialItem[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null)
  const [quickPhone, setQuickPhone] = useState('')
  const [quickStudentName, setQuickStudentName] = useState('')
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
  const selectedCourseName = selectedCourse?.name ?? null
  const materialsCount = courseMaterials.length

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
              title: `${formatMaterialLabel(payload.materialName ?? '자료', payload.materialType)} 배부 완료`,
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
            description: payload?.studentName || getScanReasonMessage(payload?.reason),
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
              title: `${formatMaterialLabel(payload.materialName ?? '자료', payload.materialType)} 배부 완료`,
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
            description: payload?.studentName || getScanReasonMessage(payload?.reason),
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

    if (quickMaterials.length > 1 && !selectedMaterialId) {
      setError('배부할 자료를 선택해 주세요.')
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
          materialId: quickMaterials.length > 0 ? (selectedMaterialId ?? undefined) : undefined,
        }),
      })
      const payload = (await response.json().catch(() => null)) as QuickDistributionResponse | null

      if (!response.ok) {
        setError(payload?.error ?? '수동 배부에 실패했습니다.')
        return
      }

      if (payload?.needsSelection && payload.available_materials?.length) {
        setQuickStudentName(payload.student_name ?? '')
        setQuickMaterials(payload.available_materials)
        setSelectedMaterialId(
          payload.available_materials.length === 1 ? payload.available_materials[0]?.id ?? null : null,
        )
        setMessage(`${payload.student_name ?? '수강생'} 수강생을 찾았습니다. 배부할 자료를 선택해 주세요.`)
        return
      }

      setMessage(
        `${payload?.student_name ?? '수강생'} - ${formatMaterialLabel(payload?.material_name ?? '자료', payload?.material_type)} 배부 완료`,
      )
      setQuickPhone('')
      setQuickStudentName('')
      setQuickMaterials([])
      setSelectedMaterialId(null)
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

    fetchBootstrapData()
      .then((data) => {
        if (cancelled) {
          return
        }

        setSession(data.session)
        setStaffScanEnabled(data.staffScanEnabled)
        setTab(data.staffScanEnabled ? 'qr' : 'quick')
        setCourses(data.courses)
        setCourseMaterials(data.materials)
        setQuickMaterials([])
        bootstrappedCourseIdRef.current = data.selectedCourseId
        setSelectedCourseId(data.selectedCourseId)
        setSelectedMaterialId(null)
        setQuickStudentName('')
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
      bootstrappedCourseIdRef.current = null
      setCourseMaterials([])
      setQuickMaterials([])
      setSelectedMaterialId(null)
      setQuickStudentName('')
      return
    }

    if (bootstrappedCourseIdRef.current === selectedCourseId) {
      bootstrappedCourseIdRef.current = null
      return
    }

    let cancelled = false

    fetchBootstrapData(selectedCourseId)
      .then((data) => {
        if (cancelled) {
          return
        }

        setCourses(data.courses)
        setCourseMaterials(data.materials)
        setQuickMaterials([])
        setSelectedMaterialId(null)
        setQuickStudentName('')
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
          <QrDistributionPanel
            staffScanEnabled={staffScanEnabled}
            scanState={scanState}
            overlay={overlay}
            lastStudentName={lastStudentName}
            selectedCourseName={selectedCourseName}
            materialsCount={materialsCount}
            selectOptions={selectOptions}
            containerRef={containerRef}
            onRestartScanner={() => {
              setError('')
              void stopScanner().then(() => startScanner())
            }}
            onSelectMaterial={(materialId) => {
              void handleSelectMaterial(materialId)
            }}
          />
        ) : (
          <QuickDistributionPanel
            quickPhone={quickPhone}
            quickStudentName={quickStudentName}
            quickLoading={quickLoading}
            quickMaterials={quickMaterials}
            selectedMaterialId={selectedMaterialId}
            selectedCourseName={selectedCourseName}
            materialsCount={materialsCount}
            onQuickPhoneChange={(nextPhone) => {
              setQuickPhone(nextPhone)
              setQuickStudentName('')
              setQuickMaterials([])
              setSelectedMaterialId(null)
            }}
            onSelectedMaterialChange={setSelectedMaterialId}
            onSubmit={() => {
              void handleQuickDistribute()
            }}
          />
        )}
      </div>
    </div>
  )
}
