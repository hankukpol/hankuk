'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useTenantConfig } from '@/components/TenantProvider'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import type { Material, Student } from '@/types/database'
import { formatKoreanDate } from '@/lib/utils'

type PopupContent = {
  title: string
  body: string
  active: boolean
}

type ReceiptFeatures = {
  receiptPortalEnabled: boolean
  receiptQrEnabled: boolean
  receiptMaterialsEnabled: boolean
}

type ReceiptData = {
  student: Student
  materials: Material[]
  receipts: Record<number, string>
  token: string
  appName: string
  features: ReceiptFeatures
  popups: {
    notice: PopupContent
    refund: PopupContent
  }
}

type PopupKey = 'notice' | 'refund'
type ModalState = PopupKey | 'back-confirm' | null

const POLL_INTERVAL = 10000
const NEW_RECEIPT_HIGHLIGHT_MS = 2000

function isStudent(value: unknown): value is Student {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.phone === 'string'
  )
}

function buildDefaultReceiptData(student: Student, token: string, appName: string): ReceiptData {
  return {
    student,
    materials: [],
    receipts: {},
    token,
    appName,
    features: {
      receiptPortalEnabled: true,
      receiptQrEnabled: true,
      receiptMaterialsEnabled: true,
    },
    popups: {
      notice: { title: '공지사항', body: '', active: false },
      refund: { title: '환불 규정', body: '', active: false },
    },
  }
}

function toPopupContent(
  row: { title?: string; body?: string; is_active?: boolean } | undefined,
  fallbackTitle: string,
): PopupContent {
  return {
    title: row?.title ?? fallbackTitle,
    body: row?.body ?? '',
    active: row?.is_active ?? false,
  }
}

