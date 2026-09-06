import { AdminPagination as PaginationControls } from "@/components/admin/AdminPagination"
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { StudentRowActions } from './StudentRowActions'
import { EnrollmentMemoDialog } from './EnrollmentMemoDialog'
import { StudentMemoCell, useEnrollmentAdminMemos } from './StudentMemoCell'
import {
  ENROLLMENT_STUDENT_TYPE_LABEL,
  type Enrollment,
  type EnrollmentFieldDef,
} from '@/types/database'
import { getEnrollmentLifecycleStatus } from '@/lib/enrollment-status'
import { normalizeGenderLabel } from '@/lib/gender'
import { formatDateTime, formatShortDate } from '@/lib/utils'
import { SortableHeader, sortRows, useSortState } from '@/components/admin/sortable-header'
import type { EnrollmentManageStatusFilter } from './students-page-types'

const STATUS_FILTER_OPTIONS: Array<{ value: EnrollmentManageStatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '수강중' },
  { value: 'refunded', label: '환불완료' },
  { value: 'cancelled', label: '수강종료' },
  { value: 'suspended', label: '정지' },
]

function isEnrollmentSuspended(enrollment: Pick<Enrollment, 'status' | 'suspended_at'>) {
  return getEnrollmentLifecycleStatus(enrollment) === 'suspended'
}

function getSuspensionTooltip(enrollment: Enrollment) {
  if (!isEnrollmentSuspended(enrollment)) {
    return undefined
  }

  const lines = [`정지 시각: ${formatDateTime(enrollment.suspended_at)}`]
  const reason = enrollment.suspension_reason?.trim()
  if (reason) {
    lines.push(`사유: ${reason}`)
  }

  return lines.join('\n')
}

function getAttendanceDeviceMeta(enrollment: Enrollment) {
  const state = enrollment.attendance_device
  if (!state || state.status === 'unregistered') {
    return {
      label: '미등록',
      className: 'bg-slate-100 text-slate-500',
      title: '아직 출석 기기가 등록되지 않았습니다.',
    }
  }

  const registeredCount = state.registered_count ?? 1
  const maxDeviceCount = state.max_registered_count ?? 3
  const countLabel = `${registeredCount}/${maxDeviceCount}`
  const recentAutoReplacedCount = state.recent_auto_replaced_count ?? 0
  const hasAutoReplacedWarning = Boolean(state.auto_replaced_warning) || recentAutoReplacedCount >= 2

  if (state.status === 'pending_reset') {
    return {
      label: `승인 대기 ${countLabel}`,
      className: 'bg-amber-50 text-amber-700',
      title: [
        `등록된 브라우저: ${countLabel}`,
        state.reset_requested_at ? `요청 시각: ${formatDateTime(state.reset_requested_at)}` : null,
        state.reset_requested_user_agent ? `기기 정보: ${state.reset_requested_user_agent}` : null,
      ].filter(Boolean).join('\n') || '추가 기기 승인 대기 중입니다.',
    }
  }

  if (hasAutoReplacedWarning) {
    return {
      label: `변경 잦음 ${countLabel}`,
      className: 'bg-amber-50 text-amber-700',
      title: [
        `등록된 브라우저: ${countLabel}`,
        `최근 자동 교체: ${recentAutoReplacedCount}회`,
        state.last_auto_replaced_at ? `마지막 자동 교체: ${formatDateTime(state.last_auto_replaced_at)}` : null,
        state.last_seen_at ? `마지막 확인: ${formatDateTime(state.last_seen_at)}` : null,
      ].filter(Boolean).join('\n'),
    }
  }

  return {
    label: `등록 ${countLabel}`,
    className: 'bg-blue-50 text-blue-700',
    title: [
      `등록된 브라우저: ${countLabel}`,
      state.last_seen_at ? `마지막 확인: ${formatDateTime(state.last_seen_at)}` : null,
    ].filter(Boolean).join('\n') || '출석 기기가 등록되어 있습니다.',
  }
}

