'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { getCameraAccessErrorMessage, getCameraReadinessError } from '@/lib/camera/access'
import { withTenantPrefix } from '@/lib/tenant'
import { QuickDistributionPanel } from './quick-distribution-panel'
import { QrDistributionPanel } from './qr-distribution-panel'
import {
  describeDistributedMaterials,
  ERROR_OVERLAY_TIMEOUT_MS,
  OVERLAY_TIMEOUT_MS,
  SCAN_COOLDOWN_MS,
  fetchBootstrapData,
  getScanFailureDescription,
  normalizeToken,
  summarizeDistributedMaterials,
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

type CameraOption = {
  id: string
  label: string
}

type ExtendedConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
  zoom?: number
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function StaffScanPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scannerRef = useRef<ScannerInstance | null>(null)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef = useRef(false)
  const isStartingRef = useRef(false)
  const lastScanRef = useRef<LastScanState>({ token: '', at: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bootstrappedCourseIdRef = useRef<number | null>(null)

  const [isFeatureLoading, setIsFeatureLoading] = useState(true)
  const [staffScanEnabled, setStaffScanEnabled] = useState(true)
  const [staffQuickEnabled, setStaffQuickEnabled] = useState(true)
  const [tab, setTab] = useState<TabMode>('qr')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [currentTime, setCurrentTime] = useState(new Date())
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
  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(currentTime).replace(/\s/g, '')
  const formattedTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const clearScannerContainer = useCallback(() => {
    const reader = document.getElementById('class-pass-qr-reader')
    if (reader) {
      reader.innerHTML = ''
    }
  }, [])

  const clearPendingSelection = useCallback(() => {
    setSelectOptions([])
    setPendingToken('')
  }, [])

  const parseCameraZoom = useCallback((label: string) => {
    const match = label.toLowerCase().match(/(\d+(?:\.\d+)?)\s*x\b/)
    if (!match) {
      return null
    }

    const zoom = Number(match[1])
    return Number.isFinite(zoom) ? zoom : null
  }, [])

  const getCameraPriority = useCallback((camera: CameraOption) => {
    const label = camera.label.trim().toLowerCase()
    const zoom = parseCameraZoom(label)
    let score = 0

    if (!label) {
      return -50
    }

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
  }, [parseCameraZoom])

  const getRankedCameraTargets = useCallback((cameras: CameraOption[]) => {
    const withLabels = cameras.filter((camera) => camera.label.trim())
    const ranked = [...withLabels].sort((left, right) => {
      const priorityDiff = getCameraPriority(right) - getCameraPriority(left)
      if (priorityDiff !== 0) {
        return priorityDiff
      }

      return left.label.localeCompare(right.label)
    })

    return ranked.map((camera) => camera.id)
  }, [getCameraPriority])

  const optimizeRunningCamera = useCallback(async (scanner: ScannerInstance) => {
    if (!scanner.applyVideoConstraints) {
      return
    }

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
      // Camera tuning failures are non-fatal.
    }
  }, [])

  const optimizeScannerVideo = useCallback(() => {
    const video = document.querySelector('#class-pass-qr-reader video') as HTMLVideoElement | null
    if (!video) {
      return
    }

    video.muted = true
    video.setAttribute('muted', 'true')
    video.setAttribute('autoplay', 'true')
    video.setAttribute('playsinline', 'true')
    void video.play().catch(() => {})
  }, [])

  const isPermissionDeniedError = useCallback((error: unknown) => {
    const message = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''

    return (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError'))
      || message.includes('Permission denied')
      || message.includes('NotAllowedError')
      || message.includes('SecurityError')
  }, [])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    isStartingRef.current = false

    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }

    processingRef.current = false

    if (!scanner) {
      clearScannerContainer()
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

    clearScannerContainer()
  }, [clearScannerContainer])

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

      if (!selectedCourseId) {
        setError('강좌를 먼저 선택해 주세요.')
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
          body: JSON.stringify({ token, courseId: selectedCourseId }),
        })
        const payload = (await response.json().catch(() => null)) as ScanResponse | null

        const studentName = payload?.studentName ?? ''
        if (studentName) {
          setLastStudentName(studentName)
        }

        if (response.ok && payload?.success) {
          const distributedMaterials = payload.distributedMaterials ?? []
          const distributedSummary = describeDistributedMaterials(distributedMaterials)

          showOverlay(
            {
              success: true,
              title: summarizeDistributedMaterials(distributedMaterials.length > 0
                ? distributedMaterials
                : payload?.materialName
                  ? [{ name: payload.materialName, material_type: payload.materialType }]
                  : []),
              description: studentName
                ? [studentName, distributedSummary].filter(Boolean).join(' · ')
                : distributedSummary,
            },
            OVERLAY_TIMEOUT_MS,
          )
          return
        }

        if (payload?.needsSelection && payload.unreceived?.length) {
          setSelectOptions(payload.unreceived)
          setScanState('selecting')
          processingRef.current = true
          return
        }

        if (payload?.distributedMaterials?.length) {
          showOverlay(
            {
              success: false,
              title: '일부 자료만 배부되었습니다.',
              description: [payload.studentName, describeDistributedMaterials(payload.distributedMaterials)]
                .filter(Boolean)
                .join(' · '),
            },
            ERROR_OVERLAY_TIMEOUT_MS,
          )
          return
        }

        showOverlay(
          {
            success: false,
            title: payload?.reason === 'COURSE_MISMATCH' ? '다른 강좌 QR입니다.' : '스캔을 완료하지 못했습니다.',
            description: getScanFailureDescription(payload),
          },
          ERROR_OVERLAY_TIMEOUT_MS,
        )
      } catch {
        processingRef.current = false
        setScanState('scanning')
        setError('스캔 요청에 실패했습니다. 다시 시도해 주세요.')
      }
    },
    [selectedCourseId, showOverlay],
  )

  const startScanner = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    if (scannerRef.current) {
      return
    }

    if (isStartingRef.current) {
      return
    }

    const readinessError = await getCameraReadinessError()
    if (readinessError) {
      setScanState('idle')
      setError(readinessError)
      return
    }

    isStartingRef.current = true
    setScanState('scanning')
    processingRef.current = false
    setError('')

    try {
      const qrModule = (await import('html5-qrcode')) as {
        Html5Qrcode: {
          new (
            elementId: string,
            config?: {
              verbose?: boolean
              formatsToSupport?: number[]
            },
          ): ScannerInstance
          getCameras: () => Promise<CameraOption[]>
        }
        Html5QrcodeSupportedFormats: {
          QR_CODE: number
        }
      }

      const boxSize = Math.max(180, Math.min((containerRef.current?.offsetWidth ?? 300) - 40, 260))
      const config = {
        fps: 10,
        qrbox: { width: boxSize, height: boxSize },
        aspectRatio: 1,
      }
      const onSuccess = (decodedText: string) => void handleScan(decodedText)
      const createScanner = () =>
        new qrModule.Html5Qrcode('class-pass-qr-reader', {
          verbose: false,
          formatsToSupport: [qrModule.Html5QrcodeSupportedFormats.QR_CODE],
        })

      const targets: Array<string | { facingMode: 'environment' | { exact: 'environment' } }> = []

      try {
        const cameras = await qrModule.Html5Qrcode.getCameras()
        targets.push(...getRankedCameraTargets(cameras))
      } catch (cameraListError) {
        if (isPermissionDeniedError(cameraListError)) {
          throw cameraListError
        }
      }

      targets.push({ facingMode: { exact: 'environment' } })
      targets.push({ facingMode: 'environment' })

      let lastError: unknown = null

      for (const target of targets) {
        clearScannerContainer()
        const scanner = createScanner()

        try {
          await scanner.start(target, config, onSuccess)
          scannerRef.current = scanner
          await optimizeRunningCamera(scanner)
          optimizeScannerVideo()
          return
        } catch (startError) {
          lastError = startError

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
        try {
          const cameras = await qrModule.Html5Qrcode.getCameras()
          const fallbackTargets = cameras.map((camera) => camera.id).filter(Boolean)

          for (const target of fallbackTargets) {
            clearScannerContainer()
            const scanner = createScanner()

            try {
              await scanner.start(target, config, onSuccess)
              scannerRef.current = scanner
              await optimizeRunningCamera(scanner)
              optimizeScannerVideo()
              return
            } catch (startError) {
              lastError = startError

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
        } catch (cameraListError) {
          lastError = cameraListError
        }
      }

      throw lastError ?? new Error('camera-start-failed')
    } catch (cameraError) {
      clearScannerContainer()
      scannerRef.current = null
      setScanState('idle')
      setError(getCameraAccessErrorMessage(cameraError))
    } finally {
      isStartingRef.current = false
    }
  }, [
    clearScannerContainer,
    getRankedCameraTargets,
    handleScan,
    isPermissionDeniedError,
    optimizeRunningCamera,
    optimizeScannerVideo,
  ])

  const handleCancelSelection = useCallback(() => {
    processingRef.current = false
    setScanState('scanning')
    clearPendingSelection()
  }, [clearPendingSelection])

  // 한 번 QR 스캔 후 표시되는 자료 목록에서 자료 1개를 터치할 때.
  // - 그 1건만 즉시 배부
  // - selectOptions에서 해당 ID만 제거 (목록 유지)
  // - 남은 자료가 있으면 패널 유지 + 작은 안내 메시지로 진행 표시
  // - 모두 배부 끝나면 success overlay + 카메라 스캔 모드 복귀
  // - 동시 배부 충돌 등으로 API가 unreceived 갱신 응답을 주면 새 목록으로 교체
  const handleDistributeOne = useCallback(async (materialId: number) => {
    if (!pendingToken || !selectedCourseId) {
      setError('강좌를 먼저 선택해 주세요.')
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
          courseId: selectedCourseId,
          materialId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as ScanResponse | null

      // 실패: 동시 배부로 인해 unreceived 갱신 요청이 오면 목록만 교체하고 사용자가 다시 고르도록
      if (response.ok && payload?.needsSelection && Array.isArray(payload.unreceived)) {
        setSelectOptions(payload.unreceived)
        processingRef.current = false
        setScanState('selecting')
        setError('다른 직원이 먼저 배부했을 수 있습니다. 갱신된 목록에서 다시 선택해 주세요.')
        return
      }

      if (!response.ok || !payload?.success) {
        processingRef.current = false
        setScanState('selecting')
        setError(getScanFailureDescription(payload) || '배부에 실패했습니다.')
        return
      }

      // success — 응답의 distributedMaterials 우선, 없으면 단건 materialId fallback
      const distributedMaterials = payload.distributedMaterials ?? []
      const distributedIdSet = new Set<number>(distributedMaterials.map((material) => material.id))
      if (distributedIdSet.size === 0) {
        distributedIdSet.add(materialId)
      }

      const remaining = selectOptions.filter((material) => !distributedIdSet.has(material.id))

      // 안내 메시지·overlay에 쓸 자료 라벨용 배열 — 응답이 부실해도 1건 표시 보장
      const labelMaterials: Array<{ id?: number; name: string; material_type?: 'handout' | 'textbook' }> =
        distributedMaterials.length > 0
          ? distributedMaterials
          : [{
              id: materialId,
              name: payload.materialName || '자료',
              material_type: payload.materialType,
            }]

      const studentName = payload.studentName || lastStudentName || '학생'

      if (remaining.length > 0) {
        // 남은 자료 있음 → 패널 유지, 작은 안내 메시지만 표시
        setSelectOptions(remaining)
        processingRef.current = false
        setScanState('selecting')

        const distributedSummary = describeDistributedMaterials(labelMaterials) ?? '자료 배부'
        setMessage(`${studentName} · ${distributedSummary} 배부 완료 · 남은 자료 ${remaining.length}건`)

        try { navigator.vibrate?.(35) } catch { /* vibration not supported */ }
        return
      }

      // 모두 배부됨 → success overlay + 카메라 모드 복귀
      setSelectOptions([])
      setPendingToken('')
      setMessage('')

      showOverlay(
        {
          success: true,
          title: summarizeDistributedMaterials(labelMaterials),
          description: [studentName, describeDistributedMaterials(labelMaterials)]
            .filter(Boolean)
            .join(' · '),
        },
        OVERLAY_TIMEOUT_MS,
      )
    } catch {
      processingRef.current = false
      setScanState('selecting')
      setError('배부 요청에 실패했습니다. 다시 시도해 주세요.')
    }
  }, [pendingToken, selectedCourseId, selectOptions, lastStudentName, showOverlay])

  const handleDistributeAllSelected = useCallback(async () => {
    if (!pendingToken || !selectedCourseId) {
      setError('강좌를 먼저 선택해 주세요.')
      return
    }

    const materialIds = selectOptions.map((material) => material.id)
    if (materialIds.length === 0) {
      return
    }

    processingRef.current = true
    setScanState('processing')
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/distribution/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pendingToken,
          courseId: selectedCourseId,
          materialIds,
        }),
      })
      const payload = (await response.json().catch(() => null)) as ScanResponse | null

      if (response.ok && payload?.needsSelection && Array.isArray(payload.unreceived)) {
        setSelectOptions(payload.unreceived)
        processingRef.current = false
        setScanState('selecting')
        setError('다른 직원이 먼저 배부했을 수 있습니다. 갱신된 목록에서 다시 선택해 주세요.')
        return
      }

      const distributedMaterials = payload?.distributedMaterials ?? []
      const distributedIdSet = new Set<number>(distributedMaterials.map((material) => material.id))

      if (!response.ok || !payload?.success) {
        if (distributedIdSet.size > 0) {
          const remaining = selectOptions.filter((material) => !distributedIdSet.has(material.id))
          setSelectOptions(remaining)
          processingRef.current = false
          setScanState(remaining.length > 0 ? 'selecting' : 'scanning')
          setError(
            `일부 자료만 배부되었습니다. ${describeDistributedMaterials(distributedMaterials) ?? ''}`.trim(),
          )
          return
        }

        processingRef.current = false
        setScanState('selecting')
        setError(getScanFailureDescription(payload) || '전체 배부에 실패했습니다.')
        return
      }

      const labelMaterials = distributedMaterials.length > 0
        ? distributedMaterials
        : selectOptions

      const studentName = payload.studentName || lastStudentName || '학생'

      setSelectOptions([])
      setPendingToken('')
      setMessage('')

      showOverlay(
        {
          success: true,
          title: summarizeDistributedMaterials(labelMaterials),
          description: [studentName, describeDistributedMaterials(labelMaterials)]
            .filter(Boolean)
            .join(' · '),
        },
        OVERLAY_TIMEOUT_MS,
      )
    } catch {
      processingRef.current = false
      setScanState('selecting')
      setError('전체 배부 요청에 실패했습니다. 다시 시도해 주세요.')
    }
  }, [pendingToken, selectedCourseId, selectOptions, lastStudentName, showOverlay])

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
        if (payload?.distributed_materials?.length) {
          setError(
            `일부 자료만 배부되었습니다. ${describeDistributedMaterials(payload.distributed_materials) ?? ''}`.trim(),
          )
          return
        }

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

      const distributedMaterials = payload?.distributed_materials ?? []
      setMessage([
        payload?.student_name ?? '수강생',
        summarizeDistributedMaterials(distributedMaterials.length > 0
          ? distributedMaterials
          : payload?.material_name
            ? [{ name: payload.material_name, material_type: payload.material_type }]
            : []),
      ].join(' · '))
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
        setStaffQuickEnabled(data.staffQuickEnabled)
        setTab(data.staffScanEnabled ? 'qr' : data.staffQuickEnabled ? 'quick' : 'qr')
        setCourses(data.courses)
        setCourseMaterials(data.materials)
        setQuickMaterials([])
        bootstrappedCourseIdRef.current = data.selectedCourseId
        setSelectedCourseId(data.selectedCourseId)
        setSelectedMaterialId(null)
        clearPendingSelection()
        setQuickStudentName('')
        setLastStudentName('')
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
  }, [clearPendingSelection, stopScanner])

  useEffect(() => {
    if (!selectedCourseId) {
      bootstrappedCourseIdRef.current = null
      setCourseMaterials([])
      setQuickMaterials([])
      setSelectedMaterialId(null)
      clearPendingSelection()
      setQuickStudentName('')
      setLastStudentName('')
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

        setStaffScanEnabled(data.staffScanEnabled)
        setStaffQuickEnabled(data.staffQuickEnabled)
        setCourses(data.courses)
        setCourseMaterials(data.materials)
        setQuickMaterials([])
        setSelectedMaterialId(null)
        clearPendingSelection()
        setQuickStudentName('')
        setLastStudentName('')
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '이 강좌의 자료를 불러오지 못했습니다.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [clearPendingSelection, selectedCourseId])

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

  useEffect(() => {
    if (tab === 'qr' && !staffScanEnabled && staffQuickEnabled) {
      setTab('quick')
      return
    }

    if (tab === 'quick' && !staffQuickEnabled && staffScanEnabled) {
      setTab('qr')
    }
  }, [staffQuickEnabled, staffScanEnabled, tab])

  const sessionLabel = session
    ? session.role === 'admin'
      ? `관리자 ${session.adminId ?? ''}`.trim()
      : '직원 세션'
    : '직원 도구'

  if (isFeatureLoading) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">직원 화면을 준비하는 중입니다.</p>
          <p className="student-body mt-3">강좌와 배부 설정을 불러오고 있습니다.</p>
        </div>
      </div>
    )
  }

  if (!staffScanEnabled && !staffQuickEnabled) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">직원 배부 기능이 현재 비활성화되어 있습니다.</p>
          <p className="student-body mt-3">관리자 설정에서 QR 스캔과 수동 배부가 모두 꺼져 있습니다. 설정을 확인한 뒤 다시 접속해 주세요.</p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="student-pill-button student-pill-primary mt-6 w-full"
          >
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="student-page student-safe-bottom flex min-h-dvh flex-col">
      <section className="student-hero px-4 pb-6 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`student-status-dot ${tab === 'qr' ? 'student-status-dot-active' : 'student-status-dot-idle'}`} />
            <span className="text-[13px] font-semibold tracking-[-0.02em] text-white/72">{sessionLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="text-[13px] font-semibold tracking-[-0.02em] text-white/72 transition-opacity hover:text-white"
          >
            로그아웃
          </button>
        </div>

        <div className="mt-5 text-center">
          <p className="student-eyebrow student-eyebrow-dark">
            {tab === 'qr' ? '현장 QR 스캔' : '수동 배부'}
          </p>
          <h1 className="student-display mt-2 break-keep">{selectedCourseName ?? '현장 배부 센터'}</h1>
          <p className="student-body student-body-dark mt-2">
            {formattedDate} ({DAY_NAMES[currentTime.getDay()]}) {formattedTime}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="student-chip student-chip-dark">{tab === 'qr' ? 'QR 스캔' : '수동 배부'}</span>
          <span className="student-chip student-chip-dark">{materialsCount}건 자료</span>
          {selectedCourseName ? (
            <span className="student-chip student-chip-dark">강좌 선택됨</span>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <p className="student-eyebrow student-eyebrow-light">오류</p>
          <p className="mt-2 text-[14px] font-medium text-[#b42318]">{error}</p>
        </section>
      ) : null}

      {message ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <p className="student-eyebrow student-eyebrow-light">안내</p>
          <p className="mt-2 text-[14px] font-medium text-[#19703a]">{message}</p>
        </section>
      ) : null}

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <h2 className="student-eyebrow student-eyebrow-light mb-3">운영 설정</h2>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-[var(--student-text-muted)]">강좌 선택</span>
          <select
            value={selectedCourseId ?? ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const nextCourseId = event.target.value ? Number(event.target.value) : null
              setCourseMaterials([])
              setQuickMaterials([])
              setSelectedMaterialId(null)
              clearPendingSelection()
              setQuickStudentName('')
              setLastStudentName('')
              setSelectedCourseId(nextCourseId)
            }}
            className="student-input appearance-none"
          >
            <option value="">강좌를 선택하세요</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('qr')
              clearPendingSelection()
            }}
            disabled={!staffScanEnabled}
            className={`student-pill-button flex-1 ${
              tab === 'qr' ? 'student-pill-primary' : 'student-pill-secondary'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            QR 스캔
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('quick')
              clearPendingSelection()
            }}
            disabled={!staffQuickEnabled}
            className={`student-pill-button flex-1 ${
              tab === 'quick' ? 'student-pill-primary' : 'student-pill-secondary'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            수동 배부
          </button>
        </div>
      </section>

      {tab === 'qr' ? (
        <QrDistributionPanel
          staffScanEnabled={staffScanEnabled}
          scanState={scanState}
          overlay={overlay}
          lastStudentName={lastStudentName}
          selectedCourseName={selectedCourseName}
          selectOptions={selectOptions}
          containerRef={containerRef}
          onRestartScanner={() => {
            setError('')
            void stopScanner().then(() => startScanner())
          }}
          onDistributeMaterial={(materialId) => {
            void handleDistributeOne(materialId)
          }}
          onDistributeAllMaterials={() => {
            void handleDistributeAllSelected()
          }}
          onCancelSelection={handleCancelSelection}
        />
      ) : (
        <QuickDistributionPanel
          quickPhone={quickPhone}
          quickStudentName={quickStudentName}
          quickLoading={quickLoading}
          quickMaterials={quickMaterials}
          selectedMaterialId={selectedMaterialId}
          selectedCourseName={selectedCourseName}
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
  )
}
