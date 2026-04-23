'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DesignatedSeatAttendanceDashboard,
  DesignatedSeatAttendanceRecord,
} from '@/types/database'

type RecordTab = 'all' | 'present' | 'absent'

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
      className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ${
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
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
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
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
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

  const filteredRecords = useMemo(() => {
    const source = dashboard?.records ?? []
    const scoped = activeTab === 'all'
      ? source
      : source.filter((row) => row.status === activeTab)

    return scoped.filter((row) => matchesFields(search, [
      row.studentName,
      row.examNumber,
      row.phone,
      row.seatLabel,
      row.status === 'present' ? '출석' : '결석',
      formatTime(row.checkedInAt),
    ]))
  }, [activeTab, dashboard?.records, search])

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
              className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#e8e8ed] disabled:opacity-60"
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
          <table className="min-w-[760px] w-full table-fixed">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">수험번호</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">좌석번호</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">출석 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
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
                    <td className="px-4 py-3 align-middle text-center text-slate-600">
                      {formatTime(row.checkedInAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