function getAuthMethodMeta(enrollment: Enrollment) {
  const method = enrollment.student_profile?.auth_method

  if (method === 'birth_date') {
    return {
      label: '생년월일 인증',
      className: 'bg-blue-50 text-blue-700',
    }
  }

  if (method === 'pin') {
    return {
      label: 'PIN 인증',
      className: 'bg-violet-50 text-violet-700',
    }
  }

  return {
    label: '인증 미설정',
    className: 'bg-slate-100 text-slate-500',
  }
}

function getSeriesMeta(enrollment: Enrollment) {
  const group = enrollment.series_group ?? 'public'
  return {
    label: enrollment.series?.trim() || (group === 'career' ? '경채' : '공채'),
    className: group === 'career' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600',
  }
}

function getStudentTypeMeta(enrollment: Enrollment) {
  const studentType = enrollment.student_type ?? 'general'

  return {
    label: ENROLLMENT_STUDENT_TYPE_LABEL[studentType],
    className: studentType === 'academy' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600',
  }
}

function getCohortLabel(enrollment: Enrollment) {
  return enrollment.cohort_label?.trim() || '-'
}

function getGenderLabel(enrollment: Enrollment) {
  return normalizeGenderLabel(enrollment.gender) || '-'
}

type StudentsManageTableProps = {
  courseName?: string
  filtered: Enrollment[]
  summary: {
    active: number
    refunded: number
    cancelled?: number
    suspended: number
  }
  search: string
  statusFilter: EnrollmentManageStatusFilter
  customFields: EnrollmentFieldDef[]
  attendanceEnabled: boolean
  currentPage: number
  pageCount: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: EnrollmentManageStatusFilter) => void
  onResetFilters: () => void
  onOpenDetail: (enrollment: Enrollment) => void
  onOpenStudentHistory: (enrollment: Enrollment) => void
  onEdit: (enrollment: Enrollment) => void
  onResetPin: (enrollment: Enrollment) => void
  onApproveDeviceReRegistration: (enrollment: Enrollment) => void
  onResetAttendanceDevice: (enrollment: Enrollment) => void
  onSuspend: (enrollment: Enrollment) => void
  onUnsuspend: (enrollment: Enrollment) => void
  onDelete: (enrollment: Enrollment) => void
}