export default function ReceiptPage() {
  const tenant = useTenantConfig()
  const defaultAppName = tenant.defaultAppName
  const router = useRouter()
  const [configReady, setConfigReady] = useState(false)
  const [data, setData] = useState<ReceiptData | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [dateStr, setDateStr] = useState('')
  const [newlyReceived, setNewlyReceived] = useState<Set<number>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevReceiptsRef = useRef<Record<number, string>>({})
  const studentIdRef = useRef('')
  const isPollingRef = useRef(false)

  const fetchReceipts = useCallback(async () => {
    if (!studentIdRef.current || isPollingRef.current) {
      return
    }

    isPollingRef.current = true

    try {
      const response = await fetch(`/api/students/${studentIdRef.current}/receipts`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          sessionStorage.clear()
          router.replace('/')
        }
        return
      }

      const payload = (await response.json().catch(() => null)) as
        | { receipts?: Record<number, string> }
        | null
      const nextReceipts = payload?.receipts ?? {}
      const previousReceipts = prevReceiptsRef.current
      const addedIds = Object.keys(nextReceipts)
        .map((key) => Number(key))
        .filter((materialId) => !previousReceipts[materialId])

      if (addedIds.length > 0) {
        setNewlyReceived((current) => new Set([...current, ...addedIds]))

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([100, 50, 100])
        }

        setTimeout(() => {
          setNewlyReceived((current) => {
            const next = new Set(current)
            addedIds.forEach((materialId) => next.delete(materialId))
            return next
          })
        }, NEW_RECEIPT_HIGHLIGHT_MS)
      }

      prevReceiptsRef.current = nextReceipts
      setData((current) => (current ? { ...current, receipts: nextReceipts } : current))
    } finally {
      isPollingRef.current = false
    }
  }, [router])

  useEffect(() => {
    let cancelled = false

    const token = sessionStorage.getItem('qr_token')
    const rawStudent = sessionStorage.getItem('student')

    if (!token || !rawStudent) {
      router.replace('/')
      return
    }

    const sessionToken = token

    let student: Student
    try {
      const parsed = JSON.parse(rawStudent)
      if (!isStudent(parsed)) {
        router.replace('/')
        return
      }
      student = parsed
    } catch {
      router.replace('/')
      return
    }

    studentIdRef.current = student.id

    async function load() {
      try {
        const appConfig = (await fetch('/api/config/app', { cache: 'no-store' })
          .then((response) => response.json())
          .catch(() => null)) as
          | {
              app_name?: string
              student_receipt_enabled?: boolean
              receipt_qr_enabled?: boolean
              receipt_materials_enabled?: boolean
            }
          | null

        if (cancelled) {
          return
        }

        const appName = appConfig?.app_name ?? defaultAppName
        const receiptPortalEnabled = appConfig?.student_receipt_enabled ?? true

        if (!receiptPortalEnabled) {
          const disabledData = buildDefaultReceiptData(student, sessionToken, appName)
          disabledData.features.receiptPortalEnabled = false
          setData(disabledData)
          setConfigReady(true)
          return
        }

        const [materialsResponse, receiptsResponse, popupsResponse] = await Promise.all([
          fetch('/api/materials', { cache: 'no-store' }),
          fetch(`/api/students/${student.id}/receipts`, { cache: 'no-store' }),
          fetch('/api/config/popups', { cache: 'no-store' }),
        ])

        if (receiptsResponse.status === 403 || receiptsResponse.status === 404) {
          sessionStorage.clear()
          router.replace('/')
          return
        }

        if (!materialsResponse.ok || !receiptsResponse.ok || !popupsResponse.ok) {
          throw new Error('수령 데이터를 불러오지 못했습니다.')
        }

        const materialsPayload = (await materialsResponse.json().catch(() => null)) as
          | { materials?: Material[] }
          | null
        const receiptsPayload = (await receiptsResponse.json().catch(() => null)) as
          | { receipts?: Record<number, string> }
          | null
        const popupRows = (await popupsResponse.json().catch(() => null)) as
          | Array<{
              popup_key: string
              title?: string
              body?: string
              is_active?: boolean
            }>
          | null

        if (cancelled) {
          return
        }

        const rows = Array.isArray(popupRows) ? popupRows : []
        const noticeRow = rows.find((row) => row.popup_key === 'notice')
        const refundRow = rows.find((row) => row.popup_key === 'refund_policy')
        const receipts = receiptsPayload?.receipts ?? {}

        prevReceiptsRef.current = receipts
        setData({
          student,
          materials: materialsPayload?.materials ?? [],
          receipts,
          token: sessionToken,
          appName,
          features: {
            receiptPortalEnabled: true,
            receiptQrEnabled: appConfig?.receipt_qr_enabled ?? true,
            receiptMaterialsEnabled: appConfig?.receipt_materials_enabled ?? true,
          },
          popups: {
            notice: toPopupContent(noticeRow, '공지사항'),
            refund: toPopupContent(refundRow, '환불 규정'),
          },
        })
        setConfigReady(true)

        if (noticeRow?.is_active) {
          setModal('notice')
        }

        const updateDate = () => setDateStr(formatKoreanDate())
        updateDate()
        timerRef.current = setInterval(updateDate, 60000)
        pollRef.current = setInterval(() => {
          void fetchReceipts()
        }, POLL_INTERVAL)
      } catch {
        if (!cancelled) {
          setFetchError(true)
          setConfigReady(true)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [defaultAppName, fetchReceipts, router])

  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [modal])

  function resetStudentSession() {
    sessionStorage.clear()
    router.push('/')
  }

  if (fetchError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-gray-500">
          수령 데이터를 불러오지 못했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={() => {
            setFetchError(false)
            window.location.reload()
          }}
          className="px-6 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--theme)' }}
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (!configReady || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-900 border-t-transparent" />
      </div>
    )
  }

  if (!data.features.receiptPortalEnabled) {
    return (
      <FeatureDisabledPanel
        fullPage
        title="수령 포털이 꺼져 있습니다."
        description="이 지점에서는 학생 수령 포털이 비활성화되어 있습니다. 처음 화면으로 돌아가 다시 시도해 주세요."
        action={
          <button
            type="button"
            onClick={resetStudentSession}
            className="inline-flex rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            처음 화면으로 돌아가기
          </button>
        }
      />
    )
  }

  const { student, materials, receipts, token } = data
  const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/scan?token=${encodeURIComponent(token)}`
  const activeMaterials = materials.filter((material) => material.is_active)
  const receivedCount = activeMaterials.filter((material) => Boolean(receipts[material.id])).length
  const allReceived = activeMaterials.length > 0 && receivedCount === activeMaterials.length
  const nextMaterialId = activeMaterials.find((material) => !receipts[material.id])?.id

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-4 py-5 text-center text-white" style={{ background: 'var(--theme)' }}>
        <h1 className="whitespace-pre-wrap text-xl font-bold">
          {(data.appName || '').split(/<br\s*\/?>/i).map((line, index, array) => (
            <span key={index}>
              {line}
              {index < array.length - 1 && <br />}
            </span>
          ))}
        </h1>
        <p className="mt-1 text-sm text-white/80">{dateStr}</p>
      </div>

      <section className="border-t border-gray-100 p-4">
        <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--theme)' }}>
          학생 정보
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {tenant.receiptFields
              .map(([label, getter]) => [label, getter(student)] as const)
              .map(([label, value]) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="w-24 py-2 pr-4 text-gray-500">{label}</td>
                  <td className="py-2 font-medium text-gray-900">{value}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {data.features.receiptQrEnabled ? (
        <section className="border-t border-gray-100 p-4 text-center">
          <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--theme)' }}>
            개인 QR 코드
          </h2>
          <div className="mb-2 inline-block border-2 border-gray-100 p-3">
            <QRCodeSVG value={qrUrl} size={220} level="M" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--theme)' }}>
            자료를 받을 때 직원에게 이 QR 코드를 보여 주세요.
          </p>
        </section>
      ) : (
        <section className="border-t border-gray-100 p-4">
          <div className="border border-amber-200 bg-amber-50 px-4 py-4 text-center">
            <p className="text-sm font-bold text-amber-900">수령 QR이 꺼져 있습니다.</p>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              이 지점에서는 학생 수령 페이지의 QR 표시를 비활성화했습니다.
            </p>
          </div>
        </section>
      )}

      {data.features.receiptMaterialsEnabled ? (
        <section className="border-t border-gray-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: 'var(--theme)' }}>
              자료 수령 현황
            </h2>
            {activeMaterials.length > 0 ? (
              <span
                className={`px-2 py-0.5 text-xs font-bold ${
                  allReceived ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {receivedCount} / {activeMaterials.length} 수령
              </span>
            ) : null}
          </div>

          {allReceived ? (
            <div className="mb-3 flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3">
              <span className="text-base text-green-700">완료</span>
              <span className="text-sm font-bold text-green-800">
                신청 자료를 모두 수령했습니다.
              </span>
            </div>
          ) : null}

          {activeMaterials.length === 0 ? (
            <p className="py-2 text-sm text-gray-400">현재 수령할 수 있는 활성 자료가 없습니다.</p>
          ) : null}

          <ul className="flex flex-col gap-1">
            {activeMaterials.map((material) => {
              const received = Boolean(receipts[material.id])
              const isNext = material.id === nextMaterialId
              const isNew = newlyReceived.has(material.id)

              return (
                <li
                  key={material.id}
                  className={`flex items-center gap-3 px-2 py-2 transition-colors duration-500 ${
                    isNew ? 'bg-green-50' : isNext ? 'bg-blue-50' : ''
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[10px] font-bold transition-all duration-500 ${
                      received ? 'border-green-700 bg-green-700 text-white' : 'border-gray-300'
                    } ${isNew ? 'scale-125' : ''}`}
                  >
                    {received ? '완료' : ''}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      isNext ? 'font-bold text-blue-900 underline' : 'text-gray-700'
                    }`}
                  >
                    {material.name}
                  </span>
                  <span className="ml-auto text-xs">
                    {received ? (
                      <span className="font-medium text-green-700">{receipts[material.id]}</span>
                    ) : isNext ? (
                      <span className="text-gray-400">다음 수령 대상</span>
                    ) : (
                      <span className="text-gray-300">대기 중</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <section className="border-t border-gray-100 p-4">
          <div className="border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-sm font-bold text-gray-900">수령 현황이 꺼져 있습니다.</p>
            <p className="mt-2 text-xs leading-5 text-gray-600">
              이 지점에서는 자료 수령 현황 목록을 숨겼습니다.
            </p>
          </div>
        </section>
      )}

      <div className="mt-auto flex gap-3 px-4 pb-2">
        {data.popups.notice.active ? (
          <button
            onClick={() => setModal('notice')}
            className="flex-1 py-3 text-sm font-medium"
            style={{ background: '#e8eaf6', color: 'var(--theme)' }}
          >
            공지사항
          </button>
        ) : null}
        {data.popups.refund.active ? (
          <button
            onClick={() => setModal('refund')}
            className="flex-1 py-3 text-sm font-medium"
            style={{ background: '#e8eaf6', color: 'var(--theme)' }}
          >
            환불 규정
          </button>
        ) : null}
      </div>

      <div className="px-4 pb-6">
        <button
          onClick={() => setModal('back-confirm')}
          className="w-full border border-gray-200 py-3 text-sm text-gray-500"
        >
          처음 화면으로 돌아가기
        </button>
      </div>

      {modal === 'back-confirm' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
          onClick={() => setModal(null)}
        >
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-5">
              <p className="mb-1 text-base font-bold text-gray-800">
                처음 화면으로 돌아가시겠습니까?
              </p>
              <p className="text-sm text-gray-500">
                현재 수령 세션 정보가 초기화됩니다.
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setModal(null)}
                className="flex-1 border-r border-gray-100 py-3 text-sm text-gray-500"
              >
                취소
              </button>
              <button
                onClick={resetStudentSession}
                className="flex-1 py-3 text-sm font-medium text-white"
                style={{ background: 'var(--theme)' }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === 'notice' || modal === 'refund' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
          onClick={() => setModal(null)}
        >
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden bg-white"
            style={{ maxHeight: '80dvh' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <span className="text-base font-bold" style={{ color: 'var(--theme)' }}>
                {modal === 'notice' ? data.popups.notice.title : data.popups.refund.title}
              </span>
              <button
                onClick={() => setModal(null)}
                className="flex h-8 w-8 items-center justify-center text-lg text-gray-400 hover:bg-gray-100"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-gray-700">
              {modal === 'notice' ? data.popups.notice.body : data.popups.refund.body}
            </div>
            <div className="border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => setModal(null)}
                className="w-full py-2.5 text-sm font-medium text-white"
                style={{ background: 'var(--theme)' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
