'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import { useParams } from 'next/navigation'
import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { AdminSectionTabs, AdminSectionPanel } from '@/components/admin/AdminSectionTabs'
import type { Course, CourseSubject, Enrollment, SeatAssignment } from '@/types/database'

type SeatResponse = {
  subjects: CourseSubject[]
  seatAssignments: SeatAssignment[]
}

export type SeatsPageData = {
  course: Course
  subjects: CourseSubject[]
  seatAssignments: SeatAssignment[]
  enrollments: Enrollment[]
}

type CourseSeatsPageProps = {
  initialData?: SeatsPageData | null
  initialError?: string
  initialLoaded?: boolean
}

type BulkSeatResponse = {
  count?: number
  details?: string[]
  error?: string
  totalRows?: number
}

type SeatPatchResponse = {
  action?: 'updated' | 'cleared'
  error?: string
  seatAssignment?: SeatAssignment
}

type SubjectForm = {
  name: string
  sort_order: number
}

const EMPTY_SUBJECT: SubjectForm = {
  name: '',
  sort_order: 1,
}
const SEAT_SECTIONS = [
  { value: 'assignments', label: '현재 좌석 배정' },
  { value: 'bulk', label: '좌석 붙여넣기' },
  { value: 'subjects', label: '과목 관리' },
] as const

function getSeatKey(enrollmentId: number, subjectId: number) {
  return `${enrollmentId}:${subjectId}`
}

function buildSeatDraftMap(seatAssignments: SeatAssignment[]) {
  return seatAssignments.reduce<Record<string, string>>((accumulator, assignment) => {
    accumulator[getSeatKey(assignment.enrollment_id, assignment.subject_id)] = assignment.seat_number
    return accumulator
  }, {})
}

