'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
import { AdminDrawerSurface } from '@/components/admin/AdminDrawer'
import { AdminPortal } from '@/components/admin/AdminPortal'
import { AnimatePresence } from 'framer-motion'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import { formatPhoneNumber, formatShortDate } from '@/lib/utils'

type StudentHistoryRow = {
  enrollment_id: number
  course_id: number
  course_name: string
  course_slug: string
  course_status: 'active' | 'archived'
  status: 'active' | 'refunded' | 'cancelled'
  lifecycle_status: 'active' | 'suspended' | 'refunded' | 'archived' | 'cancelled'
  suspended_at: string | null
  refunded_at: string | null
  ended_at?: string | null
  ended_reason?: string | null
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
  cancelled: '수강종료',
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
    cancelled: 'bg-slate-100 text-slate-600',
    archived: 'bg-slate-100 text-slate-600',
  }[status]

  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function CourseRow({ row, showStatus }: { row: StudentHistoryRow; showStatus: boolean }) {
  const tenant = useTenantConfig()
  return (
    <tr>
      <td className="admin-table-course">
        <Link
          href={withTenantPrefix(`/dashboard/courses/${row.course_id}/students`, tenant.type)}
          className="admin-history-course"
        >
          {row.course_name}
        </Link>
      </td>
      <td>{[row.cohort_label, row.exam_number, row.series_label].filter(Boolean).join(' · ') || '-'}</td>
      {showStatus ? (
        <td><StatusBadge status={row.lifecycle_status} /></td>
      ) : null}
      <td>{formatShortDate(row.created_at)}</td>
      {showStatus ? (
        <td>
          {row.ended_at ? formatShortDate(row.ended_at) : '-'}
          {row.ended_reason ? <span className="admin-history-caption block">{row.ended_reason}</span> : null}
        </td>
      ) : null}
    </tr>
  )
}

/** 강좌 목록은 어느 구획에서나 같은 표 규격을 쓴다. 이력에서만 상태·종료일 열이 붙는다. */
function CourseTable({ rows, showStatus, emptyLabel }: { rows: StudentHistoryRow[]; showStatus: boolean; emptyLabel: string }) {
  return (
    <div className="admin-table-frame">
      <table className="admin-history-table w-full">
        <thead>
          <tr>
            <th>강좌</th>
            <th>기수·수험번호</th>
            {showStatus ? <th>상태</th> : null}
            <th>등록일</th>
            {showStatus ? <th>종료일</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showStatus ? 5 : 3} className="admin-history-empty">{emptyLabel}</td>
            </tr>
          ) : rows.map((row) => (
            <CourseRow key={`${row.enrollment_id}-${row.lifecycle_status}`} row={row} showStatus={showStatus} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StudentHistoryPanel({ enrollmentId, onClose }: StudentHistoryPanelProps) {
  const titleId = useId()
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

  // 표에 상태 열이 생겼으므로 상태별 소제목 대신 상태 순서로 정렬만 한다.
  const sortedHistory = useMemo(() => {
    const order: StudentHistoryRow['lifecycle_status'][] = ['active', 'suspended', 'refunded', 'cancelled', 'archived']
    return [...(payload?.history ?? [])].sort(
      (a, b) => order.indexOf(a.lifecycle_status) - order.indexOf(b.lifecycle_status),
    )
  }, [payload?.history])

  return (
    <AdminPortal><AnimatePresence>{enrollmentId ? (
      <AdminDrawerSurface labelledBy={titleId} priority={50} onClose={onClose}>
        <div className="admin-dialog-header">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-400">학생 상세</p>
            <h2 id={titleId} className="admin-dialog-title mt-1 break-words text-xl font-bold text-[#1d1d1f]">
              {payload?.student.name ?? '학생 이력'}
            </h2>
          </div>
          <AdminDialogClose onClick={onClose} />
        </div>

        <div className="admin-dialog-body min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="rounded-[8px] bg-white px-4 py-6 text-center text-sm text-slate-500">
              학생 이력을 불러오는 중입니다.
            </p>
          ) : null}

          {error ? (
            <p className="admin-notice admin-notice-danger">{getUserErrorMessage(error)}</p>
          ) : null}

          {payload ? (
            <div className="admin-student-history">
              <section>
                <div className="admin-history-heading">
                  <h3 className="admin-section-title">기본 정보</h3>
                </div>
                <div className="admin-table-frame">
                  <table className="admin-history-table w-full">
                    <tbody>
                      <tr>
                        <th scope="row">연락처</th>
                        <td>{formatPhoneNumber(payload.student.phone)}</td>
                        <th scope="row">수험번호</th>
                        <td>{payload.student.exam_number || '-'}</td>
                      </tr>
                      <tr>
                        <th scope="row">기수</th>
                        <td>{payload.student.cohort_label || '-'}</td>
                        <th scope="row">인증 방식</th>
                        <td>{getAuthMethodLabel(payload.student.auth_method)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {payload.resolution === 'identity_fallback' ? (
                  <p className="admin-history-notice">
                    student_id 연결이 없어 이름과 연락처 기준으로 조회했습니다.
                  </p>
                ) : null}
              </section>

              <section>
                <div className="admin-history-heading">
                  <h3 className="admin-section-title">현재 수강중인 강좌</h3>
                  <span className="admin-history-count">{payload.active.length}개</span>
                </div>
                <CourseTable rows={payload.active} showStatus={false} emptyLabel="현재 수강중인 강좌가 없습니다." />
              </section>

              <section>
                <div className="admin-history-heading">
                  <h3 className="admin-section-title">전체 수강 이력</h3>
                  <span className="admin-history-count">{payload.history.length}개</span>
                </div>
                <CourseTable rows={sortedHistory} showStatus emptyLabel="수강 이력이 없습니다." />
              </section>
            </div>
          ) : null}
        </div>
      </AdminDrawerSurface>
    ) : null}</AnimatePresence></AdminPortal>
  )
}
