'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import type { CourseSubject } from '@/types/database'
import type {
  AttendanceExcuseRecord,
  AttendanceExcuseStudentOption,
} from './attendance-excuse-modal'

type AttendanceExcusesPanelProps = {
  active: boolean
  courseId: number
  subjects: CourseSubject[]
  students: AttendanceExcuseStudentOption[]
  defaultDate: string
  defaultSubjectId?: number | null
  refreshKey: number
  onCreateRequest: (defaults?: {
    enrollmentId?: number
    subjectId?: number | null
    date?: string
  }) => void
  onEditRequest: (excuse: AttendanceExcuseRecord) => void
  onChanged: (message: string) => void
}

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${value}T00:00:00+09:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AttendanceExcusesPanel({
  active,
  courseId,
  subjects,
  students,
  defaultDate,
  defaultSubjectId,
  refreshKey,
  onCreateRequest,
  onEditRequest,
  onChanged,
}: AttendanceExcusesPanelProps) {
  const [records, setRecords] = useState<AttendanceExcuseRecord[]>([])
  const [subjectFilter, setSubjectFilter] = useState(defaultSubjectId ? String(defaultSubjectId) : '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceExcuseRecord | null>(null)

  useEffect(() => {
    if (!active || subjectFilter || !defaultSubjectId) {
      return
    }

    setSubjectFilter(String(defaultSubjectId))
  }, [active, defaultSubjectId, subjectFilter])

  const loadData = useCallback(async () => {
    if (!active) {
      return
    }

    setLoading(true)
    setError('')

    const query = new URLSearchParams({
      courseId: String(courseId),
    })

    if (subjectFilter) {
      query.set('subjectId', subjectFilter)
    }

    if (fromDate) {
      query.set('fromDate', fromDate)
    }

    if (toDate) {
      query.set('toDate', toDate)
    }

    const response = await fetch(`/api/attendance/admin/excuses?${query.toString()}`, { cache: 'no-store' })
    const payload = await readJson<{ excuses?: AttendanceExcuseRecord[]; error?: string }>(response)

    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '사유서 목록을 불러오지 못했습니다.')
      return
    }

    setRecords(payload?.excuses ?? [])
  }, [active, courseId, fromDate, subjectFilter, toDate])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().replace(/\s+/g, '').replace(/-/g, '').toLowerCase()
    if (!keyword) {
      return records
    }

    return records.filter((record) => (
      [
        record.studentName,
        record.examNumber,
        record.phone,
        record.subjectName,
        record.reason,
      ]
        .filter(Boolean)
        .map((value) => String(value).replace(/\s+/g, '').replace(/-/g, '').toLowerCase())
        .some((value) => value.includes(keyword))
    ))
  }, [records, search])

  const studentCount = students.length

  async function handleDeleteConfirmed() {
    const record = deleteTarget
    if (!record) return
    setDeletingId(record.id)
    const response = await fetch(`/api/attendance/admin/excuses/${record.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
    })
    const payload = await readJson<{ error?: string }>(response)
    setDeletingId(null)

    if (!response.ok) {
      setError(payload?.error ?? '사유서를 삭제하지 못했습니다.')
      return
    }

    await loadData()
    setDeleteTarget(null)
    onChanged('사유서를 삭제했습니다.')
  }

  return (
    <>
    <ConfirmationModal
      open={Boolean(deleteTarget)}
      title="사유서를 삭제할까요?"
      description={deleteTarget ? `${deleteTarget.studentName} 학생의 사유서를 삭제합니다. 연속 결석 계산에 다시 반영될 수 있습니다.` : undefined}
      confirmLabel="삭제"
      pendingLabel="삭제 중..."
      tone="danger"
      submitting={deletingId !== null}
      onClose={() => {
        if (deletingId === null) {
          setDeleteTarget(null)
        }
      }}
      onConfirm={() => {
        void handleDeleteConfirmed()
      }}
    />
    <div className="space-y-4">
      <div className="admin-table-toolbar flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">사유서 관리</p>
            <p className="mt-1 text-xs text-slate-500">
              등록된 사유서는 과목별 연속 결석 계산에서 해당 날짜를 제외합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCreateRequest({
              subjectId: subjectFilter ? Number(subjectFilter) : (defaultSubjectId ?? null),
              date: defaultDate,
            })}
            disabled={subjects.length === 0}
            className="rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-black hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
          >
            새 사유서
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="사유서 학생 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`학생 ${studentCount > 0 ? `${studentCount}명` : ''} 검색`}
            className="admin-students-search rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          >
            <option value="">전체 과목</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {error ? (
        <p className="admin-notice admin-notice-danger">
          {getUserErrorMessage(error)}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">조회 결과 {filteredRecords.length}건</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="text-xs font-semibold text-[#0066cc] transition-all duration-200 ease-ios hover:underline active:scale-[0.97]"
          >
            새로고침
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="bg-white text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">학생</th>
                <th className="px-4 py-3">과목</th>
                <th className="px-4 py-3">날짜</th>
                <th className="px-4 py-3">사유</th>
                <th className="px-4 py-3">최근 수정</th>
                <th className="px-4 py-3">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">사유서를 불러오는 중입니다...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">조건에 맞는 사유서가 없습니다.</td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="bg-white">
                    <td className="px-4 py-3 align-middle text-center">
                      <div className="font-semibold text-slate-900">{record.studentName}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {[record.examNumber, record.phone].filter(Boolean).join(' · ') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {record.subjectName}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-center text-slate-600">{formatDate(record.excuseDate)}</td>
                    <td className="px-4 py-3 align-middle text-left text-slate-700">
                      <p className="line-clamp-2 min-w-[260px]">{record.reason}</p>
                    </td>
                    <td className="px-4 py-3 align-middle text-center text-xs text-slate-500">
                      <div>{formatDateTime(record.updatedAt)}</div>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditRequest(record)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97]"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(record)}
                          disabled={deletingId === record.id}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                        >
                          {deletingId === record.id ? '삭제 중...' : '삭제'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </>
  )
}
