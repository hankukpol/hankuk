'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { useTenantConfig } from '@/components/TenantProvider'
import { defaultSeatLabel, sortSeats } from '@/lib/designated-seat/layout'
import { withTenantPrefix } from '@/lib/tenant'
import type {
  Course,
  DesignatedSeat,
  DesignatedSeatLayout,
  DesignatedSeatReservation,
  Enrollment,
} from '@/types/database'

type TabMode = 'editor' | 'status'

type AdminPayload = {
  course: Course
  layout: DesignatedSeatLayout | null
  seats: DesignatedSeat[]
  reservations: DesignatedSeatReservation[]
  enrollments: Enrollment[]
  activeDisplaySession: {
    id: number
    expires_at: string
    last_seen_at: string | null
  } | null
}

type SeatDraft = DesignatedSeat & {
  persistedId: number | null
}

const DEFAULT_COLUMNS = 8
const DEFAULT_ROWS = 5

function buildSeatDrafts(columns: number, rows: number, seats: DesignatedSeat[]) {
  const seatMap = new Map(seats.map((seat) => [`${seat.position_x}:${seat.position_y}`, seat]))
  const next: SeatDraft[] = []

  for (let y = 1; y <= rows; y += 1) {
    for (let x = 1; x <= columns; x += 1) {
      const existing = seatMap.get(`${x}:${y}`)
      const existingDbId = existing?.id != null && existing.id > 0 ? existing.id : null
      const persistedId = (existing as SeatDraft | undefined)?.persistedId ?? existingDbId
      next.push({
        id: existingDbId ?? -(y * 100 + x),
        persistedId,
        course_id: existing?.course_id ?? 0,
        label: existing?.label ?? defaultSeatLabel(y, x),
        position_x: x,
        position_y: y,
        is_active: existing?.is_active ?? true,
        created_at: existing?.created_at ?? '',
        updated_at: existing?.updated_at ?? '',
      })
    }
  }

  return sortSeats(next)
}

