'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  STUDENT_SESSION_NAME_KEY,
  STUDENT_SESSION_PHONE_KEY,
} from '@/lib/student-session'
import type { ArchivedPassPayload, Material } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'

function replaceStudentLocation(target: string, router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined') {
    window.location.replace(target)
    return
  }

  router.replace(target)
}

function isCurrentStudentLocation(target: string) {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const currentUrl = new URL(window.location.href)
    const targetUrl = new URL(target, window.location.origin)
    return currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search
  } catch {
    return false
  }
}

function formatReceiptTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function ArchivedStudentCoursePage() {
  const tenant = useTenantConfig()
  const params = useParams<{ courseSlug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<ArchivedPassPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)

  const enrollmentId = Number(searchParams.get('enrollmentId'))

  useEffect(() => {
    const name = sessionStorage.getItem(STUDENT_SESSION_NAME_KEY) ?? ''
    const phone = sessionStorage.getItem(STUDENT_SESSION_PHONE_KEY) ?? ''

    if (!name || !phone || !Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      replaceStudentLocation(withTenantPrefix('/', tenant.type), router)
      return
    }

    let cancelled = false

    fetch(withTenantPrefix('/api/enrollments/archived-pass', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        courseSlug: params.courseSlug,
        name,
        phone,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          if (!cancelled && typeof payload?.redirectTo === 'string') {
            if (isCurrentStudentLocation(payload.redirectTo)) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[student-archived-pass] blocked same-location redirect', {
                  current: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null,
                  redirectTo: payload.redirectTo,
                  reason: payload?.reason ?? null,
                  courseSlug: params.courseSlug,
                  enrollmentId,
                })
              }
              throw new Error(payload?.error ?? '보관 강좌 정보를 불러오지 못했습니다.')
            }
            cancelled = true
            replaceStudentLocation(payload.redirectTo, router)
            return
          }
          throw new Error(payload?.error ?? '보관 강좌 정보를 불러오지 못했습니다.')
        }

        if (!cancelled) {
          setData(payload as ArchivedPassPayload)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '보관 강좌 정보를 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enrollmentId, params.courseSlug, router, tenant.type])

  const courseTheme = data?.course.theme_color ?? 'var(--student-blue)'
  const handoutReceivedCount = useMemo(
    () => Object.keys(data?.receipts ?? {}).length,
    [data?.receipts],
  )
  const textbookReceivedCount = useMemo(
    () => Object.keys(data?.textbookReceipts ?? {}).length,
    [data?.textbookReceipts],
  )

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
            {error || '보관 강좌 정보를 불러오지 못했습니다.'}
          </p>
          <button onClick={goBack} className="student-pill-button student-pill-primary mt-5 w-full">
            강좌 목록으로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="student-page student-safe-bottom">
      <section className="student-hero px-4 pb-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="student-eyebrow student-eyebrow-dark">Archived Course</p>
            <h1 className="student-display mt-2">{data.course.name}</h1>
          </div>
          <span className="student-chip student-chip-dark">보관됨</span>
        </div>
        <p className="student-body student-body-dark mt-2">
          {formatCourseTypeLabel(data.course.course_type)} · 읽기 전용 기록
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="student-chip student-chip-dark">실시간 기능 종료</span>
          {data.course.feature_attendance ? <span className="student-chip student-chip-dark">출석 요약</span> : null}
          {data.materials.length + data.textbooks.length > 0 ? <span className="student-chip student-chip-dark">배부 내역</span> : null}
        </div>
        <div className="mt-4 h-1 rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: '42%', backgroundColor: courseTheme }} />
        </div>
      </section>

      <div className="flex flex-col gap-4 px-4 pt-4">
        <section className="student-card px-4 py-4">
          <p className="student-eyebrow student-eyebrow-light">보관 상태</p>
          <p className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">
            이 강좌는 보관 처리되었습니다.
          </p>
          <p className="student-body mt-2">
            관리자가 강좌를 보관하면서 QR 수강증, 출석, 좌석 같은 실시간 기능은 종료되었고,
            안내와 수강 기록만 읽기 전용으로 유지됩니다.
          </p>
        </section>

        {data.course.feature_attendance ? (
          <section className="student-card px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="student-eyebrow student-eyebrow-light">출석 요약</p>
                <p className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">
                  총 {data.attendanceSummary.total_count}회 출석
                </p>
              </div>
              <span className="student-chip">
                {data.attendanceSummary.attended_today ? '오늘 출석 있음' : '오늘 출석 없음'}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SummaryCard
                label="최근 출석"
                value={
                  data.attendanceSummary.latest_attended_at
                    ? formatReceiptTime(data.attendanceSummary.latest_attended_at)
                    : '기록 없음'
                }
              />
              <SummaryCard
                label="오늘 상태"
                value={
                  data.attendanceSummary.attended_at
                    ? `완료 · ${formatReceiptTime(data.attendanceSummary.attended_at)}`
                    : '출석 기록 없음'
                }
              />
            </div>
          </section>
        ) : null}

        <ReceiptSection
          title="자료 배부 요약"
          countLabel={`${handoutReceivedCount} / ${data.materials.length} 수령`}
          emptyMessage="등록된 배부 자료가 없습니다."
          items={data.materials}
          receipts={data.receipts}
        />

        <ReceiptSection
          title="교재 배부 요약"
          countLabel={`${textbookReceivedCount} / ${data.textbooks.length} 수령`}
          emptyMessage="배정된 교재가 없습니다."
          items={data.textbooks}
          receipts={data.textbookReceipts}
        />

        {data.course.kakao_chat_url || data.course.extra_site_url ? (
          <section className="student-card px-4 py-4">
            <p className="student-eyebrow student-eyebrow-light">관련 링크</p>
            <div className="mt-3 flex flex-col gap-2">
              {data.course.kakao_chat_url ? (
                <a
                  href={data.course.kakao_chat_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="student-pill-button flex w-full items-center justify-center gap-2 text-[#191919]"
                  style={{ backgroundColor: '#FEE500' }}
                >
                  카카오톡 오픈채팅
                </a>
              ) : null}
              {data.course.extra_site_url ? (
                <a
                  href={data.course.extra_site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="student-pill-button student-pill-primary flex w-full items-center justify-center gap-2"
                >
                  {data.course.extra_site_label?.trim() || '추가 사이트 이동'}
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {(data.course.notice_visible && data.course.notice_content) || data.course.refund_policy ? (
          <div className="flex gap-2">
            {data.course.notice_visible && data.course.notice_content ? (
              <button onClick={() => setNoticeOpen(true)} className="student-pill-button student-pill-secondary flex-1">
                공지 사항
              </button>
            ) : null}
            {data.course.refund_policy ? (
              <button onClick={() => setRefundOpen(true)} className="student-pill-button student-pill-secondary flex-1">
                환불 규정
              </button>
            ) : null}
          </div>
        ) : null}

        <button onClick={goBack} className="student-pill-button student-pill-outline w-full">
          강좌 목록으로 돌아가기
        </button>
      </div>

      {noticeOpen && data.course.notice_content ? (
        <Modal title={data.course.notice_title || '공지 사항'} onClose={() => setNoticeOpen(false)}>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="student-card-muted px-4 py-3">
      <p className="text-[12px] font-medium text-[var(--student-text-muted)]">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-[var(--student-text)]">{value}</p>
    </div>
  )
}

function ReceiptSection({
  title,
  countLabel,
  emptyMessage,
  items,
  receipts,
}: {
  title: string
  countLabel: string
  emptyMessage: string
  items: Material[]
  receipts: Record<number, string>
}) {
  return (
    <section className="student-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="student-eyebrow student-eyebrow-light">{title}</p>
          <p className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">{countLabel}</p>
        </div>
        <span className="student-chip">읽기 전용</span>
      </div>

      {items.length === 0 ? (
        <div className="student-card-muted mt-3 px-4 py-3">
          <p className="text-[14px] text-[var(--student-text-muted)]">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((material) => {
            const receiptAt = receipts[material.id] ?? null
            return (
              <li key={material.id} className="student-card-muted flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    receiptAt ? 'bg-[#19703a] text-white' : 'border border-[var(--student-line)] text-[var(--student-text-muted)]'
                  }`}
                >
                  {receiptAt ? '완료' : '대기'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--student-text)]">{material.name}</p>
                  {material.description ? (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--student-text-muted)]">{material.description}</p>
                  ) : null}
                </div>
                <span className="text-[12px] text-[var(--student-text-muted)]">
                  {receiptAt ? formatReceiptTime(receiptAt) : '미수령'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
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
    <div className="student-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:px-6" onClick={onClose}>
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
