'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DesignatedSeatAttendanceDashboard,
  DesignatedSeatAttendanceRecord,
  EnrollmentCareNoteRecord,
  EnrollmentCareState,
} from '@/types/database'

type RecordTab = 'all' | 'present' | 'absent'

type SortKey =
  | 'consecutiveAbsences'
  | 'cumulativeAbsences'
  | 'lastAttendedDate'
  | 'careState'
  | 'studentName'
  | 'examNumber'

type SortConfig = { key: SortKey; direction: 'asc' | 'desc' }

const CARE_STATE_ORDER: Record<EnrollmentCareState, number> = {
  needs_contact: 0,
  pending: 1,
  meeting_scheduled: 2,
  contacted: 3,
}

const CARE_STATE_NEXT: Record<EnrollmentCareState, EnrollmentCareState> = {
  pending: 'needs_contact',
  needs_contact: 'contacted',
  contacted: 'meeting_scheduled',
  meeting_scheduled: 'pending',
}

const CARE_STATE_LABEL: Record<EnrollmentCareState, string> = {
  pending: '대기',
  needs_contact: '연락 필요',
  contacted: '연락 완료',
  meeting_scheduled: '면담 예정',
}

function formatDateTimeShort(value: string | null) {
  if (!value) {
    return '-'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function formatTime(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function normalizeAttendanceSearchValue(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '').replace(/-/g, '').toLowerCase()
}

function matchesFields(keyword: string, fields: Array<string | null | undefined>) {
  const normalizedKeyword = normalizeAttendanceSearchValue(keyword)
  if (!normalizedKeyword) {
    return true
  }

  return fields
    .map((value) => normalizeAttendanceSearchValue(value))
    .some((value) => value.includes(normalizedKeyword))
}

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function StatCard(props: {
  label: string
  value: string | number
  hint?: string
  valueClassName?: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold text-slate-500">{props.label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${props.valueClassName ?? 'text-slate-900'}`}>
        {props.value}
      </p>
      {props.hint ? <p className="mt-1 text-xs text-slate-400">{props.hint}</p> : null}
    </article>
  )
}

function TabButton(props: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.97] ${
        props.active
          ? 'border-[#1d1d1f] text-[#1d1d1f]'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-[#1d1d1f]'
      }`}
    >
      <span>{props.label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          props.active ? 'bg-[#1d1d1f] text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {props.count}
      </span>
    </button>
  )
}

function StatusChip(props: { status: DesignatedSeatAttendanceRecord['status'] }) {
  return props.status === 'present' ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      출석
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
      결석
    </span>
  )
}

function SortableTh(props: {
  label: string
  sortKey: SortKey
  currentSort: SortConfig | null
  onToggle: (key: SortKey) => void
  className?: string
}) {
  const active = props.currentSort?.key === props.sortKey
  const direction = active ? props.currentSort?.direction : null
  const arrow = direction === 'desc' ? '↓' : direction === 'asc' ? '↑' : '↕'

  return (
    <th className={`px-4 py-3 ${props.className ?? ''}`}>
      <button
        type="button"
        onClick={() => props.onToggle(props.sortKey)}
        className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition-colors hover:bg-slate-100 ${
          active ? 'text-[#1d1d1f]' : 'text-slate-500'
        }`}
      >
        <span>{props.label}</span>
        <span className={active ? 'text-[#0071e3]' : 'text-slate-400'}>{arrow}</span>
      </button>
    </th>
  )
}

