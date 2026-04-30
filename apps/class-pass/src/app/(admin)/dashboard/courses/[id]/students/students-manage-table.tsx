import { useState, type MouseEvent } from 'react'
import type { Enrollment, EnrollmentFieldDef } from '@/types/database'
import { formatDateTime } from '@/lib/utils'
import type { EnrollmentManageStatusFilter } from './students-page-types'

const STATUS_FILTER_OPTIONS: Array<{ value: EnrollmentManageStatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '수강중' },
  { value: 'refunded', label: '환불완료' },
  { value: 'suspended', label: '정지' },
]

function isEnrollmentSuspended(enrollment: Pick<Enrollment, 'status' | 'suspended_at'>) {
  return enrollment.status === 'active' && Boolean(enrollment.suspended_at)
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

type StudentsManageTableProps = {
  filtered: Enrollment[]
  search: string
  statusFilter: EnrollmentManageStatusFilter
  customFields: EnrollmentFieldDef[]
  attendanceEnabled: boolean
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: EnrollmentManageStatusFilter) => void
  onOpenDetail: (enrollment: Enrollment) => void
  onEdit: (enrollment: Enrollment) => void
  onResetPin: (enrollment: Enrollment) => void
  onApproveDeviceReRegistration: (enrollment: Enrollment) => void
  onResetAttendanceDevice: (enrollment: Enrollment) => void
  onSuspend: (enrollment: Enrollment) => void
  onUnsuspend: (enrollment: Enrollment) => void
  onDelete: (enrollment: Enrollment) => void
}

export function StudentsManageTable({
  filtered,
  search,
  statusFilter,
  customFields,
  attendanceEnabled,
  onSearchChange,
  onStatusFilterChange,
  onOpenDetail,
  onEdit,
  onResetPin,
  onApproveDeviceReRegistration,
  onResetAttendanceDevice,
  onSuspend,
  onUnsuspend,
  onDelete,
}: StudentsManageTableProps) {
  const [expandedMobileId, setExpandedMobileId] = useState<number | null>(null)

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
                onClick={() => onOpenDetail(enrollment)}
                className={suspended ? 'cursor-pointer bg-amber-50/30 px-4 py-3 transition-transform duration-200 ease-ios hover:bg-amber-50/70 active:scale-[0.98]' : 'cursor-pointer px-4 py-3 transition-transform duration-200 ease-ios hover:bg-slate-50/70 active:scale-[0.98]'}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 min-w-11 items-center justify-center rounded-[8px] bg-slate-100 px-2 text-xs font-bold text-slate-700">
                    {enrollment.exam_number || '-'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{enrollment.name}</p>
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
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${seriesMeta.className}`}>
                        {seriesMeta.label}
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
                            <p className="text-[11px] font-semibold text-slate-400">등록일</p>
                            <p className="mt-0.5 text-slate-700">{formatDateTime(enrollment.created_at).split(' ')[0]}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">출석 기기</p>
                            <p className="mt-0.5 text-slate-700">{attendanceEnabled ? attendanceDeviceMeta.label : '-'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400">직렬</p>
                            <p className="mt-0.5 text-slate-700">{seriesMeta.label}</p>
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
                <th className="px-5 py-3">응시번호</th>
                <th className="px-3 py-3">이름</th>
                <th className="px-3 py-3">연락처</th>
                <th className="px-3 py-3">직렬</th>
                {customFields.map((field) => (
                  <th key={field.key} className="hidden px-3 py-3 lg:table-cell">
                    {field.label}
                  </th>
                ))}
                <th className="px-3 py-3">상태</th>
                {attendanceEnabled ? <th className="hidden px-3 py-3 xl:table-cell">출석 기기</th> : null}
                <th className="hidden px-3 py-3 md:table-cell">등록일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((enrollment) => {
                const suspended = isEnrollmentSuspended(enrollment)
                const attendanceDeviceMeta = getAttendanceDeviceMeta(enrollment)
                const authMethodMeta = getAuthMethodMeta(enrollment)
                const seriesMeta = getSeriesMeta(enrollment)

                return (
                  <tr
                    key={enrollment.id}
                    title={getSuspensionTooltip(enrollment)}
                    onClick={() => onOpenDetail(enrollment)}
                    className={suspended ? 'cursor-pointer bg-amber-50/40 transition hover:bg-amber-50/70' : 'cursor-pointer transition hover:bg-slate-50/60'}
                  >
                    <td className="px-5 py-3 text-gray-500">{enrollment.exam_number || '-'}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900">
                      <div className="flex flex-col gap-1">
                        <span>{enrollment.name}</span>
                        <span
                          className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${authMethodMeta.className}`}
                        >
                          {authMethodMeta.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{enrollment.phone}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${seriesMeta.className}`}>
                        {seriesMeta.label}
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
                      {formatDateTime(enrollment.created_at).split(' ')[0]}
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
    </section>
  )
}
