'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import { formatPhoneNumber, formatShortDate } from '@/lib/utils'

type StudentHistoryRow = {
  enrollment_id: number
  course_id: number
  course_name: string
  course_slug: string
  course_status: 'active' | 'archived'
  status: 'active' | 'refunded'
  lifecycle_status: 'active' | 'suspended' | 'refunded' | 'archived'
  suspended_at: string | null
  refunded_at: string | null
  series_label: string | null
  student_type: string
  exam_number: string | null
  cohort_label: string | null
  created_at: string
}

type StudentHistoryPayload = {
  resolution: 'student_id' | 'identity_fallback'
  student: {
    id: number | null
    name: string
    phone: string
    exam_number: string | null
    cohort_option_id: number | null
    cohort_label: string | null
    auth_method: 'birth_date' | 'pin' | null
  }
  active: StudentHistoryRow[]
  history: StudentHistoryRow[]
}

type StudentHistoryPanelProps = {
  enrollmentId: number | null
  onClose: () => void
}

const STATUS_LABEL: Record<StudentHistoryRow['lifecycle_status'], string> = {
  active: '수강중',
  suspended: '정지',
  refunded: '환불',
  archived: '종료',
}

function getAuthMethodLabel(method: StudentHistoryPayload['student']['auth_method']) {
  if (method === 'birth_date') return '생년월일 인증'
  if (method === 'pin') return 'PIN 인증'
  return '인증 미설정'
}

function StatusBadge({ status }: { status: StudentHistoryRow['lifecycle_status'] }) {
  const className = {
    active: 'bg-emerald-50 text-emerald-700',
    suspended: 'bg-amber-50 text-amber-700',
    refunded: 'bg-rose-50 text-rose-700',
    archived: 'bg-slate-100 text-slate-600',
  }[status]

  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function CourseRow({ row }: { row: StudentHistoryRow }) {
  const tenant = useTenantConfig()
  return (
    <div className="rounded-[8px] border border-slate-100 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={withTenantPrefix(`/dashboard/courses/${row.course_id}/students`, tenant.type)}
            className="block truncate text-sm font-semibold text-[#1d1d1f] transition hover:text-[#0071e3]"
          >
            {row.course_name}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {[row.cohort_label, row.exam_number, row.series_label].filter(Boolean).join(' · ') || '-'}
          </p>
        </div>
        <StatusBadge status={row.lifecycle_status} />
      </div>
      <p className="mt-2 text-xs text-slate-400">등록일 {formatShortDate(row.created_at)}</p>
    </div>
  )
}

export function StudentHistoryPanel({ enrollmentId, onClose }: StudentHistoryPanelProps) {
  const [payload, setPayload] = useState<StudentHistoryPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enrollmentId) {
      setPayload(null)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`/api/enrollments/${enrollmentId}/student-history`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error ?? '학생 이력을 불러오지 못했습니다.')
        }
        return data as StudentHistoryPayload
      })
      .then((data) => {
        if (!cancelled) {
          setPayload(data)
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '학생 이력을 불러오지 못했습니다.')
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
  }, [enrollmentId])

  const groupedHistory = useMemo(() => {
    const groups: Record<StudentHistoryRow['lifecycle_status'], StudentHistoryRow[]> = {
      active: [],
      suspended: [],
      refunded: [],
      archived: [],
    }
    for (const row of payload?.history ?? []) {
      groups[row.lifecycle_status].push(row)
    }
    return groups
  }, [payload?.history])

  if (!enrollmentId) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-[#f5f5f7] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-400">학생 상세</p>
            <h2 className="mt-1 truncate text-xl font-bold text-[#1d1d1f]">
              {payload?.student.name ?? '학생 이력'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="rounded-[8px] bg-white px-4 py-6 text-center text-sm text-slate-500">
              학생 이력을 불러오는 중입니다.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-[8px] bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
          ) : null}

          {payload ? (
            <div className="grid gap-5">
              <section className="rounded-[8px] bg-white p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">연락처</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{formatPhoneNumber(payload.student.phone)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">수험번호</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{payload.student.exam_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">기수</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{payload.student.cohort_label || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">인증 방식</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{getAuthMethodLabel(payload.student.auth_method)}</p>
                  </div>
                </div>
                {payload.resolution === 'identity_fallback' ? (
                  <p className="mt-4 rounded-[8px] bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    student_id 연결이 없어 이름과 연락처 기준으로 조회했습니다.
                  </p>
                ) : null}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1d1d1f]">현재 수강중인 강좌</h3>
                  <span className="text-xs font-semibold text-slate-400">{payload.active.length}개</span>
                </div>
                <div className="grid gap-2">
                  {payload.active.length === 0 ? (
                    <p className="rounded-[8px] bg-white px-4 py-4 text-center text-sm text-slate-500">
                      현재 수강중인 강좌가 없습니다.
                    </p>
                  ) : payload.active.map((row) => (
                    <CourseRow key={`active-${row.enrollment_id}`} row={row} />
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1d1d1f]">전체 수강 이력</h3>
                  <span className="text-xs font-semibold text-slate-400">{payload.history.length}개</span>
                </div>
                <div className="grid gap-4">
                  {(['active', 'suspended', 'refunded', 'archived'] as const).map((status) => {
                    const rows = groupedHistory[status]
                    if (rows.length === 0) {
                      return null
                    }

                    return (
                      <div key={status}>
                        <p className="mb-2 text-xs font-bold text-slate-500">{STATUS_LABEL[status]}</p>
                        <div className="grid gap-2">
                          {rows.map((row) => (
                            <CourseRow key={`${status}-${row.enrollment_id}`} row={row} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