function CareStateChip(props: {
  state: EnrollmentCareState
  pending?: boolean
  onClick: () => void
}) {
  const palette: Record<EnrollmentCareState, string> = {
    pending: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    needs_contact: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
    contacted: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
    meeting_scheduled: 'bg-violet-100 text-violet-700 hover:bg-violet-200',
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.pending}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 ${palette[props.state]}`}
      title="클릭하여 다음 상태로 변경"
    >
      {CARE_STATE_LABEL[props.state]}
    </button>
  )
}

function CareNoteCell(props: {
  record: DesignatedSeatAttendanceRecord
  onSubmit: (body: string) => Promise<void>
  onLoadHistory: () => Promise<EnrollmentCareNoteRecord[]>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [hoverHistory, setHoverHistory] = useState<EnrollmentCareNoteRecord[] | null>(null)
  const [hoverLoading, setHoverLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function commit() {
    const trimmed = value.trim()
    if (!trimmed || submitting) {
      setEditing(false)
      setValue('')
      return
    }
    setSubmitting(true)
    try {
      await props.onSubmit(trimmed)
      setValue('')
      setEditing(false)
      setHoverHistory(null)
    } catch {
      // 실패 시 입력값과 편집 모드 유지하여 사용자가 재시도하거나 복사할 수 있게 함
    } finally {
      setSubmitting(false)
    }
  }

  async function handleHoverEnter() {
    if (hoverHistory != null || hoverLoading) {
      return
    }
    setHoverLoading(true)
    try {
      const notes = await props.onLoadHistory()
      setHoverHistory(notes)
    } finally {
      setHoverLoading(false)
    }
  }

  const latest = props.record.latestNote

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          } else if (event.key === 'Escape') {
            setEditing(false)
            setValue('')
          }
        }}
        onBlur={() => void commit()}
        placeholder="메모 입력 후 엔터"
        maxLength={500}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-[#0071e3]"
      />
    )
  }

  return (
    <div
      className="group relative inline-flex max-w-[220px] cursor-text items-center gap-1"
      onMouseEnter={() => void handleHoverEnter()}
      onClick={() => {
        setEditing(true)
        setValue('')
      }}
    >
      {latest ? (
        <span className="block truncate text-left text-xs text-slate-700">{latest.body}</span>
      ) : (
        <span className="text-xs text-slate-400">+ 메모</span>
      )}
      {latest ? (
        <div className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
          <p className="mb-2 font-semibold text-slate-900">메모 히스토리</p>
          {hoverLoading ? (
            <p className="text-slate-400">불러오는 중...</p>
          ) : hoverHistory && hoverHistory.length > 0 ? (
            <ul className="space-y-2">
              {hoverHistory.slice(0, 3).map((note) => (
                <li key={note.id} className="border-l-2 border-slate-200 pl-2">
                  <p className="text-[11px] text-slate-400">
                    {formatDateTimeShort(note.createdAt)}
                    {note.createdByName ? ` · ${note.createdByName}` : ''}
                  </p>
                  <p className="mt-0.5 break-words text-slate-700">{note.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">최근 메모: {latest.body}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ConsecutiveAbsenceCell(props: { record: DesignatedSeatAttendanceRecord }) {
  if (props.record.status === 'present') {
    return <span className="text-slate-400">-</span>
  }

  if (props.record.consecutiveAbsences <= 0) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        평일 집계 없음
      </span>
    )
  }

  const highlighted = props.record.consecutiveAbsences >= 2

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          highlighted ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        연속 결석 {props.record.consecutiveAbsences}회
      </span>
      {props.record.lastAttendedDate ? (
        <span className="text-[11px] text-slate-400">최근 출석 {props.record.lastAttendedDate}</span>
      ) : null}
    </div>
  )
}

function PaginationControls(props: {
  currentPage: number
  pageCount: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const start = props.totalCount === 0 ? 0 : ((props.currentPage - 1) * props.pageSize) + 1
  const end = Math.min(props.currentPage * props.pageSize, props.totalCount)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          {start}-{end} / {props.totalCount}
        </span>
        <select
          value={props.pageSize}
          onChange={(event) => props.onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none"
        >
          <option value={20}>20개</option>
          <option value={50}>50개</option>
          <option value={100}>100개</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => props.onPageChange(props.currentPage - 1)}
          disabled={props.currentPage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          이전
        </button>
        <span className="text-sm font-medium text-slate-600">
          {props.currentPage} / {props.pageCount}
        </span>
        <button
          type="button"
          onClick={() => props.onPageChange(props.currentPage + 1)}
          disabled={props.currentPage >= props.pageCount}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          다음
        </button>
      </div>
    </div>
  )
}

function getEmptyStateMessage(params: {
  tab: RecordTab
  hasSearch: boolean
  hasNoStudents: boolean
}) {
  if (params.hasNoStudents) {
    return '수강 중인 학생이 없습니다.'
  }

  if (params.hasSearch) {
    return '검색 결과가 없습니다.'
  }

  if (params.tab === 'present') {
    return '해당 날짜에 출석자가 없습니다.'
  }

  if (params.tab === 'absent') {
    return '해당 날짜에 결석자가 없습니다.'
  }

  return '조회할 출석 기록이 없습니다.'
}

export function DesignatedSeatAttendancePanel(props: { courseId: number }) {
  const [dashboard, setDashboard] = useState<DesignatedSeatAttendanceDashboard | null>(null)
  const [date, setDate] = useState(getToday())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<RecordTab>('all')
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [absenteeSort, setAbsenteeSort] = useState<SortConfig | null>({
    key: 'consecutiveAbsences',
    direction: 'desc',
  })
  const [careStatePending, setCareStatePending] = useState<Set<number>>(() => new Set())

  const loadDashboard = useCallback(async () => {
    const query = new URLSearchParams({
      courseId: String(props.courseId),
      date,
    })
    const response = await fetch(`/api/designated-seats/admin/attendance-dashboard?${query.toString()}`, {
      cache: 'no-store',
    })
    const payload = await readJson<DesignatedSeatAttendanceDashboard & { error?: string }>(response)

    if (!response.ok) {
      throw new Error(payload?.error ?? '지정좌석 출석 현황을 불러오지 못했습니다.')
    }

    return payload as DesignatedSeatAttendanceDashboard
  }, [date, props.courseId])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError('')

    loadDashboard()
      .then((nextDashboard) => {
        if (!cancelled) {
          setDashboard(nextDashboard)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '지정좌석 출석 현황을 불러오지 못했습니다.')
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
  }, [loadDashboard])

  const handleRefresh = useCallback(() => {
    setLoading(true)
    setError('')

    void loadDashboard()
      .then((nextDashboard) => {
        setDashboard(nextDashboard)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '지정좌석 출석 현황을 불러오지 못했습니다.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [loadDashboard])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, date, pageSize, search])

  const toggleAbsenteeSort = useCallback((key: SortKey) => {
    setAbsenteeSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'desc' }
      }
      if (current.direction === 'desc') {
        return { key, direction: 'asc' }
      }
      return null
    })
  }, [])

  const setRowCareStatePending = useCallback((enrollmentId: number, pending: boolean) => {
    setCareStatePending((current) => {
      const next = new Set(current)
      if (pending) {
        next.add(enrollmentId)
      } else {
        next.delete(enrollmentId)
      }
      return next
    })
  }, [])

  const handleCareStateToggle = useCallback(async (record: DesignatedSeatAttendanceRecord) => {
    const nextState = CARE_STATE_NEXT[record.careState]
    setRowCareStatePending(record.enrollmentId, true)
    setError('')

    try {
      const response = await fetch('/api/attendance/admin/care-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: props.courseId,
          enrollmentId: record.enrollmentId,
          subjectId: null,
          state: nextState,
        }),
      })
      const payload = await readJson<{ error?: string }>(response)
      if (!response.ok) {
        throw new Error(payload?.error ?? '관리 상태를 변경하지 못했습니다.')
      }
      await loadDashboard()
        .then((nextDashboard) => setDashboard(nextDashboard))
        .catch(() => null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '관리 상태를 변경하지 못했습니다.')
    } finally {
      setRowCareStatePending(record.enrollmentId, false)
    }
  }, [loadDashboard, props.courseId, setRowCareStatePending])

  const handleCareNoteSubmit = useCallback(async (
    record: DesignatedSeatAttendanceRecord,
    body: string,
  ) => {
    setError('')
    const response = await fetch('/api/attendance/admin/care-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: props.courseId,
        enrollmentId: record.enrollmentId,
        subjectId: null,
        body,
      }),
    })
    const payload = await readJson<{ error?: string }>(response)
    if (!response.ok) {
      const message = payload?.error ?? '메모를 등록하지 못했습니다.'
      setError(message)
      throw new Error(message)
    }
    await loadDashboard()
      .then((nextDashboard) => setDashboard(nextDashboard))
      .catch(() => null)
  }, [loadDashboard, props.courseId])

  const loadCareNoteHistory = useCallback(async (record: DesignatedSeatAttendanceRecord) => {
    const query = new URLSearchParams({
      courseId: String(props.courseId),
      enrollmentId: String(record.enrollmentId),
      limit: '5',
    })
    const response = await fetch(`/api/attendance/admin/care-notes?${query.toString()}`, {
      cache: 'no-store',
    })
    const payload = await readJson<{ notes?: EnrollmentCareNoteRecord[]; error?: string }>(response)
    if (!response.ok) {
      throw new Error(payload?.error ?? '메모 히스토리를 불러오지 못했습니다.')
    }
    return payload?.notes ?? []
  }, [props.courseId])

  const filteredRecords = useMemo(() => {
    const source = dashboard?.records ?? []
    const scoped = activeTab === 'all'
      ? source
      : source.filter((row) => row.status === activeTab)

    let ordered = scoped
    if (activeTab === 'absent') {
      if (absenteeSort) {
        const dirSign = absenteeSort.direction === 'asc' ? 1 : -1
        const compare = (left: DesignatedSeatAttendanceRecord, right: DesignatedSeatAttendanceRecord) => {
          switch (absenteeSort.key) {
            case 'consecutiveAbsences':
              return (left.consecutiveAbsences - right.consecutiveAbsences) * dirSign
            case 'cumulativeAbsences':
              return (left.cumulativeAbsences - right.cumulativeAbsences) * dirSign
            case 'lastAttendedDate':
              return ((left.lastAttendedDate ?? '').localeCompare(right.lastAttendedDate ?? '')) * dirSign
            case 'careState':
              return (CARE_STATE_ORDER[left.careState] - CARE_STATE_ORDER[right.careState]) * dirSign
            case 'studentName':
              return left.studentName.localeCompare(right.studentName, 'ko-KR') * dirSign
            case 'examNumber':
              return (left.examNumber ?? '').localeCompare(right.examNumber ?? '', 'ko-KR') * dirSign
            default:
              return 0
          }
        }
        ordered = [...scoped].sort((left, right) => (
          compare(left, right) || left.studentName.localeCompare(right.studentName, 'ko-KR')
        ))
      } else {
        ordered = [...scoped].sort((left, right) => (
          right.consecutiveAbsences - left.consecutiveAbsences
          || left.studentName.localeCompare(right.studentName, 'ko-KR')
        ))
      }
    }

    return ordered.filter((row) => matchesFields(search, [
      row.studentName,
      row.examNumber,
      row.phone,
      row.seatLabel,
      row.status === 'absent' ? `연속결석${row.consecutiveAbsences}회` : '',
      row.status === 'absent' ? `누적결석${row.cumulativeAbsences}회` : '',
      row.status === 'absent' ? CARE_STATE_LABEL[row.careState] : '',
      row.latestNote?.body,
      row.status === 'present' ? '출석' : '결석',
      formatTime(row.checkedInAt),
    ]))
  }, [absenteeSort, activeTab, dashboard?.records, search])

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize))

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [currentPage, filteredRecords, pageSize])

  const stats = dashboard?.stats ?? {
    targetCount: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0,
  }
  const hasNoStudents = stats.targetCount === 0
  const hasNoSeatEvents = stats.targetCount > 0 && stats.presentCount === 0
  const hasSearch = search.trim().length > 0

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[8px] bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#1d1d1f]">출석 현황</h3>
            <p className="mt-1 text-sm text-[#86868b]">
              QR 좌석 배정 기록을 출석으로 집계합니다.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#86868b]">조회 날짜</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value || getToday())}
                className="rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3]"
              />
            </label>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
            >
              {loading ? '불러오는 중...' : '새로고침'}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-[#ff3b30]">{error}</p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="출석 대상" value={stats.targetCount} />
          <StatCard label="출석" value={stats.presentCount} valueClassName="text-emerald-600" />
          <StatCard label="결석" value={stats.absentCount} valueClassName="text-rose-600" />
          <StatCard label="출석률" value={`${stats.attendanceRate}%`} valueClassName="text-blue-600" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[8px] bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex gap-6 border-b border-slate-200">
            <TabButton
              active={activeTab === 'all'}
              label="전체"
              count={stats.targetCount}
              onClick={() => setActiveTab('all')}
            />
            <TabButton
              active={activeTab === 'present'}
              label="출석자"
              count={stats.presentCount}
              onClick={() => setActiveTab('present')}
            />
            <TabButton
              active={activeTab === 'absent'}
              label="결석자"
              count={stats.absentCount}
              onClick={() => setActiveTab('absent')}
            />
          </div>
          <label className="block w-full lg:w-80">
            <span className="mb-1.5 block text-xs font-semibold text-[#86868b]">검색</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 수험번호, 연락처, 좌석번호 검색"
              className="w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3]"
            />
          </label>
        </div>

        {hasNoStudents ? (
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-[#86868b]">
            수강 중인 학생이 없습니다.
          </div>
        ) : hasNoSeatEvents ? (
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-[#86868b]">
            해당 날짜에 QR 좌석 배정 기록이 없습니다. 모든 학생이 결석으로 집계됩니다.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          {activeTab === 'absent' ? (
            <table className="min-w-[1100px] w-full">
              <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">상태</th>
                  <SortableTh label="수험번호" sortKey="examNumber" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <SortableTh label="이름" sortKey="studentName" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <th className="px-4 py-3">좌석</th>
                  <th className="px-4 py-3">연락처</th>
                  <SortableTh label="연속 결석" sortKey="consecutiveAbsences" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <SortableTh label="누적 결석(14d)" sortKey="cumulativeAbsences" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <SortableTh label="마지막 출석" sortKey="lastAttendedDate" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <SortableTh label="관리 상태" sortKey="careState" currentSort={absenteeSort} onToggle={toggleAbsenteeSort} />
                  <th className="px-4 py-3">비고 메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                      {getEmptyStateMessage({ tab: activeTab, hasSearch, hasNoStudents })}
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((row) => {
                    const cumulativeHighlighted = row.cumulativeAbsences >= 3
                    return (
                      <tr key={row.enrollmentId} className="bg-white">
                        <td className="px-4 py-3 align-middle text-center">
                          <StatusChip status={row.status} />
                        </td>
                        <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.examNumber ?? '-'}</td>
                        <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">
                          <span className="block truncate">{row.studentName}</span>
                        </td>
                        <td className="px-4 py-3 align-middle text-center text-slate-600">{row.seatLabel ?? '-'}</td>
                        <td className="px-4 py-3 align-middle text-center text-slate-600">
                          <span className="block truncate">{row.phone}</span>
                        </td>
                        <td className="px-4 py-3 align-middle text-center">
                          <ConsecutiveAbsenceCell record={row} />
                        </td>
                        <td className="px-4 py-3 align-middle text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            cumulativeHighlighted ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.cumulativeAbsences}회
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-center text-slate-600">{row.lastAttendedDate ?? '-'}</td>
                        <td className="px-4 py-3 align-middle text-center">
                          <CareStateChip
                            state={row.careState}
                            pending={careStatePending.has(row.enrollmentId)}
                            onClick={() => void handleCareStateToggle(row)}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle text-center">
                          <CareNoteCell
                            record={row}
                            onSubmit={(body) => handleCareNoteSubmit(row, body)}
                            onLoadHistory={() => loadCareNoteHistory(row)}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[920px] w-full table-fixed">
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[17%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">수험번호</th>
                  <th className="px-4 py-3">이름</th>
                  <th className="px-4 py-3">좌석번호</th>
                  <th className="px-4 py-3">연락처</th>
                  <th className="px-4 py-3">연속 결석</th>
                  <th className="px-4 py-3">출석 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                      {getEmptyStateMessage({ tab: activeTab, hasSearch, hasNoStudents })}
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((row) => (
                    <tr key={row.enrollmentId} className="bg-white">
                      <td className="px-4 py-3 align-middle text-center">
                        <StatusChip status={row.status} />
                      </td>
                      <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">
                        {row.examNumber ?? '-'}
                      </td>
                      <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">
                        <span className="block truncate">{row.studentName}</span>
                      </td>
                      <td className="px-4 py-3 align-middle text-center text-slate-600">
                        {row.seatLabel ?? '-'}
                      </td>
                      <td className="px-4 py-3 align-middle text-center text-slate-600">
                        <span className="block truncate">{row.phone}</span>
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <ConsecutiveAbsenceCell record={row} />
                      </td>
                      <td className="px-4 py-3 align-middle text-center text-slate-600">
                        {formatTime(row.checkedInAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <PaginationControls
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          totalCount={filteredRecords.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
    </div>
  )
}
