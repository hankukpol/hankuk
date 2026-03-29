'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import { useAppConfig } from '@/hooks/use-app-config'

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) {
    pages.push(page)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

interface Log {
  id: number
  distributed_at: string
  distributed_by: string
  note: string
  students: { name: string; exam_number: string | null; series: string | null; region: string | null }
  materials: { name: string }
}

function getTodayKST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export default function LogsPage() {
  const tenant = useTenantConfig()
  const { config, isLoading: isFeatureLoading } = useAppConfig()
  const [logs, setLogs] = useState<Log[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [exportFrom, setExportFrom] = useState(getTodayKST)
  const [exportTo, setExportTo] = useState(getTodayKST)
  const [exportAll, setExportAll] = useState(false)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (search) params.set('q', search)
      const res = await fetch(`/api/distribution/logs?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    if (!isFeatureLoading && config.admin_distribution_logs_enabled) {
      void load()
    }
  }, [config.admin_distribution_logs_enabled, isFeatureLoading, load])

  function handleSearch() {
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    await fetch(`/api/distribution/logs/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setConfirmDeleteId(null)
    void load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (isFeatureLoading) {
    return <div className="py-16 text-center text-sm text-gray-500">기능 설정을 확인하는 중입니다...</div>
  }

  if (!config.admin_distribution_logs_enabled) {
    return (
      <FeatureDisabledPanel
        title="배부 로그 기능이 꺼져 있습니다."
        description="이 지점에서는 관리자 배부 로그 조회, CSV 내보내기, 로그 삭제 기능이 비활성화되어 있습니다. 설정 허브에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          배부 로그 <span className="text-base font-normal text-gray-400">({total}건)</span>
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={exportAll}
              onChange={(event) => setExportAll(event.target.checked)}
              className="h-3.5 w-3.5"
            />
            전체 기간
          </label>
          {!exportAll ? (
            <>
              <input
                type="date"
                value={exportFrom}
                onChange={(event) => setExportFrom(event.target.value)}
                className="border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
              />
              <span className="text-xs text-gray-400">~</span>
              <input
                type="date"
                value={exportTo}
                onChange={(event) => setExportTo(event.target.value)}
                className="border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
              />
            </>
          ) : null}
          <a
            href={
              exportAll
                ? '/api/distribution/logs/export?all=1'
                : `/api/distribution/logs/export?date_from=${exportFrom}&date_to=${exportTo}`
            }
            className="whitespace-nowrap border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            CSV 내보내기
          </a>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSearch()
          }}
          placeholder="이름, 응시번호, 휴대전화 번호로 검색"
          className="flex-1 border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--theme)' }}
        >
          검색
        </button>
        {search ? (
          <button
            onClick={() => {
              setSearchInput('')
              setSearch('')
              setPage(1)
            }}
            className="border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-600"
          >
            초기화
          </button>
        ) : null}
      </div>

      <div className="overflow-auto border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {tenant.logHeaders.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={tenant.logColSpan} className="py-10 text-center text-gray-400">
                  불러오는 중...
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={tenant.logColSpan} className="py-10 text-center text-red-400">
                  데이터를 불러오지 못했습니다.
                  <button onClick={() => void load()} className="ml-2 underline">
                    다시 시도
                  </button>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={tenant.logColSpan} className="py-10 text-center text-gray-400">
                  배부 기록이 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {new Date(log.distributed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </td>
                  <td className="px-4 py-3 font-medium">{log.students?.name}</td>
                  <td className="px-4 py-3 text-gray-600">{log.students?.exam_number ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{log.students?.series ?? '-'}</td>
                  {tenant.showRegionInScan ? (
                    <td className="px-4 py-3 text-gray-600">{log.students?.region ?? '-'}</td>
                  ) : null}
                  <td className="px-4 py-3">
                    <span className="border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {log.materials?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{log.distributed_by || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {confirmDeleteId === log.id ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => void handleDelete(log.id)}
                          disabled={deletingId === log.id}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                        >
                          {deletingId === log.id ? '삭제 중...' : '확인'}
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(log.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="h-8 w-8 border border-gray-200 bg-white text-sm text-gray-600 disabled:opacity-30"
          >
            {'<'}
          </button>
          {getPageNumbers(page, totalPages).map((item, index) =>
            item === '...'
              ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-8 w-8 items-center justify-center text-sm text-gray-400"
                  >
                    ...
                  </span>
                )
              : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`h-8 w-8 border text-sm ${
                      item === page
                        ? 'border-transparent text-white'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                    style={item === page ? { background: 'var(--theme)' } : {}}
                  >
                    {item}
                  </button>
                ),
          )}
          <button
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            className="h-8 w-8 border border-gray-200 bg-white text-sm text-gray-600 disabled:opacity-30"
          >
            {'>'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
