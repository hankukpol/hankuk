'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ExamDeliveryPassView } from '@/components/student/ExamDeliveryPassView'
import { useTenantConfig } from '@/components/TenantProvider'
import type { PassPayload } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'

function formatReceiptTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function calculateDday(targetDate: string | null) {
  if (!targetDate) return null
  const target = new Date(targetDate)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'D-Day'
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}

export default function StudentCoursePassPage() {
  const tenant = useTenantConfig()
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<PassPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [backConfirmOpen, setBackConfirmOpen] = useState(false)
  const prevReceiptCountRef = useRef(0)

  const enrollmentId = Number(searchParams.get('enrollmentId'))

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (data && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      if (!data.course.feature_exam_delivery_mode && data.course.feature_notices && data.course.notice_visible && data.course.notice_content) {
        setNoticeOpen(true)
      }
    }
  }, [data])

  useEffect(() => {
    const name = sessionStorage.getItem(LS_NAME) ?? ''
    const phone = sessionStorage.getItem(LS_PHONE) ?? ''

    if (!name || !phone || !Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      router.replace(withTenantPrefix('/', tenant.type))
      return
    }

    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function load(): Promise<PassPayload> {
      const response = await fetch(withTenantPrefix('/api/enrollments/pass', tenant.type), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, courseSlug: params.courseSlug, name, phone }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? '수강증 정보를 불러오지 못했습니다.')
      if (!cancelled) setData(payload as PassPayload)
      return payload as PassPayload
    }

    async function pollReceipts() {
      const response = await fetch(
        withTenantPrefix(
          `/api/enrollments/${enrollmentId}/receipts?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`,
          tenant.type,
        ),
        { cache: 'no-store' },
      )
      const payload = await response.json().catch(() => null)
      if (response.ok && !cancelled) {
        const newReceipts = payload.receipts ?? {}
        if (Object.keys(newReceipts).length > prevReceiptCountRef.current && prevReceiptCountRef.current > 0) {
          try {
            navigator.vibrate?.([100, 50, 100])
          } catch {
            // optional
          }
        }
        prevReceiptCountRef.current = Object.keys(newReceipts).length
        setData((current) => (current ? { ...current, receipts: newReceipts } : current))
      }
    }

    load()
      .then((passData) => {
        if (!cancelled && passData) {
          setLoading(false)
          prevReceiptCountRef.current = Object.keys(passData.receipts).length
          if (passData.course.feature_qr_distribution) {
            pollTimer = setInterval(() => {
              void pollReceipts()
            }, 10_000)
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '수강증 정보를 불러오지 못했습니다.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  const courseTheme = data?.course.theme_color ?? data?.appConfig.theme_color ?? 'var(--theme)'
  const dday = useMemo(() => calculateDday(data?.course.target_date ?? null), [data?.course.target_date])
  const qrValue = useMemo(() => {
    if (!data?.qrToken || typeof window === 'undefined') return data?.qrToken ?? ''
    return `${window.location.origin}${withTenantPrefix(`/scan?token=${encodeURIComponent(data.qrToken)}`, tenant.type)}`
  }, [data?.qrToken, tenant.type])

  const formattedTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime)

  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(currentTime)

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  const isOutsideTimeWindow = useMemo(() => {
    if (!data?.course.feature_time_window || !data.course.time_window_start || !data.course.time_window_end) return false
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(currentTime)
    return now < data.course.time_window_start || now > data.course.time_window_end
  }, [currentTime, data?.course.feature_time_window, data?.course.time_window_start, data?.course.time_window_end])

  function goBack() {
    router.push(withTenantPrefix('/courses', tenant.type))
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-900 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-gray-500">{error || '수강증 정보를 불러오지 못했습니다.'}</p>
        <button onClick={goBack} className="px-6 py-2 text-sm font-medium text-white" style={{ background: 'var(--theme)' }}>
          강좌 목록으로
        </button>
      </div>
    )
  }

  const isEnrollmentActive = data.enrollment.status === 'active'
  const examDeliveryStatus: 'eligible' | 'inactive' | 'closed' = !isEnrollmentActive
    ? 'inactive'
    : isOutsideTimeWindow
      ? 'closed'
      : 'eligible'

  if (data.course.feature_exam_delivery_mode) {
    return (
      <>
        <ExamDeliveryPassView
          data={data}
          currentTime={currentTime}
          courseTheme={courseTheme}
          tenantAppName={data.appConfig.app_name || tenant.defaultAppName}
          status={examDeliveryStatus}
          extraContent={data.designatedSeat.enabled ? <DesignatedSeatSummary data={data} courseTheme={courseTheme} /> : undefined}
          onBack={goBack}
          onOpenNotice={() => setNoticeOpen(true)}
          onOpenRefund={() => setRefundOpen(true)}
        />
        {noticeOpen && data.course.notice_content ? (
          <Modal title={data.course.notice_title || '공지사항'} onClose={() => setNoticeOpen(false)}>
            <p className="whitespace-pre-wrap">{data.course.notice_content}</p>
          </Modal>
        ) : null}
        {refundOpen && data.course.refund_policy ? (
          <Modal title="환불 규정" onClose={() => setRefundOpen(false)}>
            <p className="whitespace-pre-wrap">{data.course.refund_policy}</p>
          </Modal>
        ) : null}
      </>
    )
  }

  if (!isEnrollmentActive) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-base font-bold text-gray-900">현재 수강 가능한 상태가 아닙니다.</p>
        <p className="text-center text-sm text-gray-500">관리자에게 문의해 주세요.</p>
        <button onClick={goBack} className="px-6 py-2 text-sm font-medium text-white" style={{ background: 'var(--theme)' }}>
          강좌 목록으로
        </button>
      </div>
    )
  }

  if (isOutsideTimeWindow) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-base font-bold text-gray-900">입장 가능한 시간이 아닙니다.</p>
        <p className="mt-1 text-center text-sm text-gray-500">
          현재 {formattedTime} / 입장 가능 {data.course.time_window_start || '--:--'} ~ {data.course.time_window_end || '--:--'}
        </p>
        <button onClick={goBack} className="mt-2 px-6 py-2 text-sm font-medium text-white" style={{ background: courseTheme }}>
          강좌 목록으로
        </button>
      </div>
    )
  }

  const seatMap = new Map(data.seatAssignments.map((seat) => [seat.subject_id, seat.seat_number]))
  const showSeatAssignments = data.course.feature_seat_assignment || data.seatAssignments.length > 0
  const receiptCount = Object.keys(data.receipts).length
  const materialCount = data.materials.length
  const allReceived = materialCount > 0 && receiptCount === materialCount
  const nextMaterialId = data.materials.find((material) => !data.receipts[material.id])?.id

  const studentFields = [
    { label: '수험번호', value: data.enrollment.exam_number || '-' },
    { label: '이름', value: data.enrollment.name || '-' },
    { label: '연락처', value: data.enrollment.phone || '-' },
    ...(data.enrollment.region ? [{ label: '지역', value: data.enrollment.region }] : []),
    ...(data.enrollment.series ? [{ label: '계열', value: data.enrollment.series }] : []),
    ...(data.enrollment.gender ? [{ label: '성별', value: data.enrollment.gender }] : []),
    ...(data.course.enrollment_fields ?? []).map((field) => ({
      label: field.label,
      value: (data.enrollment.custom_data ?? {})[field.key] || '-',
    })),
    { label: '상태', value: data.enrollment.status === 'active' ? '수강 중' : '환불' },
  ]

  const hasPhoto = data.course.feature_photo && data.enrollment.photo_url
  const enrollmentPeriod = data.course.enrolled_from && data.course.enrolled_until
    ? `${data.course.enrolled_from.replace(/-/g, '.')} ~ ${data.course.enrolled_until.replace(/-/g, '.')}`
    : null

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="text-center text-white" style={{ background: courseTheme }}>
        <div className="flex items-center justify-between px-4 pt-5">
          <button onClick={goBack} className="text-sm text-white/80 hover:text-white">
            ← 목록
          </button>
          <div className="flex items-center gap-2">
            {dday ? <span className="bg-white/20 px-2 py-0.5 text-xs font-bold">{dday}</span> : null}
            <span className="text-xs text-white/70">{formatCourseTypeLabel(data.course.course_type)}</span>
          </div>
        </div>

        {hasPhoto ? (
          <div className="pb-16 pt-4">
            <p className="text-xs font-semibold text-white/70">{data.appConfig.app_name || '한국경찰학원'}</p>
            <h1 className="mt-1 text-xl font-bold">모바일 수강증</h1>
          </div>
        ) : (
          <div className="px-4 pb-5 pt-3">
            <h1 className="text-xl font-bold">{data.course.name}</h1>
            <p className="mt-1 text-sm text-white/80">
              {formattedDate} ({dayNames[currentTime.getDay()]}) {formattedTime}
            </p>
            {data.course.feature_time_window ? (
              <p className="mt-0.5 text-xs text-white/60">
                입장 가능 {data.course.time_window_start || '--:--'} ~ {data.course.time_window_end || '--:--'}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {hasPhoto ? (
        <div className="-mt-12 flex flex-col items-center pb-2">
          <div className="h-[120px] w-[120px] overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-lg">
            <Image
              src={data.enrollment.photo_url!}
              alt={`${data.enrollment.name} 사진`}
              width={240}
              height={240}
              unoptimized
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="mt-3 text-xl font-black text-gray-900">{data.enrollment.name}</h2>
          <p className="mt-0.5 text-lg font-bold text-gray-400">{data.enrollment.exam_number || '-'}</p>
        </div>
      ) : null}

      <section className="border-t border-gray-100 p-4">
        {hasPhoto ? (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="w-20 py-2 pr-3 text-gray-500">과정명</td>
                <td className="py-2 font-semibold text-gray-900">{data.course.name}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="w-20 py-2 pr-3 text-gray-500">수강일</td>
                <td className="py-2 font-medium text-gray-900">{formattedDate} ({dayNames[currentTime.getDay()]})</td>
              </tr>
              {enrollmentPeriod ? (
                <tr className="border-b border-gray-50">
                  <td className="w-20 py-2 pr-3 text-gray-500">수강기간</td>
                  <td className="py-2 font-medium text-gray-900">{enrollmentPeriod}</td>
                </tr>
              ) : null}
              <tr className="border-b border-gray-50">
                <td className="w-20 py-2 pr-3 text-gray-500">현재시간</td>
                <td className="py-2 font-bold" style={{ color: courseTheme }}>{formattedTime}</td>
              </tr>
              {data.enrollment.phone ? (
                <tr className="border-b border-gray-50">
                  <td className="w-20 py-2 pr-3 text-gray-500">연락처</td>
                  <td className="py-2 font-medium text-gray-900">{data.enrollment.phone}</td>
                </tr>
              ) : null}
              {(data.course.enrollment_fields ?? []).map((field) => {
                const value = (data.enrollment.custom_data ?? {})[field.key]
                return value ? (
                  <tr key={field.key} className="border-b border-gray-50">
                    <td className="w-20 py-2 pr-3 text-gray-500">{field.label}</td>
                    <td className="py-2 font-medium text-gray-900">{value}</td>
                  </tr>
                ) : null
              })}
              <tr className="last:border-0">
                <td className="w-20 py-2 pr-3 text-gray-500">상태</td>
                <td className="py-2 font-medium text-gray-900">{data.enrollment.status === 'active' ? '수강 중' : '환불'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>수강생 정보</h2>
            <div className="flex gap-4">
              {data.course.feature_photo ? (
                <div className="h-[120px] w-[90px] shrink-0 overflow-hidden bg-gray-100">
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">사진 없음</div>
                </div>
              ) : null}
              <table className="w-full text-sm">
                <tbody>
                  {studentFields.map(({ label, value }) => (
                    <tr key={label} className="border-b border-gray-50 last:border-0">
                      <td className="w-20 py-1.5 pr-3 text-gray-500">{label}</td>
                      <td className="py-1.5 font-medium text-gray-900">{value}</td>
                    </tr>
                  ))}
                  {enrollmentPeriod ? (
                    <tr className="border-b border-gray-50">
                      <td className="w-20 py-1.5 pr-3 text-gray-500">수강기간</td>
                      <td className="py-1.5 font-medium text-gray-900">{enrollmentPeriod}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {data.designatedSeat.enabled ? <DesignatedSeatSummary data={data} courseTheme={courseTheme} /> : null}

      {data.course.feature_qr_pass && data.qrToken ? (
        <section className="border-t border-gray-100 p-4 text-center">
          <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>개인 QR 코드</h2>
          <div
            className="mb-2 inline-flex rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            style={{ backgroundColor: '#ffffff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' }}
          >
            <div className="rounded-xl bg-white p-2" style={{ backgroundColor: '#ffffff' }}>
              <QRCodeSVG value={qrValue} size={220} level="M" includeMargin bgColor="#ffffff" fgColor="#111827" />
            </div>
          </div>
          <p className="text-sm font-medium" style={{ color: courseTheme }}>
            직원에게 이 QR 코드를 보여 주세요.
          </p>
        </section>
      ) : null}

      {showSeatAssignments ? (
        <section className="border-t border-gray-100 p-4">
          <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>
            좌석 배정 <span className="ml-1 text-xs font-normal text-gray-400">{data.subjects.length}과목</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.subjects.map((subject) => (
              <div key={subject.id} className="flex-1 border border-gray-100 px-4 py-3 text-center" style={{ minWidth: 120 }}>
                <p className="text-xs text-gray-500">{subject.name}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{seatMap.get(subject.id) ?? '-'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.course.feature_qr_distribution ? (
        <section className="border-t border-gray-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: courseTheme }}>교재(자료) 수령 현황</h2>
            {materialCount > 0 ? (
              <span className={`px-2 py-0.5 text-xs font-bold ${allReceived ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                {receiptCount} / {materialCount} 수령
              </span>
            ) : null}
          </div>

          {allReceived ? (
            <div className="mb-3 flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3">
              <span className="text-base text-green-700">완료</span>
              <span className="text-sm font-bold text-green-800">모든 자료를 수령했습니다.</span>
            </div>
          ) : null}

          {materialCount === 0 ? (
            <p className="py-2 text-sm text-gray-400">배부 자료가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.materials.map((material) => {
                const receiptAt = data.receipts[material.id]
                const isNext = material.id === nextMaterialId

                return (
                  <li key={material.id} className={`flex items-center gap-3 px-2 py-2 ${isNext ? 'bg-blue-50' : ''}`}>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[10px] font-bold ${
                        receiptAt ? 'border-green-700 bg-green-700 text-white' : 'border-gray-300'
                      }`}
                    >
                      {receiptAt ? '완료' : ''}
                    </span>
                    <span className={`text-sm font-medium ${isNext ? 'font-bold text-blue-900 underline' : 'text-gray-700'}`}>
                      {material.name}
                    </span>
                    <span className="ml-auto text-xs">
                      {receiptAt ? (
                        <span className="font-medium text-green-700">{formatReceiptTime(receiptAt)}</span>
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
          )}
        </section>
      ) : null}

      <div className="mt-auto flex gap-3 px-4 pb-2">
        {data.course.feature_notices && data.course.notice_visible && data.course.notice_content ? (
          <button onClick={() => setNoticeOpen(true)} className="flex-1 py-3 text-sm font-medium" style={{ background: '#e8eaf6', color: courseTheme }}>
            공지사항
          </button>
        ) : null}
        {data.course.feature_refund_policy && data.course.refund_policy ? (
          <button onClick={() => setRefundOpen(true)} className="flex-1 py-3 text-sm font-medium" style={{ background: '#e8eaf6', color: courseTheme }}>
            환불 규정
          </button>
        ) : null}
      </div>

      <div className="px-4 pb-6">
        <button onClick={() => setBackConfirmOpen(true)} className="w-full border border-gray-200 py-3 text-sm text-gray-500">
          강좌 목록으로 돌아가기
        </button>
      </div>

      {backConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5" onClick={() => setBackConfirmOpen(false)}>
          <div className="flex w-full max-w-sm flex-col overflow-hidden bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="px-5 py-5">
              <p className="mb-1 text-base font-bold text-gray-800">강좌 목록으로 돌아가시겠습니까?</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button onClick={() => setBackConfirmOpen(false)} className="flex-1 border-r border-gray-100 py-3 text-sm text-gray-500">
                취소
              </button>
              <button onClick={goBack} className="flex-1 py-3 text-sm font-medium text-white" style={{ background: courseTheme }}>
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noticeOpen && data.course.notice_content ? (
        <Modal title={data.course.notice_title || '공지사항'} theme={courseTheme} onClose={() => setNoticeOpen(false)}>
          <p className="whitespace-pre-wrap">{data.course.notice_content}</p>
        </Modal>
      ) : null}

      {refundOpen && data.course.refund_policy ? (
        <Modal title="환불 규정" theme={courseTheme} onClose={() => setRefundOpen(false)}>
          <p className="whitespace-pre-wrap">{data.course.refund_policy}</p>
        </Modal>
      ) : null}
    </div>
  )
}

function DesignatedSeatSummary({ data, courseTheme }: { data: PassPayload; courseTheme: string }) {
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const enrollmentId = Number(searchParams.get('enrollmentId'))
  const state = data.designatedSeat
  const seatLabel = state.reservation?.seat?.label ?? null
  const href = `/courses/${params.courseSlug}/designated-seat?enrollmentId=${enrollmentId}`

  return (
    <section className="border-t border-gray-100 p-4">
      <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>지정좌석</h2>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-gray-900">{seatLabel ?? '미지정'}</p>
          <p className="mt-1 text-xs text-gray-500">
            {seatLabel
              ? '좌석이 배정되었습니다.'
              : state.open
                ? 'QR 인증 후 좌석을 선택해 주세요.'
                : '좌석 신청이 아직 열리지 않았습니다.'}
          </p>
        </div>
        {state.open ? (
          <Link href={href} className="shrink-0 px-4 py-2.5 text-sm font-medium text-white" style={{ background: courseTheme }}>
            {seatLabel ? '좌석 변경' : '좌석 선택'}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

function Modal({
  title,
  theme,
  onClose,
  children,
}: {
  title: string
  theme?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5" onClick={onClose}>
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden bg-white"
        style={{ maxHeight: '80dvh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-base font-bold" style={{ color: theme || 'var(--theme)' }}>{title}</span>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center text-lg text-gray-400 hover:bg-gray-100" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-gray-700">{children}</div>
        <div className="border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-white" style={{ background: theme || 'var(--theme)' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
