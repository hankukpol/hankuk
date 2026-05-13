import { useState, type MouseEvent } from 'react'
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
  filtered: Enrollment[]
  summary: {
    total: number
    active: number
    refunded: number
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

function PaginationControls({
  currentPage, pageCount, pageSize, totalCount, onPageChange, onPageSizeChange,
}: {
  currentPage: number; pageCount: number; pageSize: number; totalCount: number
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void
}) {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>{start}–{end} / {totalCount}명</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none"
        >
          <option value={20}>20명</option>
          <option value={50}>50명</option>
          <option value={100}>100명</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          이전
        </button>
        <span className="text-sm font-medium text-slate-600">
          {currentPage} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= pageCount}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          다음
        </button>
      </div>
    </div>
  )
}

export function StudentsManageTable({
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
  const { sort, toggle } = useSortState<
    'cohort_label' | 'exam_number' | 'name' | 'gender' | 'phone' | 'series' | 'student_type' | 'status' | 'created_at'
  >('created_at', 'desc')
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort.key, sort.dir) as unknown as typeof filtered

  function handleActionClick(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.stopPropagation()
    action()
  }

  function renderActionButtons(enrollment: Enrollment, suspended: boolean, density: 'mobile' | 'desktop') {
    const baseClass = density === 'mobile'
      ? 'rounded-[8px] px-3 py-2 text-center text-xs font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100'
      : 'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100'
    const attendanceDeviceStatus = enrollment.attendance_device?.status ?? 'unregistered'
    const canResetAttendanceDevice = (enrollment.attendance_device?.registered_count ?? 0) > 0

    return (
      <>
        <button
          type="button"
          onClick={(event) => handleActionClick(event, () => onOpenDetail(enrollment))}
          className={`${baseClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
        >
          상세
        </button>
        <button
          type="button"
          onClick={(event) => handleActionClick(event, () => onEdit(enrollment))}
          className={`${baseClass} bg-slate-100 text-slate-600 hover:bg-slate-200`}
        >
          편집
        </button>
        {enrollment.student_profile?.auth_method === 'pin' && enrollment.student_id ? (
          <button
            type="button"
            onClick={(event) => handleActionClick(event, () => onResetPin(enrollment))}
            className={`${baseClass} bg-violet-50 text-violet-700 hover:bg-violet-100`}
          >
            PIN 재설정
          </button>
        ) : null}
        {attendanceEnabled && attendanceDeviceStatus === 'pending_reset' ? (
          <button
            type="button"
            onClick={(event) => handleActionClick(event, () => onApproveDeviceReRegistration(enrollment))}
            className={`${baseClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
          >
            기기 승인
          </button>
        ) : null}
        {attendanceEnabled && attendanceDeviceStatus !== 'pending_reset' ? (
          <button
            type="button"
            onClick={(event) => handleActionClick(event, () => onResetAttendanceDevice(enrollment))}
            disabled={!canResetAttendanceDevice}
            title={canResetAttendanceDevice ? undefined : '아직 등록된 출석 기기가 없습니다.'}
            className={`${baseClass} border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white`}
          >
            기기 초기화
          </button>
        ) : null}
        {enrollment.status === 'active' && !suspended ? (
          <button
            type="button"
            onClick={(event) => handleActionClick(event, () => onSuspend(enrollment))}
            className={`${baseClass} border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50`}
          >
            정지
          </button>
        ) : null}
        {enrollment.status === 'active' && suspended ? (
          <button
            type="button"
            onClick={(event) => handleActionClick(event, () => onUnsuspend(enrollment))}
            className={`${baseClass} border border-emerald-300 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50`}
          >
            정지 해제
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => handleActionClick(event, () => onDelete(enrollment))}
          className={`${baseClass} bg-red-50 text-red-600 hover:bg-red-100`}
        >
          삭제
        </button>
      </>
    )
  }

  return (
    <section className="overflow-hidden rounded-[8px] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="이름, 연락처, 응시번호 검색.."
          className="w-full rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 sm:w-64 sm:py-2"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[8px] bg-[#f5f5f7] px-3 py-2 text-xs font-semibold text-[#1d1d1f]"
            title={`전체 등록 ${summary.total.toLocaleString('ko-KR')}명 · 수강중 ${summary.active.toLocaleString('ko-KR')}명 · 정지 ${summary.suspended.toLocaleString('ko-KR')}명 · 환불 ${summary.refunded.toLocaleString('ko-KR')}명`}
          >
            <span className="whitespace-nowrap">
              <span className="text-slate-500">전체 등록</span>{' '}
              <span>{summary.total.toLocaleString('ko-KR')}명</span>
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
          </div>
          <div
            aria-label="수강생 상태 필터"
            className="grid grid-cols-4 gap-0.5 rounded-[10px] bg-[#f5f5f7] p-1 sm:flex sm:shrink-0"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusFilterChange(option.value)}
                className={`whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-ios active:scale-[0.97] sm:min-w-14 ${
                  statusFilter === option.value
                    ? 'bg-white text-[#0071e3] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                    : 'text-slate-500 hover:text-[#1d1d1f]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">
          {search ? '검색 결과 없음' : '등록된 수강생이 없습니다.'}
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
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {enrollment.status === 'active' ? '활성' : '환불'}
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
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {renderActionButtons(enrollment, suspended, 'mobile')}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                <SortableHeader label="응시번호" sortKey="exam_number" sort={sort} onSort={toggle} className="px-5 py-3" />
                <SortableHeader label="기수" sortKey="cohort_label" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="이름" sortKey="name" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="성별" sortKey="gender" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="연락처" sortKey="phone" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="직렬" sortKey="series" sort={sort} onSort={toggle} className="px-3 py-3" />
                <SortableHeader label="학원구분" sortKey="student_type" sort={sort} onSort={toggle} className="px-3 py-3" />
                {customFields.map((field) => (
                  <th key={field.key} className="hidden px-3 py-3 lg:table-cell">
                    {field.label}
                  </th>
                ))}
                <SortableHeader label="상태" sortKey="status" sort={sort} onSort={toggle} className="px-3 py-3" />
                {attendanceEnabled ? <th className="hidden px-3 py-3 xl:table-cell">출석 기기</th> : null}
                <SortableHeader label="등록일" sortKey="created_at" sort={sort} onSort={toggle} className="hidden px-3 py-3 md:table-cell" />
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
                    className={suspended ? 'bg-amber-50/40 transition hover:bg-amber-50/70' : 'transition hover:bg-slate-50/60'}
                  >
                    <td className="px-5 py-3 text-gray-500">{enrollment.exam_number || '-'}</td>
                    <td className="px-3 py-3 text-gray-500">{getCohortLabel(enrollment)}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenStudentHistory(enrollment)
                          }}
                          className="w-fit text-left transition hover:text-[#0071e3]"
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
                    <td className="px-3 py-3 text-gray-500">{getGenderLabel(enrollment)}</td>
                    <td className="px-3 py-3 text-gray-500">{enrollment.phone}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${seriesMeta.className}`}>
                        {seriesMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${studentTypeMeta.className}`}>
                        {studentTypeMeta.label}
                      </span>
                    </td>
                    {customFields.map((field) => (
                      <td key={field.key} className="hidden px-3 py-3 text-gray-500 lg:table-cell">
                        {(enrollment.custom_data ?? {})[field.key] || '-'}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            enrollment.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {enrollment.status === 'active' ? '활성' : '환불'}
                        </span>
                        {suspended ? (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            정지
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {attendanceEnabled ? (
                      <td className="hidden px-3 py-3 xl:table-cell">
                        <span
                          title={attendanceDeviceMeta.title}
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${attendanceDeviceMeta.className}`}
                        >
                          {attendanceDeviceMeta.label}
                        </span>
                      </td>
                    ) : null}
                    <td className="hidden px-3 py-3 text-xs text-gray-400 md:table-cell">
                      {formatShortDate(enrollment.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {renderActionButtons(enrollment, suspended, 'desktop')}
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
  )
}