async function fetchAdminData(courseId: number) {
  const response = await fetch(`/api/designated-seats/admin?courseId=${courseId}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as AdminPayload | { error?: string } | null
  if (!response.ok) {
    throw new Error(payload && 'error' in payload ? payload.error ?? '지정좌석 정보를 불러오지 못했습니다.' : '지정좌석 정보를 불러오지 못했습니다.')
  }

  return payload as AdminPayload
}

const TAB_ITEMS: Array<{ key: TabMode; label: string }> = [
  { key: 'editor', label: '좌석 맵 편집' },
  { key: 'status', label: '배정 현황' },
]

export default function CourseDesignatedSeatsPage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [tab, setTab] = useState<TabMode>('editor')
  const [course, setCourse] = useState<Course | null>(null)
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [aisleInput, setAisleInput] = useState('')
  const [featureEnabled, setFeatureEnabled] = useState(false)
  const [seatOpen, setSeatOpen] = useState(false)
  const [seatDrafts, setSeatDrafts] = useState<SeatDraft[]>([])
  const [reservations, setReservations] = useState<DesignatedSeatReservation[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [activeDisplaySession, setActiveDisplaySession] = useState<AdminPayload['activeDisplaySession']>(null)
  const [displayUrl, setDisplayUrl] = useState('')
  const [displayDuration, setDisplayDuration] = useState(24)
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<number>>(new Set())
  const [manualEnrollmentId, setManualEnrollmentId] = useState<number | null>(null)
  const [modalSeatId, setModalSeatId] = useState<number | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const savedSnapshotRef = useRef('')

  function markSnapshot(drafts: SeatDraft[], cols: number, rws: number, aisle: string, feat: boolean, open: boolean) {
    savedSnapshotRef.current = JSON.stringify({ drafts, cols, rws, aisle, feat, open })
  }

  function checkDirty(drafts: SeatDraft[], cols: number, rws: number, aisle: string, feat: boolean, open: boolean) {
    const current = JSON.stringify({ drafts, cols, rws, aisle, feat, open })
    setIsDirty(current !== savedSnapshotRef.current)
  }

  useEffect(() => {
    if (!isDirty) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const applyPayload = useCallback((payload: AdminPayload) => {
    const cols = payload.layout?.columns ?? DEFAULT_COLUMNS
    const rws = payload.layout?.rows ?? DEFAULT_ROWS
    const aisle = (payload.layout?.aisle_columns ?? []).join(',')
    const feat = payload.course.feature_designated_seat
    const open = payload.course.designated_seat_open
    const drafts = buildSeatDrafts(cols, rws, payload.seats)

    setCourse(payload.course)
    setColumns(cols)
    setRows(rws)
    setAisleInput(aisle)
    setFeatureEnabled(feat)
    setSeatOpen(open)
    setSeatDrafts(drafts)
    setReservations(payload.reservations)
    setEnrollments(payload.enrollments)
    setActiveDisplaySession(payload.activeDisplaySession)
    markSnapshot(drafts, cols, rws, aisle, feat, open)
    setIsDirty(false)
  }, [])

  async function refresh() {
    const payload = await fetchAdminData(courseId)
    applyPayload(payload)
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }

    fetchAdminData(courseId)
      .then(applyPayload)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '지정좌석 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId, applyPayload])

  const aisleColumnsParsed = useMemo(
    () => aisleInput.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0),
    [aisleInput],
  )
  const occupiedSeatIds = useMemo(() => reservations.map((reservation) => reservation.seat_id), [reservations])
  const seatReservationMap = useMemo(
    () => new Map(reservations.map((reservation) => [reservation.seat_id, reservation])),
    [reservations],
  )
  const enrollmentMap = useMemo(
    () => new Map(enrollments.map((enrollment) => [enrollment.id, enrollment])),
    [enrollments],
  )
  const seatStudentMap = useMemo(() => {
    const map = new Map<number, { name: string; exam_number?: string | null; reserved_at?: string | null }>()
    for (const reservation of reservations) {
      const enrollment = enrollmentMap.get(reservation.enrollment_id)
      if (enrollment) {
        map.set(reservation.seat_id, {
          name: enrollment.name,
          exam_number: enrollment.exam_number,
          reserved_at: reservation.updated_at,
        })
      }
    }
    return map
  }, [reservations, enrollmentMap])

  const selectedSeat = useMemo(
    () => seatDrafts.find((seat) => seat.id === selectedSeatId) ?? null,
    [seatDrafts, selectedSeatId],
  )

  const allSelectedIds = useMemo(() => {
    const ids = new Set(selectedSeatIds)
    if (selectedSeatId) ids.add(selectedSeatId)
    return ids
  }, [selectedSeatId, selectedSeatIds])

  const filteredEnrollments = useMemo(() => {
    const query = studentSearch.trim().toLowerCase().replace(/\s+/g, '')
    const source = [...enrollments].sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'))
    if (!query) return source
    return source.filter((enrollment) => {
      const candidates = [enrollment.name, enrollment.exam_number ?? '', enrollment.phone]
      return candidates.some((value) => value.toLowerCase().replace(/\s+/g, '').includes(query))
    })
  }, [enrollments, studentSearch])

  const summary = useMemo(() => {
    const activeSeatCount = seatDrafts.filter((seat) => seat.is_active).length
    return {
      activeSeatCount,
      reservedCount: reservations.length,
      availableCount: Math.max(activeSeatCount - reservations.length, 0),
    }
  }, [reservations.length, seatDrafts])

  function reshapeSeatDrafts(nextColumns: number, nextRows: number) {
    setSeatDrafts((current) => {
      const next = buildSeatDrafts(nextColumns, nextRows, current)
      checkDirty(next, nextColumns, nextRows, aisleInput, featureEnabled, seatOpen)
      return next
    })
  }

  function updateSelectedSeats(patch: Partial<SeatDraft>) {
    const ids = allSelectedIds
    if (ids.size === 0) return
    setSeatDrafts((current) => {
      const next = current.map((seat) => (ids.has(seat.id) ? { ...seat, ...patch } : seat))
      checkDirty(next, columns, rows, aisleInput, featureEnabled, seatOpen)
      return next
    })
  }

  function handleSeatClick(seat: DesignatedSeat, shiftKey: boolean) {
    if (shiftKey) {
      setSelectedSeatIds((current) => {
        const next = new Set(current)
        if (next.has(seat.id)) next.delete(seat.id)
        else next.add(seat.id)
        return next
      })
    } else {
      setSelectedSeatId(seat.id === selectedSeatId ? null : seat.id)
      setSelectedSeatIds(new Set())
    }
  }

  function clearSelection() {
    setSelectedSeatId(null)
    setSelectedSeatIds(new Set())
  }

  function handleTabChange(nextTab: TabMode) {
    if (nextTab === tab) return
    if (isDirty && nextTab !== 'editor') {
      const confirmed = window.confirm('저장하지 않은 변경 사항이 있습니다. 탭을 전환하면 변경 내용이 사라집니다. 계속할까요?')
      if (!confirmed) return
      void refresh().catch(() => null)
    }
    setTab(nextTab)
    setError('')
    setMessage('')
  }

  async function handleSaveLayout(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const payload = {
      courseId,
      columns,
      rows,
      aisleColumns: aisleColumnsParsed,
      seats: seatDrafts.map((seat) => ({
        id: seat.persistedId ?? undefined,
        label: seat.label,
        position_x: seat.position_x,
        position_y: seat.position_y,
        is_active: seat.is_active,
      })),
      featureDesignatedSeat: featureEnabled,
      designatedSeatOpen: featureEnabled ? seatOpen : false,
    }

    const response = await fetch('/api/designated-seats/admin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '지정좌석 저장에 실패했습니다.')
      return
    }

    setMessage('지정좌석 레이아웃을 저장했습니다.')
    clearSelection()
    await refresh().catch(() => null)
  }

  async function handleStartDisplay() {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, durationHours: displayDuration }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '현장 QR 표시를 시작하지 못했습니다.')
      return
    }

    setDisplayUrl((result as { displayUrl?: string } | null)?.displayUrl ?? '')
    setMessage('현장 QR 표시 세션을 시작했습니다.')
    await refresh().catch(() => null)
  }

  async function handleStopDisplay() {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '현장 QR 표시를 종료하지 못했습니다.')
      return
    }

    setDisplayUrl('')
    setMessage('현장 QR 표시 세션을 종료했습니다.')
    await refresh().catch(() => null)
  }

  async function handleManualAssign(seatId: number, enrollmentId: number) {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, enrollmentId, seatId }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '수동 좌석 배정에 실패했습니다.')
      return
    }

    setModalSeatId(null)
    setManualEnrollmentId(null)
    setStudentSearch('')
    setMessage('수동 좌석 배정을 완료했습니다.')
    await refresh().catch(() => null)
  }

  async function handleManualClear(enrollmentId: number) {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/manual', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, enrollmentId }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '좌석 해제에 실패했습니다.')
      return
    }

    setModalSeatId(null)
    setManualEnrollmentId(null)
    setStudentSearch('')
    setMessage('수동 좌석 해제를 완료했습니다.')
    await refresh().catch(() => null)
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">지정좌석 정보를 불러오는 중입니다...</p>
  }

  if (!course) {
    return <p className="py-12 text-center text-sm text-red-500">{error || '강좌를 찾을 수 없습니다.'}</p>
  }

  const bulkCount = allSelectedIds.size

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
              className="text-xs font-medium text-gray-400 hover:underline"
            >
              &larr; {course.name}
            </Link>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">지정좌석</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              학생이 직접 좌석을 선착순으로 선택할 수 있는 기능입니다. 기존 과목별 좌석 배정과는 독립적으로 운영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              강좌 설정
            </Link>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course.id}/seats`, tenant.type)}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              기존 좌석 배정
            </Link>
          </div>
        </div>

      </section>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleTabChange(item.key)}
            className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
              tab === item.key
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {item.label}
            {item.key === 'editor' && isDirty ? (
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-400" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: '활성 좌석', value: summary.activeSeatCount },
          { label: '배정 완료', value: summary.reservedCount },
          { label: '잔여 좌석', value: summary.availableCount },
          { label: '신청 상태', value: seatOpen ? 'OPEN' : 'CLOSED' },
        ].map((item) => (
          <article key={item.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-500">{item.label}</p>
            <p className="mt-3 text-3xl font-extrabold text-gray-900">{item.value}</p>
          </article>
        ))}
      </div>

      {/* Feedback */}
      {(error || message) ? (
        <div className="flex flex-col gap-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      ) : null}

      {/* ───── Tab 1: Editor ───── */}
      {tab === 'editor' && (
        <>
          {isDirty ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">
              저장하지 않은 변경 사항이 있습니다.
            </div>
          ) : null}

          <form onSubmit={handleSaveLayout} className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5">
              {/* Feature toggles */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={featureEnabled}
                    onChange={(event) => {
                      setFeatureEnabled(event.target.checked)
                      checkDirty(seatDrafts, columns, rows, aisleInput, event.target.checked, seatOpen)
                    }}
                    className="rounded"
                  />
                  지정좌석 기능 사용
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={seatOpen}
                    onChange={(event) => {
                      setSeatOpen(event.target.checked)
                      checkDirty(seatDrafts, columns, rows, aisleInput, featureEnabled, event.target.checked)
                    }}
                    className="rounded"
                    disabled={!featureEnabled}
                  />
                  학생 신청 열기
                </label>
              </div>

              {/* Grid config */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">행</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rows}
                    onChange={(event) => {
                      const nextRows = Number(event.target.value || DEFAULT_ROWS)
                      setRows(nextRows)
                      reshapeSeatDrafts(columns, nextRows)
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">열</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={columns}
                    onChange={(event) => {
                      const nextColumns = Number(event.target.value || DEFAULT_COLUMNS)
                      setColumns(nextColumns)
                      reshapeSeatDrafts(nextColumns, rows)
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">통로 열</label>
                  <input
                    value={aisleInput}
                    onChange={(event) => {
                      setAisleInput(event.target.value)
                      checkDirty(seatDrafts, columns, rows, event.target.value, featureEnabled, seatOpen)
                    }}
                    placeholder="예: 4,8"
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Seat map */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">좌석 맵</h3>
                    <p className="text-xs text-gray-500">
                      클릭으로 선택, <kbd className="rounded border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-semibold">Shift</kbd>+클릭으로 다중 선택
                    </p>
                  </div>
                  {bulkCount > 1 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">{bulkCount}개 선택</span>
                      <button type="button" onClick={() => updateSelectedSeats({ is_active: true })} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">일괄 활성화</button>
                      <button type="button" onClick={() => updateSelectedSeats({ is_active: false })} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">일괄 비활성화</button>
                      <button type="button" onClick={clearSelection} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600">선택 해제</button>
                    </div>
                  ) : null}
                </div>
                <SeatGrid
                  columns={columns}
                  rows={rows}
                  aisleColumns={aisleColumnsParsed}
                  seats={seatDrafts}
                  occupiedSeatIds={occupiedSeatIds}
                  selectedSeatId={selectedSeatId}
                  selectedSeatIds={selectedSeatIds}
                  seatStudentMap={seatStudentMap}
                  onSeatClick={handleSeatClick}
                  mode="admin"
                />
              </div>

              {/* Selected seat detail */}
              {selectedSeat ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-base font-bold text-gray-900">선택 좌석</h3>
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-500">현재 좌표</p>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {selectedSeat.position_y}행 {selectedSeat.position_x}열
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-500">좌석 라벨</label>
                        <input
                          value={selectedSeat.label}
                          onChange={(event) => updateSelectedSeats({ label: event.target.value })}
                          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedSeat.is_active}
                            onChange={(event) => updateSelectedSeats({ is_active: event.target.checked })}
                            className="rounded"
                          />
                          좌석 사용 가능
                        </label>
                      </div>
                    </div>
                    {seatReservationMap.get(selectedSeat.persistedId ?? selectedSeat.id) ? (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        현재 배정 중인 좌석은 비활성화하거나 삭제할 수 없습니다.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : bulkCount === 0 ? (
                <p className="text-sm text-gray-500">좌석을 선택하면 상세 편집이 열립니다.</p>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60 hover:bg-blue-700"
              >
                {saving ? '저장 중...' : '레이아웃 저장'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ───── Tab 2: Status ───── */}
      {tab === 'status' && (
        <div className="flex flex-col gap-6">
          {/* QR Display — top */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">현장 QR 표시</h3>
                <p className="mt-1 text-sm text-gray-500">관리자 전용 토큰으로만 열리는 모니터 화면입니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={displayDuration}
                  onChange={(event) => setDisplayDuration(Number(event.target.value))}
                  className="rounded-xl border border-slate-200 px-2 py-2.5 text-sm outline-none"
                >
                  <option value={6}>6시간</option>
                  <option value={12}>12시간</option>
                  <option value={24}>24시간</option>
                  <option value={48}>48시간</option>
                  <option value={72}>72시간</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleStartDisplay()}
                  disabled={working}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-slate-800"
                >
                  시작
                </button>
                <button
                  type="button"
                  onClick={() => void handleStopDisplay()}
                  disabled={working || !activeDisplaySession}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60 hover:bg-slate-200"
                >
                  중지
                </button>
              </div>
            </div>

            {activeDisplaySession ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                활성 세션 · 만료: {new Date(activeDisplaySession.expires_at).toLocaleString('ko-KR')}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                활성화된 세션 없음
              </div>
            )}

            {displayUrl ? (
              <div className="mt-4 flex flex-col gap-2">
                <input
                  value={displayUrl}
                  readOnly
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(displayUrl)
                      setMessage('표시 URL을 복사했습니다.')
                    }}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    URL 복사
                  </button>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    새 창 열기
                  </a>
                  <a
                    href="/dashboard/designated-seat-monitor"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    멀티 모니터 설정
                  </a>
                </div>
              </div>
            ) : null}
          </section>

          {/* Seat map */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-gray-900">좌석 배정 현황</h3>
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                새로고침
              </button>
            </div>
            <SeatGrid
              columns={columns}
              rows={rows}
              aisleColumns={aisleColumnsParsed}
              seats={seatDrafts}
              occupiedSeatIds={occupiedSeatIds}
              selectedSeatId={modalSeatId}
              seatStudentMap={seatStudentMap}
              onSeatClick={(seat) => {
                const seatDbId = (seat as SeatDraft).persistedId ?? seat.id
                if (seatDbId <= 0 || !seat.is_active) return
                setModalSeatId(seatDbId)
                setManualEnrollmentId(null)
                setStudentSearch('')
              }}
              mode="admin"
            />
          </section>
        </div>
      )}

      {/* ───── Seat Assignment Modal ───── */}
      {modalSeatId !== null && tab === 'status' && (() => {
        const modalSeat = seatDrafts.find((s) => (s.persistedId ?? s.id) === modalSeatId)
        const currentReservation = seatReservationMap.get(modalSeatId)
        const currentEnrollment = currentReservation ? enrollmentMap.get(currentReservation.enrollment_id) : null

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => { setModalSeatId(null); setStudentSearch(''); setManualEnrollmentId(null) }}
          >
            <div
              className="w-full max-w-md rounded-[10px] bg-white p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-900">
                  {modalSeat?.label ?? `좌석 #${modalSeatId}`} 좌석 관리
                </h3>
                <button
                  type="button"
                  onClick={() => { setModalSeatId(null); setStudentSearch(''); setManualEnrollmentId(null) }}
                  className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                >
                  닫기
                </button>
              </div>

              {currentEnrollment ? (
                <div className="mt-4">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-600">현재 배정 학생</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {currentEnrollment.exam_number ? `[${currentEnrollment.exam_number}] ` : ''}
                      {currentEnrollment.name}
                    </p>
                    {currentReservation ? (
                      <p className="mt-1 text-xs text-gray-500">
                        배정 시간: {new Date(currentReservation.updated_at).toLocaleString('ko-KR')}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`${currentEnrollment.name} 학생의 좌석 배정을 해제할까요?`)) return
                      void handleManualClear(currentReservation!.enrollment_id)
                    }}
                    disabled={working}
                    className="mt-3 w-full rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-60 hover:bg-red-100"
                  >
                    배정 해제
                  </button>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500">다른 학생으로 변경</p>
                  </div>
                </div>
              ) : null}

              <div className={currentEnrollment ? 'mt-2' : 'mt-4'}>
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="이름, 수험번호, 연락처로 검색"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  autoFocus
                />
                <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                  {filteredEnrollments.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">검색 결과 없음</p>
                  ) : (
                    filteredEnrollments.map((enrollment) => {
                      const isSelected = manualEnrollmentId === enrollment.id
                      const isAlreadyAssigned = reservations.some((r) => r.enrollment_id === enrollment.id)
                      return (
                        <button
                          key={enrollment.id}
                          type="button"
                          onClick={() => setManualEnrollmentId(isSelected ? null : enrollment.id)}
                          className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-b-0 ${
                            isSelected
                              ? 'bg-blue-50 font-bold text-blue-800'
                              : isAlreadyAssigned
                                ? 'bg-slate-50 text-slate-400'
                                : 'text-gray-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">
                            {enrollment.exam_number ? `[${enrollment.exam_number}] ` : ''}
                            {enrollment.name}
                          </span>
                          {isAlreadyAssigned ? (
                            <span className="shrink-0 text-xs text-slate-400">배정됨</span>
                          ) : isSelected ? (
                            <span className="shrink-0 text-xs text-blue-600">선택됨</span>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!manualEnrollmentId) return
                  const target = enrollments.find((e) => e.id === manualEnrollmentId)
                  const label = modalSeat?.label ?? `#${modalSeatId}`
                  if (!window.confirm(`${target?.name ?? '학생'}을(를) ${label} 좌석에 배정할까요?`)) return
                  void handleManualAssign(modalSeatId, manualEnrollmentId)
                }}
                disabled={working || !manualEnrollmentId}
                className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 hover:bg-blue-700"
              >
                {currentEnrollment ? '학생 변경' : '배정하기'}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
