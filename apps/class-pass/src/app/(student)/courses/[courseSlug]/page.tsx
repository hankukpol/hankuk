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

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

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
  const autoOpenedRef = useRef(false)

  const enrollmentId = Number(searchParams.get('enrollmentId'))

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

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
    let removeVisibilityListener: (() => void) | null = null
    let receiptMaterialCount = 0

    async function load(): Promise<PassPayload> {
      const response = await fetch(withTenantPrefix('/api/enrollments/pass', tenant.type), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, courseSlug: params.courseSlug, name, phone }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? '수강증 정보를 불러오지 못했습니다.')
      }
      if (!cancelled) {
        setData(payload as PassPayload)
      }
      return payload as PassPayload
    }

    async function pollReceipts() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

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
        const newTextbookReceipts = payload.textbookReceipts ?? {}
        const nextReceiptCount =
          Object.keys(newReceipts).length
          + Object.keys(newTextbookReceipts).length

        if (nextReceiptCount > prevReceiptCountRef.current && prevReceiptCountRef.current > 0) {
          try {
            navigator.vibrate?.([100, 50, 100])
          } catch {
            // optional vibration
          }
        }

        if (receiptMaterialCount > 0 && nextReceiptCount >= receiptMaterialCount && pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }

        prevReceiptCountRef.current = nextReceiptCount
        setData((current) => (
          current
            ? {
              ...current,
              receipts: newReceipts,
              textbookReceipts: newTextbookReceipts,
            }
            : current
        ))
      }
    }

    load()
      .then((passData) => {
        if (!cancelled) {
          setLoading(false)
          prevReceiptCountRef.current =
            Object.keys(passData.receipts).length
            + Object.keys(passData.textbookReceipts).length
          receiptMaterialCount = passData.materials.length + passData.textbooks.length

          const shouldPollReceipts =
            passData.course.feature_qr_distribution &&
            receiptMaterialCount > 0 &&
            prevReceiptCountRef.current < receiptMaterialCount

          if (shouldPollReceipts) {
            pollTimer = setInterval(() => {
              void pollReceipts()
            }, 10_000)

            const handleVisibilityChange = () => {
              if (document.visibilityState === 'visible') {
                void pollReceipts()
              }
            }

            document.addEventListener('visibilitychange', handleVisibilityChange)
            removeVisibilityListener = () => {
              document.removeEventListener('visibilitychange', handleVisibilityChange)
            }
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
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      removeVisibilityListener?.()
    }
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  const courseTheme = data?.course.theme_color ?? data?.appConfig.theme_color ?? 'var(--student-blue)'
  const dday = useMemo(() => calculateDday(data?.course.target_date ?? null), [data?.course.target_date])
  const qrValue = data?.qrToken ?? ''

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

  const isOutsideTimeWindow = useMemo(() => {
    if (!data?.course.feature_time_window || !data.course.time_window_start || !data.course.time_window_end) {
      return false
    }
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
      <div className="student-page flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--student-blue)] border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[17px] tracking-[-0.03em] text-[var(--student-text-muted)]">
            {error || '수강증 정보를 불러오지 못했습니다.'}
          </p>
          <button onClick={goBack} className="student-pill-button student-pill-primary mt-5 w-full">
            강좌 목록으로
          </button>
        </div>
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
          extraContent={
            data.attendance.enabled || data.designatedSeat.enabled ? (
              <>
                {data.attendance.enabled ? <AttendanceSummary data={data} /> : null}
                {data.designatedSeat.enabled ? <DesignatedSeatSummary data={data} /> : null}
              </>
            ) : undefined
          }
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
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">현재 수강 가능한 상태가 아닙니다.</p>
          <p className="student-body mt-3">관리자에게 문의해 주세요.</p>
          <button onClick={goBack} className="student-pill-button student-pill-primary mt-6 w-full">
            강좌 목록으로
          </button>
        </div>
      </div>
    )
  }

  if (isOutsideTimeWindow) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center px-6">
        <div className="student-card max-w-md px-6 py-7 text-center">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">입장 가능한 시간이 아닙니다.</p>
          <p className="student-body mt-3">
            현재 {formattedTime} / 입장 가능 {data.course.time_window_start || '--:--'} ~ {data.course.time_window_end || '--:--'}
          </p>
          <button onClick={goBack} className="student-pill-button student-pill-primary mt-6 w-full">
            강좌 목록으로
          </button>
        </div>
      </div>
    )
  }

  const seatMap = new Map(data.seatAssignments.map((seat) => [seat.subject_id, seat.seat_number]))
  const showSeatAssignments = data.course.feature_seat_assignment || data.seatAssignments.length > 0
  const receiptCount = Object.keys(data.receipts).length
  const materialCount = data.materials.length
  const allReceived = materialCount > 0 && receiptCount === materialCount
  const nextMaterialId = data.materials.find((material) => !data.receipts[material.id])?.id
  const textbookReceiptCount = Object.keys(data.textbookReceipts).length
  const textbookCount = data.textbooks.length
  const allTextbooksReceived = textbookCount > 0 && textbookReceiptCount === textbookCount
  const nextTextbookId = data.textbooks.find((material) => !data.textbookReceipts[material.id])?.id

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
    <div className="student-page student-safe-bottom flex min-h-dvh flex-col">
      <section className="student-hero px-4 pb-6 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={goBack} className="text-[13px] font-semibold tracking-[-0.02em] text-white/72 transition-opacity hover:text-white">
            목록으로
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {dday ? <span className="student-chip student-chip-dark">{dday}</span> : null}
            <span className="student-chip student-chip-dark">{formatCourseTypeLabel(data.course.course_type)}</span>
          </div>
        </div>

        <div className="mt-5 text-center">
          {hasPhoto ? (
            <>
              <p className="student-eyebrow student-eyebrow-dark">{data.appConfig.app_name || tenant.defaultAppName}</p>
              <h1 className="student-display mt-2">모바일 수강증</h1>
              <p className="student-body student-body-dark mt-2">{data.course.name}</p>
            </>
          ) : (
            <>
              <p className="student-eyebrow student-eyebrow-dark">모바일 수강증</p>
              <h1 className="student-display mt-2 break-keep">{data.course.name}</h1>
              <p className="student-body student-body-dark mt-2">
                {formattedDate} ({DAY_NAMES[currentTime.getDay()]}) {formattedTime}
              </p>
            </>
          )}

          {data.course.feature_time_window ? (
            <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[12px] font-medium text-white/82">
              입장 가능 {data.course.time_window_start || '--:--'} ~ {data.course.time_window_end || '--:--'}
            </div>
          ) : null}
        </div>
      </section>

      {hasPhoto ? (
        <div className="flex flex-col items-center px-4 pt-4">
          <div className="h-[100px] w-[100px] overflow-hidden rounded-full border-[3px] border-white bg-[var(--student-surface-muted)]">
            <Image
              src={data.enrollment.photo_url!}
              alt={`${data.enrollment.name} 사진`}
              width={200}
              height={200}
              unoptimized
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="mt-3 text-[20px] font-semibold leading-[1.07] tracking-[-0.02em] text-[var(--student-text)]">
            {data.enrollment.name}
          </h2>
          <p className="mt-0.5 text-[14px] text-[var(--student-text-muted)]">{data.enrollment.exam_number || '-'}</p>
        </div>
      ) : null}

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <h2 className="student-eyebrow student-eyebrow-light mb-3">수강생 정보</h2>
        {hasPhoto ? (
          <table className="w-full text-[14px]">
            <tbody>
              <tr>
                <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">과정명</td>
                <td className="py-2.5 font-medium text-[var(--student-text)]">{data.course.name}</td>
              </tr>
              <tr>
                <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">오늘 날짜</td>
                <td className="py-2.5 font-medium text-[var(--student-text)]">
                  {formattedDate} ({DAY_NAMES[currentTime.getDay()]})
                </td>
              </tr>
              {enrollmentPeriod ? (
                <tr>
                  <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">수강 기간</td>
                  <td className="py-2.5 font-medium text-[var(--student-text)]">{enrollmentPeriod}</td>
                </tr>
              ) : null}
              <tr>
                <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">현재 시간</td>
                <td className="py-2.5 font-semibold text-[var(--student-blue)]">{formattedTime}</td>
              </tr>
              {data.enrollment.phone ? (
                <tr>
                  <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">연락처</td>
                  <td className="py-2.5 font-medium text-[var(--student-text)]">{data.enrollment.phone}</td>
                </tr>
              ) : null}
              {(data.course.enrollment_fields ?? []).map((field) => {
                const value = (data.enrollment.custom_data ?? {})[field.key]
                return value ? (
                  <tr key={field.key}>
                    <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">{field.label}</td>
                    <td className="py-2.5 font-medium text-[var(--student-text)]">{value}</td>
                  </tr>
                ) : null
              })}
              <tr>
                <td className="w-[88px] py-2.5 pr-3 text-[var(--student-text-muted)]">상태</td>
                <td className="py-2.5 font-medium text-[var(--student-text)]">{data.enrollment.status === 'active' ? '수강 중' : '환불'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="flex gap-4">
            {data.course.feature_photo ? (
              <div className="flex h-[100px] w-[76px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--student-surface-muted)] text-[11px] font-medium text-[var(--student-text-muted)]">
                사진 없음
              </div>
            ) : null}
            <table className="w-full text-[14px]">
              <tbody>
                {studentFields.map(({ label, value }) => (
                  <tr key={label}>
                    <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">{label}</td>
                    <td className="py-2 font-medium text-[var(--student-text)]">{value}</td>
                  </tr>
                ))}
                {enrollmentPeriod ? (
                  <tr>
                    <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">수강 기간</td>
                    <td className="py-2 font-medium text-[var(--student-text)]">{enrollmentPeriod}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.attendance.enabled ? <AttendanceSummary data={data} /> : null}
      {data.designatedSeat.enabled ? <DesignatedSeatSummary data={data} /> : null}

      {data.course.feature_qr_pass && data.qrToken ? (
        <section className="student-card mx-4 mt-4 px-4 py-5 text-center sm:mx-5">
          <h2 className="student-eyebrow student-eyebrow-light mb-3">개인 QR</h2>
          <div className="mb-3 inline-flex rounded-[16px] bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <QRCodeSVG
              value={qrValue}
              size={256}
              level="M"
              includeMargin
              bgColor="#ffffff"
              fgColor="#111827"
              className="h-auto w-[clamp(208px,62vw,256px)]"
            />
          </div>
          <p className="text-[14px] font-medium tracking-[-0.02em] text-[var(--student-link)]">직원에게 이 QR 코드를 보여 주세요.</p>
        </section>
      ) : null}

      {showSeatAssignments ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <h2 className="student-eyebrow student-eyebrow-light mb-3">좌석 배정</h2>
          <div className="grid grid-cols-2 gap-2">
            {data.subjects.map((subject) => (
              <div key={subject.id} className="student-card-muted px-3 py-3 text-center">
                <p className="text-[11px] font-medium text-[var(--student-text-muted)]">{subject.name}</p>
                <p className="mt-1.5 text-[24px] font-semibold leading-[1] tracking-[-0.05em] text-[var(--student-text)]">
                  {seatMap.get(subject.id) ?? '-'}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.course.feature_qr_distribution && materialCount > 0 ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="student-eyebrow student-eyebrow-light">배부 자료</h2>
            {materialCount > 0 ? (
              <span className={`student-chip ${allReceived ? 'bg-[#eefaf1] text-[#19703a]' : 'bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]'}`}>
                {receiptCount} / {materialCount} 수령
              </span>
            ) : null}
          </div>

          {allReceived ? (
            <div className="mb-3 rounded-[12px] bg-[#eefaf1] px-4 py-3 text-center">
              <span className="text-[14px] font-semibold text-[#19703a]">모든 자료를 수령했습니다.</span>
            </div>
          ) : null}

          {materialCount === 0 ? (
            <p className="student-body py-2">배부 자료가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.materials.map((material) => {
                const receiptAt = data.receipts[material.id]
                const isNext = material.id === nextMaterialId

                return (
                  <li
                    key={material.id}
                    className={`flex items-center gap-3 rounded-[24px] px-4 py-3 ${
                      isNext
                        ? 'bg-[rgba(0,113,227,0.08)]'
                        : 'bg-[var(--student-surface-soft)]'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                        receiptAt ? 'bg-[#19703a] text-white' : 'border-2 border-[var(--student-line-strong)] text-transparent'
                      }`}
                    >
                      {receiptAt ? '완' : '·'}
                    </span>
                    <span className={`text-[14px] ${isNext ? 'font-semibold text-[var(--student-blue)]' : 'font-medium text-[var(--student-text)]'}`}>
                      {material.name}
                    </span>
                    <span className="ml-auto text-[12px]">
                      {receiptAt ? (
                        <span className="font-medium text-[#19703a]">{formatReceiptTime(receiptAt)}</span>
                      ) : isNext ? (
                        <span className="text-[var(--student-text-muted)]">다음 수령 대상</span>
                      ) : (
                        <span className="text-[#98a0ad]">대기 중</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {data.course.feature_qr_distribution && textbookCount > 0 ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="student-eyebrow student-eyebrow-light">교재 수령</h2>
            <span className={`student-chip ${allTextbooksReceived ? 'bg-[#eefaf1] text-[#19703a]' : 'bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]'}`}>
              {textbookReceiptCount} / {textbookCount} 수령
            </span>
          </div>

          {allTextbooksReceived ? (
            <div className="mb-3 rounded-[12px] bg-[#eefaf1] px-4 py-3 text-center">
              <span className="text-[14px] font-semibold text-[#19703a]">모든 교재를 수령했습니다.</span>
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {data.textbooks.map((material) => {
              const receiptAt = data.textbookReceipts[material.id]
              const isNext = material.id === nextTextbookId

              return (
                <li
                  key={material.id}
                  className={`flex items-center gap-3 rounded-[24px] px-4 py-3 ${
                    isNext
                      ? 'bg-[rgba(0,113,227,0.08)]'
                      : 'bg-[var(--student-surface-soft)]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      receiptAt ? 'bg-[#19703a] text-white' : 'border-2 border-[var(--student-line-strong)] text-transparent'
                    }`}
                  >
                    {receiptAt ? '완' : '·'}
                  </span>
                  <span className={`text-[14px] ${isNext ? 'font-semibold text-[var(--student-blue)]' : 'font-medium text-[var(--student-text)]'}`}>
                    {material.name}
                  </span>
                  <span className="ml-auto text-[12px]">
                    {receiptAt ? (
                      <span className="font-medium text-[#19703a]">{formatReceiptTime(receiptAt)}</span>
                    ) : isNext ? (
                      <span className="text-[var(--student-text-muted)]">다음 수령 대상</span>
                    ) : (
                      <span className="text-[#98a0ad]">대기 중</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {data.course.kakao_chat_url || data.course.extra_site_url ? (
        <div className="mt-4 px-4 sm:px-5">
          {data.course.kakao_chat_url ? (
            <a
              href={data.course.kakao_chat_url}
              target="_blank"
              rel="noopener noreferrer"
              className="student-pill-button mb-2 flex w-full items-center justify-center gap-2 text-[#191919]"
              style={{ backgroundColor: '#FEE500' }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#191919" aria-hidden="true">
                <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.734 1.811 5.126 4.535 6.482-.145.53-.93 3.408-.965 3.627 0 0-.02.164.087.227.106.063.231.03.231.03.305-.043 3.535-2.313 4.094-2.71.655.098 1.33.15 2.018.15 5.523 0 10-3.463 10-7.806C22 6.463 17.523 3 12 3" />
              </svg>
              카카오톡 단톡방 참여
            </a>
          ) : null}
          {data.course.extra_site_url ? (
            <a
              href={data.course.extra_site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="student-pill-button student-pill-primary flex w-full items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14 5h5v5" />
                <path d="M10 14 19 5" />
                <path d="M19 14v5h-14v-14h5" />
              </svg>
              {data.course.extra_site_label?.trim() || '추가 사이트 이동'}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 px-4 pb-2 sm:px-5">
        {data.course.feature_notices && data.course.notice_visible && data.course.notice_content ? (
          <button onClick={() => setNoticeOpen(true)} className="student-pill-button student-pill-secondary flex-1">
            공지사항
          </button>
        ) : null}
        {data.course.feature_refund_policy && data.course.refund_policy ? (
          <button onClick={() => setRefundOpen(true)} className="student-pill-button student-pill-secondary flex-1">
            환불 규정
          </button>
        ) : null}
      </div>

      <div className="px-4 sm:px-5">
        <button onClick={() => setBackConfirmOpen(true)} className="student-pill-button student-pill-outline w-full">
          강좌 목록으로 돌아가기
        </button>
      </div>

      {backConfirmOpen ? (
        <div className="student-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setBackConfirmOpen(false)}>
          <div className="student-card w-full max-w-[320px] overflow-hidden bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="px-5 pb-4 pt-5 text-center">
              <p className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">강좌 목록으로 돌아가시겠습니까?</p>
            </div>
            <div className="flex border-t border-[var(--student-line)]">
              <button onClick={() => setBackConfirmOpen(false)} className="flex-1 border-r border-[var(--student-line)] py-[14px] text-[17px] text-[var(--student-link)]">
                취소
              </button>
              <button onClick={goBack} className="flex-1 py-[14px] text-[17px] font-semibold text-[var(--student-link)]">
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
    </div>
  )
}

function AttendanceSummary({ data }: { data: PassPayload }) {
  const tenant = useTenantConfig()
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const enrollmentId = Number(searchParams.get('enrollmentId'))
  const state = data.attendance
  const href = withTenantPrefix(`/courses/${params.courseSlug}/attendance?enrollmentId=${enrollmentId}`, tenant.type)

  return (
    <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
      <h2 className="student-eyebrow student-eyebrow-light mb-3">출석</h2>
      <div className="student-card-muted flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[20px] font-semibold leading-[1.07] tracking-[-0.02em] text-[var(--student-text)]">
            {state.attended_today ? '완료' : state.open ? '진행 중' : '대기'}
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.47] text-[var(--student-text-muted)]">
            {state.attended_today
              ? `오늘 출석 완료${state.attended_at ? ` (${formatReceiptTime(state.attended_at)})` : ''}`
              : state.open
                ? '교실 화면의 6자리 코드를 입력해 출석해 주세요.'
                : '현재 출석 체크가 열려 있지 않습니다.'}
          </p>
        </div>
        <Link
          href={href}
          className={`student-pill-button shrink-0 px-5 ${state.attended_today ? 'student-pill-secondary bg-[#eefaf1] text-[#19703a]' : 'student-pill-primary'}`}
        >
          {state.attended_today ? '상세 보기' : '출석하기'}
        </Link>
      </div>
    </section>
  )
}

function DesignatedSeatSummary({ data }: { data: PassPayload }) {
  const tenant = useTenantConfig()
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const enrollmentId = Number(searchParams.get('enrollmentId'))
  const state = data.designatedSeat
  const seatLabel = state.reservation?.seat?.label ?? null
  const href = withTenantPrefix(`/courses/${params.courseSlug}/designated-seat?enrollmentId=${enrollmentId}`, tenant.type)

  return (
    <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
      <h2 className="student-eyebrow student-eyebrow-light mb-3">지정좌석</h2>
      <div className="student-card-muted flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[20px] font-semibold leading-[1.07] tracking-[-0.02em] text-[var(--student-text)]">{seatLabel ?? '미정'}</p>
          <p className="mt-1.5 text-[12px] leading-[1.47] text-[var(--student-text-muted)]">
            {seatLabel
              ? '좌석이 배정되어 있습니다.'
              : state.open
                ? 'QR 인증 후 좌석을 선택해 주세요.'
                : '좌석 요청이 아직 열리지 않았습니다.'}
          </p>
        </div>
        {state.open ? (
          <Link href={href} className="student-pill-button student-pill-primary shrink-0 px-5">
            {seatLabel ? '변경' : '선택'}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="student-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-6" onClick={onClose}>
      <div
        className="student-card flex w-full max-w-sm flex-col overflow-hidden rounded-t-[16px] bg-white sm:rounded-[16px]"
        style={{ maxHeight: '80dvh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-0 pt-5">
          <span className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">{title}</span>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--student-surface-muted)] text-[var(--student-text-muted)] transition-opacity active:opacity-70"
            aria-label="닫기"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 text-[14px] leading-[1.6] text-[var(--student-text-muted)]">{children}</div>
        <div className="px-6 pb-8 pt-2">
          <button onClick={onClose} className="student-pill-button student-pill-primary w-full">
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