export function StudentsManageTable({
  courseName = '',
  filtered,
  summary,
  search,
  statusFilter,
  customFields,
  attendanceEnabled,
  currentPage,
  pageCount,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onStatusFilterChange,
  onResetFilters,
  onOpenDetail,
  onOpenStudentHistory,
  onEdit,
  onResetPin,
  onApproveDeviceReRegistration,
  onResetAttendanceDevice,
  onSuspend,
  onUnsuspend,
  onDelete,
}: StudentsManageTableProps) {
  const [expandedMobileId, setExpandedMobileId] = useState<number | null>(null)
  const [showDetailedColumns, setShowDetailedColumns] = useState(false)
  const [memoTarget, setMemoTarget] = useState<Enrollment | null>(null)
  const {state:memoState,update:updateMemo}=useEnrollmentAdminMemos(filtered)
  const { sort, toggle } = useSortState<
    'cohort_label' | 'exam_number' | 'name' | 'gender' | 'phone' | 'series' | 'student_type' | 'status' | 'created_at'
  >('created_at', 'desc')
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort.key, sort.dir) as unknown as typeof filtered
  const allCount = summary.active + summary.refunded + summary.suspended + (summary.cancelled ?? 0)
  const hasFilters = Boolean(search.trim()) || statusFilter !== 'all'
  const sortLabels = { cohort_label: '기수', exam_number: '응시번호', name: '이름', gender: '성별', phone: '연락처', series: '직렬', student_type: '학원구분', status: '상태', created_at: '등록일' }

  function renderActionButtons(enrollment: Enrollment, suspended: boolean) {
    return <StudentRowActions enrollment={enrollment} suspended={suspended} attendanceEnabled={attendanceEnabled}
      onOpenDetail={onOpenDetail} onEdit={onEdit} onResetPin={onResetPin}
      onApproveDeviceReRegistration={onApproveDeviceReRegistration} onResetAttendanceDevice={onResetAttendanceDevice}
      onSuspend={onSuspend} onUnsuspend={onUnsuspend} onDelete={onDelete} />
  }

  function renderMemo(enrollment:Enrollment) {
    return <StudentMemoCell enrollment={enrollment} memo={memoState.memos[enrollment.id]}
      status={memoState.status} onOpen={()=>setMemoTarget(enrollment)} />
  }

  return (
    <>
    <section className="admin-table-frame overflow-hidden bg-white">
      <div className="admin-students-toolbar">
        <div className="admin-students-query-group">
          <input
            aria-label="수강생 검색"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="이름, 연락처, 응시번호 검색.."
            className="admin-students-search border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div
            className="admin-students-summary inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[8px] bg-[#f5f5f7] px-3 py-2 text-xs font-semibold text-[#1d1d1f]"
            title={`전체 등록 ${allCount.toLocaleString('ko-KR')}명 · 수강중 ${summary.active.toLocaleString('ko-KR')}명 · 정지 ${summary.suspended.toLocaleString('ko-KR')}명 · 환불 ${summary.refunded.toLocaleString('ko-KR')}명 · 수강종료 ${(summary.cancelled ?? 0).toLocaleString('ko-KR')}명`}
          >
            <span className="whitespace-nowrap">
              <span className="text-slate-500">전체 등록</span>{' '}
              <span>{allCount.toLocaleString('ko-KR')}명</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="whitespace-nowrap">
              <span className="text-slate-500">수강중</span>{' '}
              <span>{summary.active.toLocaleString('ko-KR')}명</span>
            </span>
            {summary.suspended > 0 ? (
              <>
                <span className="text-slate-300">·</span>
                <span className="whitespace-nowrap">
                  <span className="text-slate-500">정지</span>{' '}
                  <span>{summary.suspended.toLocaleString('ko-KR')}명</span>
                </span>
              </>
            ) : null}
            <span className="text-slate-300">·</span>
            <span className="whitespace-nowrap">
              <span className="text-slate-500">환불</span>{' '}
              <span>{summary.refunded.toLocaleString('ko-KR')}명</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="whitespace-nowrap">
              <span className="text-slate-500">수강종료</span>{' '}
              <span>{(summary.cancelled ?? 0).toLocaleString('ko-KR')}명</span>
            </span>
          </div>
        </div>
        <select className="admin-students-status-select" aria-label="수강생 상태 필터" value={statusFilter}
          onChange={event => onStatusFilterChange(event.target.value as EnrollmentManageStatusFilter)}>
          {STATUS_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div
          aria-label="수강생 상태 필터"
          role="group"
          className="admin-students-status-filter admin-choice-group"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusFilterChange(option.value)}
              aria-pressed={statusFilter === option.value}
              className="admin-choice-button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-roster-view-options hidden md:flex">
        <span>{showDetailedColumns ? '전체 정보 표시' : '기본 정보와 메모 표시'}{sort.key ? ` · ${sortLabels[sort.key]} ${sort.dir === 'asc' ? '오름차순' : '내림차순'}` : ''}</span>
        <button type="button" className="admin-button" aria-label="상세 열 표시" aria-pressed={showDetailedColumns}
          onClick={() => setShowDetailedColumns(value => !value)}>
          {showDetailedColumns ? '상세 열 접기' : '상세 열 표시'}
        </button>
      </div>

      {hasFilters ? (
        <div className="admin-roster-feedback">
          <span role="status" aria-live="polite">조회 결과 {totalCount.toLocaleString('ko-KR')}명</span>
          <button type="button" className="admin-button" onClick={onResetFilters}>조건 초기화</button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">
          {hasFilters ? '선택한 조건에 맞는 수강생이 없습니다. 조건을 초기화하거나 검색어를 변경해 주세요.' : '등록된 수강생이 없습니다.'}
        </p>
      ) : (
        <>
        <div className="divide-y divide-slate-100 md:hidden">
          {filtered.map((enrollment) => {
            const suspended = isEnrollmentSuspended(enrollment)
            const attendanceDeviceMeta = getAttendanceDeviceMeta(enrollment)
            const authMethodMeta = getAuthMethodMeta(enrollment)
            const seriesMeta = getSeriesMeta(enrollment)
            const studentTypeMeta = getStudentTypeMeta(enrollment)
            const expanded = expandedMobileId === enrollment.id
            const visibleCustomFields = customFields
              .map((field) => ({
                key: field.key,
                label: field.label,
                value: (enrollment.custom_data ?? {})[field.key],
              }))
              .filter((field) => field.value)

            return (
              <article
                key={enrollment.id}
                title={getSuspensionTooltip(enrollment)}
                className={suspended ? 'bg-amber-50/30 px-4 py-3' : 'px-4 py-3'}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 min-w-11 items-center justify-center rounded-[8px] bg-slate-100 px-2 text-xs font-bold text-slate-700">
                    {getCohortLabel(enrollment)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenStudentHistory(enrollment)
                          }}
                          className="max-w-full truncate text-left text-sm font-semibold text-gray-900 transition hover:text-[#0071e3]"
                        >
                          {enrollment.name}
                        </button>
                        <p className="mt-0.5 truncate text-xs text-gray-400">수험번호 {enrollment.exam_number || '-'}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{enrollment.phone || '연락처 없음'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setExpandedMobileId(expanded ? null : enrollment.id)
                        }}
                        className="shrink-0 rounded-[8px] bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
                        aria-expanded={expanded}
                      >
                        관리
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          enrollment.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : enrollment.status === 'cancelled' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {enrollment.status === 'cancelled' ? '수강종료' : enrollment.status === 'active' ? '활성' : '환불'}
                      </span>
                      {suspended ? (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          정지
                        </span>
                      ) : null}
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${authMethodMeta.className}`}>
                        {authMethodMeta.label}
                      </span>
                      {enrollment.student_profile?.identity_mismatch ? (
                        <span
                          title="수강 정보와 연결된 학생 프로필의 이름/연락처/수험번호가 다릅니다."
                          className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                        >
                          연결 확인
                        </span>
                      ) : null}
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${seriesMeta.className}`}>
                        {seriesMeta.label}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${studentTypeMeta.className}`}>
                        {studentTypeMeta.label}
                      </span>
                      {attendanceEnabled ? (
                        <span
                          title={attendanceDeviceMeta.title}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${attendanceDeviceMeta.className}`}
                        >
                          기기 {attendanceDeviceMeta.label}
                        </span>
                      ) : null}
                    </div>

                    <div className="admin-mobile-memo"><span>메모</span>{renderMemo(enrollment)}</div>
                    {expanded ? (
                      <div className="mt-3 rounded-[8px] bg-slate-50 p-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">기수</p>
                            <p className="mt-0.5 text-slate-700">{getCohortLabel(enrollment)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">등록일</p>
                            <p className="mt-0.5 text-slate-700">{formatShortDate(enrollment.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">출석 기기</p>
                            <p className="mt-0.5 text-slate-700">{attendanceEnabled ? attendanceDeviceMeta.label : '-'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">직렬</p>
                            <p className="mt-0.5 text-slate-700">{seriesMeta.label}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">학원구분</p>
                            <p className="mt-0.5 text-slate-700">{studentTypeMeta.label}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">성별</p>
                            <p className="mt-0.5 text-slate-700">{getGenderLabel(enrollment)}</p>
                          </div>
                          {visibleCustomFields.map((field) => (
                            <div key={field.key} className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-slate-400">{field.label}</p>
                              <p className="mt-0.5 truncate text-slate-700">{field.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          {renderActionButtons(enrollment, suspended)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="admin-roster-scroll hidden md:block" role="region" aria-label="수강생 명단 표" tabIndex={0}>
          <table className="admin-roster-table w-full text-sm" data-detailed={showDetailedColumns}>
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                <SortableHeader label="응시번호" sortKey="exam_number" sort={sort} onSort={toggle} className="px-5 py-3" />
                <SortableHeader label="기수" sortKey="cohort_label" sort={sort} onSort={toggle} className="admin-roster-extra px-3 py-3" />
                <SortableHeader label="이름" sortKey="name" sort={sort} onSort={toggle} className="admin-roster-identity px-3 py-3" />
                <SortableHeader label="성별" sortKey="gender" sort={sort} onSort={toggle} className="admin-roster-extra px-3 py-3" />
                <SortableHeader label="연락처" sortKey="phone" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="직렬" sortKey="series" sort={sort} onSort={toggle} className="admin-roster-extra px-3 py-3" />
                <SortableHeader label="학원구분" sortKey="student_type" sort={sort} onSort={toggle} className="admin-roster-extra px-3 py-3" />
                {customFields.map((field) => (
                  <th key={field.key} className="admin-roster-extra px-3 py-3">
                    {field.label}
                  </th>
                ))}
                <SortableHeader label="상태" sortKey="status" sort={sort} onSort={toggle} className="px-3 py-3" />
                {attendanceEnabled ? <th className="admin-roster-extra px-3 py-3">출석 기기</th> : null}
                <SortableHeader label="등록일" sortKey="created_at" sort={sort} onSort={toggle} className="admin-roster-extra px-3 py-3" />
                <th className="px-3 py-3">메모</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((enrollment) => {
                const suspended = isEnrollmentSuspended(enrollment)
                const attendanceDeviceMeta = getAttendanceDeviceMeta(enrollment)
                const authMethodMeta = getAuthMethodMeta(enrollment)
                const seriesMeta = getSeriesMeta(enrollment)
                const studentTypeMeta = getStudentTypeMeta(enrollment)

                return (
                  <tr
                    key={enrollment.id}
                    title={getSuspensionTooltip(enrollment)}
                    // 고정된 이름 열은 자기 배경을 칠하므로 행 색을 덮는다. 정지 여부를 셀에서도 읽을 수 있게 표시한다.
                    data-suspended={suspended}
                    className={suspended ? 'bg-amber-50/40 transition hover:bg-amber-50/70' : 'transition hover:bg-slate-50/60'}
                  >
                    <td className="px-5 py-3 text-gray-500">{enrollment.exam_number || '-'}</td>
                    <td className="admin-roster-extra px-3 py-3 text-gray-500">{getCohortLabel(enrollment)}</td>
                    <td className="admin-roster-identity px-3 py-3 font-semibold text-gray-900">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenStudentHistory(enrollment)
                          }}
                          className="admin-table-name w-fit text-left transition hover:text-[#0071e3]"
                        >
                          {enrollment.name}
                        </button>
                        <span
                          className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${authMethodMeta.className}`}
                        >
                          {authMethodMeta.label}
                        </span>
                        {enrollment.student_profile?.identity_mismatch ? (
                          <span
                            title="수강 정보와 연결된 학생 프로필의 이름/연락처/수험번호가 다릅니다."
                            className="inline-flex w-fit rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                          >
                            연결 확인
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="admin-roster-extra px-3 py-3 text-gray-500">{getGenderLabel(enrollment)}</td>
                    <td className="px-3 py-3 text-gray-500">{enrollment.phone}</td>
                    <td className="admin-roster-extra px-3 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${seriesMeta.className}`}>
                        {seriesMeta.label}
                      </span>
                    </td>
                    <td className="admin-roster-extra px-3 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${studentTypeMeta.className}`}>
                        {studentTypeMeta.label}
                      </span>
                    </td>
                    {customFields.map((field) => (
                      <td key={field.key} className="admin-roster-extra px-3 py-3 text-gray-500">
                        {(enrollment.custom_data ?? {})[field.key] || '-'}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            enrollment.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : enrollment.status === 'cancelled' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {enrollment.status === 'cancelled' ? '수강종료' : enrollment.status === 'active' ? '활성' : '환불'}
                        </span>
                        {suspended ? (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            정지
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {attendanceEnabled ? (
                      <td className="admin-roster-extra px-3 py-3">
                        <span
                          title={attendanceDeviceMeta.title}
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${attendanceDeviceMeta.className}`}
                        >
                          {attendanceDeviceMeta.label}
                        </span>
                      </td>
                    ) : null}
                    <td className="admin-roster-extra px-3 py-3 text-xs text-gray-400">
                      {formatShortDate(enrollment.created_at)}
                    </td>
                    <td className="admin-table-memo px-3 py-3">{renderMemo(enrollment)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {renderActionButtons(enrollment, suspended)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      <PaginationControls
        currentPage={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </section>
    <AnimatePresence>{memoTarget ? <EnrollmentMemoDialog key={memoTarget.id} enrollment={memoTarget} courseName={courseName} onChange={updateMemo} onClose={()=>setMemoTarget(null)} /> : null}</AnimatePresence>
    </>
  )
}