async function fetchSeatsPageData(courseId: number, fresh = false): Promise<SeatsPageData> {
  const [courseResponse, seatsResponse, enrollmentsResponse] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/seats?courseId=${courseId}${fresh ? '&fresh=1' : ''}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?courseId=${courseId}&noLimit=1`, { cache: 'no-store' }),
  ])

  const coursePayload = await courseResponse.json().catch(() => null)
  const seatsPayload = (await seatsResponse.json().catch(() => null)) as SeatResponse | null
  const enrollmentsPayload = await enrollmentsResponse.json().catch(() => null)

  if (!courseResponse.ok) {
    throw new Error(coursePayload?.error ?? '강좌 정보를 불러오지 못했습니다.')
  }

  if (!seatsResponse.ok) {
    throw new Error((seatsPayload as { error?: string } | null)?.error ?? '좌석 배정 정보를 불러오지 못했습니다.')
  }
  if (!Array.isArray(seatsPayload?.subjects) || !Array.isArray(seatsPayload?.seatAssignments)) {
    throw new Error('좌석 배정 정보를 확인하지 못했습니다. 다시 새로고침해 주세요.')
  }

  if (!enrollmentsResponse.ok) {
    throw new Error(enrollmentsPayload?.error ?? '수강생 목록을 불러오지 못했습니다.')
  }

  return {
    course: coursePayload.course as Course,
    subjects: seatsPayload?.subjects ?? [],
    seatAssignments: seatsPayload?.seatAssignments ?? [],
    enrollments: (enrollmentsPayload.enrollments ?? []) as Enrollment[],
  }
}

export default function CourseSeatsPage({
  initialData = null,
  initialError = '',
  initialLoaded = Boolean(initialData),
}: CourseSeatsPageProps) {
  const params = useParams<{ id: string }>()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [subjects, setSubjects] = useState<CourseSubject[]>(initialData?.subjects ?? [])
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>(initialData?.seatAssignments ?? [])
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialData?.enrollments ?? [])
  const [seatDrafts, setSeatDrafts] = useState<Record<string, string>>(
    buildSeatDraftMap(initialData?.seatAssignments ?? []),
  )
  const [savingSeatKeys, setSavingSeatKeys] = useState<string[]>([])
  const [newSubject, setNewSubject] = useState<SubjectForm>(EMPTY_SUBJECT)
  const [bulkText, setBulkText] = useState('')
  const [seatSearch, setSeatSearch] = useState('')
  const [loading, setLoading] = useState(!initialLoaded)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)
  const [bulkIssues, setBulkIssues] = useState<string[]>([])
  const [subjectDeleteTarget, setSubjectDeleteTarget] = useState<CourseSubject | null>(null)
  const savedSeatsRef = useRef(buildSeatDraftMap(initialData?.seatAssignments ?? []))
  const seatReadGenerationRef = useRef(0)
  const draftRevisionsRef = useRef<Record<string, number>>({})
  const skipSeatBlurRef = useRef(new Set<string>())
  const uncertainSeatKeysRef = useRef(new Set<string>())
  const seatSaveQueuesRef = useRef(new Map<string, {
    running: boolean
    pending?: { value: string; revision: number }
    inFlight?: { value: string; revision: number }
  }>())

  async function refreshPage() {
    // An explicit authoritative read also supersedes the mount-time snapshot.
    seatReadGenerationRef.current += 1
    const data = await fetchSeatsPageData(courseId, true)
    setCourse(data.course)
    setSubjects(data.subjects)
    setSeatAssignments(data.seatAssignments)
    setEnrollments(data.enrollments)
    savedSeatsRef.current = buildSeatDraftMap(data.seatAssignments)
    uncertainSeatKeysRef.current.clear()
    setSeatDrafts(buildSeatDraftMap(data.seatAssignments))
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }

    let isActive = true
    const requestGeneration = seatReadGenerationRef.current

    fetchSeatsPageData(courseId)
      .then((data) => {
        if (!isActive || requestGeneration !== seatReadGenerationRef.current) {
          return
        }

        setCourse(data.course)
        setSubjects(data.subjects)
        setSeatAssignments(data.seatAssignments)
        setEnrollments(data.enrollments)
        savedSeatsRef.current = buildSeatDraftMap(data.seatAssignments)
        setSeatDrafts((current) => ({
          ...savedSeatsRef.current,
          ...Object.fromEntries(Object.entries(current).filter(([key]) => draftRevisionsRef.current[key])),
        }))
      })
      .catch((reason: unknown) => {
        if (!isActive || requestGeneration !== seatReadGenerationRef.current) {
          return
        }

        setError(reason instanceof Error ? reason.message : '좌석 관리 페이지를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (isActive && requestGeneration === seatReadGenerationRef.current) {
          setLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [courseId])

  const summary = useMemo(() => {
    const assignedEnrollments = new Set(seatAssignments.map((entry) => entry.enrollment_id))
    return {
      subjectCount: subjects.length,
      seatRows: seatAssignments.length,
      assignedStudents: assignedEnrollments.size,
    }
  }, [seatAssignments, subjects.length])

  const originalSeatMap = useMemo(() => buildSeatDraftMap(seatAssignments), [seatAssignments])

  const studentRows = useMemo(() => {
    const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })

    return [...enrollments]
      .sort((left, right) => {
        const nameCompare = collator.compare(left.name, right.name)
        if (nameCompare !== 0) {
          return nameCompare
        }

        const examCompare = collator.compare(left.exam_number ?? '', right.exam_number ?? '')
        if (examCompare !== 0) {
          return examCompare
        }

        return left.id - right.id
      })
  }, [enrollments])

  const filteredStudentRows = useMemo(() => {
    const query = seatSearch.trim().toLowerCase().replace(/\s+/g, '')
    if (!query) {
      return studentRows
    }

    return studentRows.filter((enrollment) => {
      const candidates = [enrollment.exam_number ?? '', enrollment.name, enrollment.phone]
      return candidates.some((value) => value.toLowerCase().replace(/\s+/g, '').includes(query))
    })
  }, [seatSearch, studentRows])

  async function handleCreateSubject(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBulkIssues([])

    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSubject),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '과목을 추가하지 못했습니다.')
      return
    }

    const nextSubject = payload.subject as CourseSubject
    const nextSubjects = [...subjects, nextSubject].sort((left, right) => left.sort_order - right.sort_order)
    const lastSortOrder = nextSubjects[nextSubjects.length - 1]?.sort_order ?? nextSubjects.length

    setSubjects(nextSubjects)
    setNewSubject({ name: '', sort_order: lastSortOrder + 1 })
    setMessage('과목을 추가했습니다.')
  }

  async function handleSubjectPatch(subject: CourseSubject, values: Partial<CourseSubject>) {
    setError('')
    setMessage('')
    setBulkIssues([])

    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId: subject.id,
        ...values,
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '과목을 수정하지 못했습니다.')
      return
    }

    const updated = payload.subject as CourseSubject
    setSubjects((current) =>
      current
        .map((entry) => (entry.id === updated.id ? updated : entry))
        .sort((left, right) => left.sort_order - right.sort_order),
    )
    setMessage('과목을 수정했습니다.')
  }

  async function handleSubjectDeleteConfirmed() {
    const subject = subjectDeleteTarget
    if (!subject) return
    setError('')
    setMessage('')
    setBulkIssues([])

    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId: subject.id }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '과목을 삭제하지 못했습니다.')
      return
    }

    setSubjects((current) => current.filter((entry) => entry.id !== subject.id))
    setSubjectDeleteTarget(null)
    setSeatAssignments((current) => current.filter((entry) => entry.subject_id !== subject.id))
    setSeatDrafts((current) => {
      const nextDrafts = { ...current }
      for (const key of Object.keys(nextDrafts)) {
        if (key.endsWith(`:${subject.id}`)) {
          delete nextDrafts[key]
        }
      }
      return nextDrafts
    })
    setMessage('과목을 삭제했습니다.')
  }

  async function handleBulkSeats(event: FormEvent) {
    event.preventDefault()
    if (!bulkText.trim()) {
      setError('좌석 데이터를 붙여넣어 주세요.')
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    setBulkIssues([])

    const response = await fetch('/api/seats/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        text: bulkText,
      }),
    })
    const payload = (await response.json().catch(() => null)) as BulkSeatResponse | null
    setSubmitting(false)

    if (!response.ok) {
      setError(payload?.error ?? '좌석 일괄 입력에 실패했습니다.')
      setBulkIssues(payload?.details ?? [])
      return
    }

    setBulkText('')
    setMessage(`총 ${payload?.totalRows ?? payload?.count ?? 0}행을 확인했고, ${payload?.count ?? 0}건을 반영했습니다.`)
    await refreshPage().catch(() => null)
  }

  function handleSeatDraftChange(enrollmentId: number, subjectId: number, value: string) {
    const key = getSeatKey(enrollmentId, subjectId)
    // initialData allows edits before the initial GET finishes; it must not become a newer baseline.
    seatReadGenerationRef.current += 1
    draftRevisionsRef.current[key] = (draftRevisionsRef.current[key] ?? 0) + 1
    setSeatDrafts((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleSeatInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    enrollment: Enrollment,
    subject: CourseSubject,
  ) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      const key = getSeatKey(enrollment.id, subject.id)
      const queue = seatSaveQueuesRef.current.get(key)
      skipSeatBlurRef.current.add(key)
      draftRevisionsRef.current[key] = (draftRevisionsRef.current[key] ?? 0) + 1
      setSeatDrafts((current) => ({
        ...current,
        [key]: queue?.pending?.value ?? queue?.inFlight?.value ?? savedSeatsRef.current[key] ?? '',
      }))
      event.currentTarget.blur()
    }
  }

  async function handleSeatSave(enrollment: Enrollment, subject: CourseSubject) {
    const key = getSeatKey(enrollment.id, subject.id)
    if (skipSeatBlurRef.current.delete(key)) return
    if (uncertainSeatKeysRef.current.has(key)) {
      setError('좌석 저장 결과를 확인하지 못했습니다. 새로고침으로 현재 좌석을 확인한 뒤 수정해 주세요.')
      return
    }
    const nextSeatNumber = (seatDrafts[key] ?? '').trim()
    seatReadGenerationRef.current += 1
    let queue = seatSaveQueuesRef.current.get(key)
    if (!queue) {
      queue = { running: false }
      seatSaveQueuesRef.current.set(key, queue)
    }
    queue.pending = { value: nextSeatNumber, revision: draftRevisionsRef.current[key] ?? 0 }
    if (queue.running) return
    queue.running = true
    setSavingSeatKeys((current) => [...new Set([...current, key])])
    setError('')
    setMessage('')
    setBulkIssues([])

    try {
      while (queue.pending) {
        const submitted = queue.pending
        queue.pending = undefined
        if (submitted.value === (savedSeatsRef.current[key] ?? '')) continue
        queue.inFlight = submitted
        try {
          const response = await fetch('/api/seats', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseId,
              enrollmentId: enrollment.id,
              subjectId: subject.id,
              seatNumber: submitted.value || null,
            }),
          })
          const payload = (await response.json().catch(() => null)) as SeatPatchResponse | null
          if (!response.ok || !(payload?.action === 'cleared' || payload?.seatAssignment)) {
            throw new Error(payload?.error ?? '좌석 저장 결과를 확인하지 못했습니다.')
          }
          const nextAssignment: SeatAssignment | null = payload.action === 'cleared' ? null : {
            ...payload.seatAssignment!,
            course_subjects: {
              id: subject.id,
              name: subject.name,
              sort_order: subject.sort_order,
            },
          }

          setSeatAssignments((current) => {
            const filtered = current.filter(
              (entry) => !(entry.enrollment_id === enrollment.id && entry.subject_id === subject.id),
            )
            return nextAssignment ? [...filtered, nextAssignment] : filtered
          })
          const savedValue = nextAssignment?.seat_number ?? ''
          savedSeatsRef.current[key] = savedValue
          if ((draftRevisionsRef.current[key] ?? 0) === submitted.revision) {
            setSeatDrafts((current) => ({
              ...current,
              [key]: savedValue,
            }))
          }
          setMessage(`${enrollment.name} 학생의 ${subject.name} 좌석을 ${savedValue ? '저장했습니다.' : '비웠습니다.'}`)
        } catch {
          // A lost response may follow a committed write. Read back, never retry the mutation.
          queue.pending = undefined
          uncertainSeatKeysRef.current.add(key)
          setError('좌석 저장 결과를 확인하지 못했습니다. 현재 좌석을 다시 확인합니다.')
          try {
            const response = await fetch(`/api/seats?courseId=${courseId}&fresh=1`, { cache: 'no-store' })
            const payload = await response.json() as SeatResponse
            if (!response.ok || !Array.isArray(payload.seatAssignments)) throw new Error('invalid seats')
            const assignment = payload.seatAssignments.find((entry) => entry.enrollment_id === enrollment.id && entry.subject_id === subject.id)
            savedSeatsRef.current[key] = assignment?.seat_number ?? ''
            setSeatAssignments((current) => [
              ...current.filter((entry) => !(entry.enrollment_id === enrollment.id && entry.subject_id === subject.id)),
              ...(assignment ? [assignment] : []),
            ])
            if ((draftRevisionsRef.current[key] ?? 0) === submitted.revision) {
              setSeatDrafts((current) => ({ ...current, [key]: assignment?.seat_number ?? '' }))
            }
            uncertainSeatKeysRef.current.delete(key)
          } catch {
            setError('좌석 저장 결과를 확인하지 못했습니다. 새로고침으로 현재 좌석을 확인한 뒤 수정해 주세요.')
          }
          break
        } finally {
          queue.inFlight = undefined
        }
      }
    } finally {
      queue.running = false
      setSavingSeatKeys((current) => current.filter((value) => value !== key))
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">좌석 관리 화면을 불러오는 중입니다...</p>
  }

  if (!course) {
    return <p className="text-sm text-red-600">{getUserErrorMessage(error || '강좌를 찾을 수 없습니다.')}</p>
  }

  function renderSeatControl(enrollment: Enrollment, subject: CourseSubject) {
    const key = getSeatKey(enrollment.id, subject.id)
    const originalValue = originalSeatMap[key] ?? ''
    const currentValue = seatDrafts[key] ?? originalValue
    const isSaving = savingSeatKeys.includes(key)
    const isDirty = currentValue.trim() !== originalValue.trim()

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <input
          value={currentValue}
          onChange={(event) => handleSeatDraftChange(enrollment.id, subject.id, event.target.value)}
          onBlur={() => void handleSeatSave(enrollment, subject)}
          onKeyDown={(event) => handleSeatInputKeyDown(event, enrollment, subject)}
          placeholder="-"
          className={`w-full min-w-0 rounded-[8px] border px-3 py-2.5 text-sm text-gray-900 outline-none transition ${
            isDirty
              ? 'border-blue-300 bg-blue-50 focus:border-blue-400'
              : 'border-slate-200 bg-white focus:border-slate-400'
          }`}
        />
        <div className="truncate text-[11px] font-medium text-slate-400">
          {isSaving ? '저장 중...' : isDirty ? '저장 전 변경됨' : '저장됨'}
        </div>
      </div>
    )
  }

  return (
    <>
    <ConfirmationModal
      open={Boolean(subjectDeleteTarget)}
      title="과목을 삭제할까요?"
      description={subjectDeleteTarget ? `"${subjectDeleteTarget.name}" 과목과 연결된 좌석 배정 입력값을 함께 정리합니다.` : undefined}
      confirmLabel="삭제"
      pendingLabel="삭제 중..."
      tone="danger"
      onClose={() => setSubjectDeleteTarget(null)}
      onConfirm={() => {
        void handleSubjectDeleteConfirmed()
      }}
    />
    <div className="flex flex-col gap-6">
      <section className="rounded-[8px] bg-white p-4 shadow-sm sm:p-6">
        <div className="admin-metric-strip">
          {[
            { label: '과목 수', value: summary.subjectCount },
            { label: '좌석 배정 수', value: summary.seatRows },
            { label: '배정된 수강생', value: summary.assignedStudents },
          ].map((item) => (
            <article key={item.label} className="bg-slate-50">
              <p className="text-[11px] font-semibold leading-4 text-gray-500 sm:text-sm">{item.label}</p>
              <p className="mt-1 font-extrabold text-gray-900">{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      {(error || message) && (
        <div className="flex flex-col gap-2">
          {error ? <p className="text-sm text-red-600">{getUserErrorMessage(error)}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      )}

      <AdminSectionTabs label="좌석 배정 세부 메뉴" items={SEAT_SECTIONS}>
        <AdminSectionPanel value="subjects">
          <section className="flex h-full flex-col rounded-[8px] bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="admin-section-title mt-3">과목 관리</h3>
              </div>
            </div>

            <form onSubmit={handleCreateSubject} className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
              <input
                value={newSubject.name}
                onChange={(event) => setNewSubject((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 형사법"
                className="min-w-0 border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
              />
              <input
                type="number"
                value={newSubject.sort_order}
                onChange={(event) =>
                  setNewSubject((current) => ({
                    ...current,
                    sort_order: Number(event.target.value || 0),
                  }))
                }
                placeholder="순서"
                className="min-w-0 border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                className="admin-button admin-button-primary"
              >
                과목 추가
              </button>
            </form>

            <div className="mt-6 flex flex-1 flex-col gap-3">
              {subjects.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-gray-500">
                  아직 등록된 과목이 없습니다.
                </div>
              ) : (
                subjects.map((subject) => (
                  <article key={subject.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <input
                        defaultValue={subject.name}
                        onBlur={(event) => {
                          const value = event.target.value.trim()
                          if (value && value !== subject.name) {
                            void handleSubjectPatch(subject, { name: value })
                          }
                        }}
                        className="min-w-0 border border-slate-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-slate-400"
                      />
                      <input
                        type="number"
                        defaultValue={subject.sort_order}
                        onBlur={(event) => {
                          const value = Number(event.target.value || 0)
                          if (value !== subject.sort_order) {
                            void handleSubjectPatch(subject, { sort_order: value })
                          }
                        }}
                        className="min-w-0 border border-slate-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setSubjectDeleteTarget(subject)}
                        className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition-all duration-200 ease-ios hover:bg-red-100 active:scale-[0.97]"
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

        </AdminSectionPanel>
        <AdminSectionPanel value="bulk">
          <form onSubmit={handleBulkSeats} className="flex h-full flex-col rounded-[8px] bg-white p-4 shadow-sm sm:p-6">
            <h3 className="admin-section-title mt-3">좌석 데이터 붙여넣기</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              두 가지 형식을 지원합니다. 행 단위 형식은 <span className="font-semibold text-gray-900">수험번호, 수강생 이름, 과목명, 좌석번호</span>
              순서로 붙여넣고, 원본 엑셀처럼 <span className="font-semibold text-gray-900">학번, 이름, 연락처 뒤에 과목 열이 이어지는 표</span>
              를 그대로 붙여넣어도 됩니다. 헤더 없는 데이터 행만 붙여넣는 경우에는 현재 강좌의 과목 순서대로 읽습니다.
            </p>

            {subjects.length > 0 ? (
              <p className="mt-3 text-xs font-medium leading-6 text-slate-500">
                현재 과목 순서:
                {' '}
                <span className="font-semibold text-slate-700">
                  {subjects.map((subject, index) => `${index + 1}. ${subject.name}`).join(' / ')}
                </span>
              </p>
            ) : null}

            <div className="mt-5 flex flex-1 flex-col">
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={10}
              placeholder={'2401001\t김철수\t국어\tA-12\n2401002\t이영희\t영어\tB-08'}
              className="w-full min-h-[320px] flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm text-gray-900 outline-none focus:border-slate-400"
            />

            {bulkIssues.length > 0 ? (
              <div className="admin-notice admin-notice-danger mt-4">
                <p className="admin-notice-strong">확인이 필요한 행</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-6">
                  {bulkIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="admin-button admin-button-primary mt-5 disabled:opacity-60 disabled:active:scale-100"
            >
              {submitting ? '반영 중...' : '좌석 일괄 반영'}
            </button>
            </div>
          </form>
        </AdminSectionPanel>

        <AdminSectionPanel value="assignments">
        <section className="min-w-0 rounded-[8px] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="admin-section-title">현재 좌석 배정</h3>
              <p className="mt-2 text-sm text-gray-500">Enter 또는 포커스 해제 시 저장되고, 빈 값으로 저장하면 해당 좌석이 비워집니다.</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setError('')
                setMessage('')
                setBulkIssues([])
                setLoading(true)
                refreshPage()
                  .catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : '좌석 배정 정보를 새로고침하지 못했습니다.')
                  })
                  .finally(() => setLoading(false))
              }}
              className="rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
            >
              새로고침
            </button>
          </div>

          <div className="admin-table-toolbar mt-5 flex flex-col gap-3 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor="seat-search" className="text-sm font-semibold text-slate-700">
                학생 검색
              </label>
              <input
                id="seat-search"
                value={seatSearch}
                onChange={(event) => setSeatSearch(event.target.value)}
                placeholder="수험번호, 수강생 이름, 연락처로 검색"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="rounded-full bg-white px-3 py-2 font-medium">전체 {studentRows.length}명</span>
              <span className="rounded-full bg-white px-3 py-2 font-medium">표시 {filteredStudentRows.length}명</span>
              {seatSearch ? (
                <button
                  type="button"
                  onClick={() => setSeatSearch('')}
                  className="rounded-full bg-slate-200 px-3 py-2 font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-300 active:scale-[0.97]"
                >
                  검색 초기화
                </button>
              ) : null}
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-gray-500">
              먼저 과목을 등록하면 학생별 좌석표를 만들 수 있습니다.
            </div>
          ) : (
            <>
            <div className="mt-5 grid gap-3 md:hidden">
              {filteredStudentRows.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-gray-500">
                  {seatSearch ? '검색 결과가 없습니다.' : '아직 수강생이 없습니다.'}
                </div>
              ) : (
                filteredStudentRows.map((enrollment) => (
                  <article
                    key={enrollment.id}
                    className={`rounded-[8px] border p-4 ${
                      enrollment.status === 'refunded'
                        ? 'border-slate-200 bg-slate-50/70'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">{enrollment.name}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {enrollment.exam_number || '수험번호 없음'} · {enrollment.status === 'active' ? '활성 수강생' : '환불 수강생'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        {subjects.length}과목
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {subjects.map((subject) => (
                        <label key={subject.id} className="min-w-0">
                          <span className="mb-1.5 block truncate text-xs font-semibold text-slate-500">{subject.name}</span>
                          {renderSeatControl(enrollment, subject)}
                        </label>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="admin-table-frame mt-6 hidden overflow-x-auto border border-slate-200 md:block">
              <table className="w-full min-w-[980px] table-fixed divide-y divide-slate-200 text-sm">
                <colgroup>
                  <col className="w-[110px]" />
                  <col className="w-[180px]" />
                  {subjects.map((subject) => (
                    <col key={subject.id} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-left font-semibold text-slate-600">수험번호</th>
                    <th className="px-5 py-4 text-left font-semibold text-slate-600">수강생</th>
                    {subjects.map((subject) => (
                      <th key={subject.id} className="px-5 py-4 text-left font-semibold text-slate-600">
                        {subject.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredStudentRows.length === 0 ? (
                    <tr>
                      <td colSpan={subjects.length + 2} className="px-5 py-10 text-center text-gray-500">
                        {seatSearch ? '검색 결과가 없습니다.' : '아직 수강생이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStudentRows.map((enrollment) => (
                      <tr key={enrollment.id} className={enrollment.status === 'refunded' ? 'bg-slate-50/60' : undefined}>
                        <td className="px-5 py-4 align-top text-gray-500">{enrollment.exam_number || '-'}</td>
                        <td className="px-5 py-4 align-top">
                          <div className="font-medium text-gray-900">{enrollment.name}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            {enrollment.status === 'active' ? '활성 수강생' : '환불 수강생'}
                          </div>
                        </td>
                        {subjects.map((subject) => {
                          const key = getSeatKey(enrollment.id, subject.id)

                          return (
                            <td key={key} className="px-5 py-4 align-top">
                              {renderSeatControl(enrollment, subject)}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
        </AdminSectionPanel>
      </AdminSectionTabs>
    </div>
    </>
  )
}
