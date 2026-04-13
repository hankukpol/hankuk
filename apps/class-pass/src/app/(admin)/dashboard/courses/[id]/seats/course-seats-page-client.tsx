'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
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

function getSeatKey(enrollmentId: number, subjectId: number) {
  return `${enrollmentId}:${subjectId}`
}

function buildSeatDraftMap(seatAssignments: SeatAssignment[]) {
  return seatAssignments.reduce<Record<string, string>>((accumulator, assignment) => {
    accumulator[getSeatKey(assignment.enrollment_id, assignment.subject_id)] = assignment.seat_number
    return accumulator
  }, {})
}

async function fetchSeatsPageData(courseId: number): Promise<SeatsPageData> {
  const [courseResponse, seatsResponse, enrollmentsResponse] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/seats?courseId=${courseId}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?courseId=${courseId}`, { cache: 'no-store' }),
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
  const tenant = useTenantConfig()
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

  async function refreshPage() {
    const data = await fetchSeatsPageData(courseId)
    setCourse(data.course)
    setSubjects(data.subjects)
    setSeatAssignments(data.seatAssignments)
    setEnrollments(data.enrollments)
    setSeatDrafts(buildSeatDraftMap(data.seatAssignments))
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }

    if (initialLoaded) {
      return
    }

    fetchSeatsPageData(courseId)
      .then((data) => {
        setCourse(data.course)
        setSubjects(data.subjects)
        setSeatAssignments(data.seatAssignments)
        setEnrollments(data.enrollments)
        setSeatDrafts(buildSeatDraftMap(data.seatAssignments))
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '좌석 관리 페이지를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId, initialLoaded])

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

  async function handleSubjectDelete(subject: CourseSubject) {
    const confirmed = window.confirm(`"${subject.name}" 과목을 삭제할까요?`)
    if (!confirmed) {
      return
    }

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
      const key = getSeatKey(enrollment.id, subject.id)
      setSeatDrafts((current) => ({
        ...current,
        [key]: originalSeatMap[key] ?? '',
      }))
      event.currentTarget.blur()
    }
  }

  async function handleSeatSave(enrollment: Enrollment, subject: CourseSubject) {
    const key = getSeatKey(enrollment.id, subject.id)
    const nextSeatNumber = (seatDrafts[key] ?? '').trim()
    const originalSeatNumber = (originalSeatMap[key] ?? '').trim()

    if (nextSeatNumber === originalSeatNumber) {
      return
    }

    setSavingSeatKeys((current) => [...current, key])
    setError('')
    setMessage('')
    setBulkIssues([])

    const response = await fetch('/api/seats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        enrollmentId: enrollment.id,
        subjectId: subject.id,
        seatNumber: nextSeatNumber || null,
      }),
    })
    const payload = (await response.json().catch(() => null)) as SeatPatchResponse | null
    setSavingSeatKeys((current) => current.filter((value) => value !== key))

    if (!response.ok) {
      setError(payload?.error ?? '좌석을 수정하지 못했습니다.')
      setSeatDrafts((current) => ({
        ...current,
        [key]: originalSeatMap[key] ?? '',
      }))
      return
    }

    if (payload?.action === 'cleared') {
      setSeatAssignments((current) =>
        current.filter(
          (entry) => !(entry.enrollment_id === enrollment.id && entry.subject_id === subject.id),
        ),
      )
      setSeatDrafts((current) => ({
        ...current,
        [key]: '',
      }))
      setMessage(`${enrollment.name} 학생의 ${subject.name} 좌석을 비웠습니다.`)
      return
    }

    if (payload?.seatAssignment) {
      const nextAssignment: SeatAssignment = {
        ...payload.seatAssignment,
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
        return [...filtered, nextAssignment]
      })
    }

    setSeatDrafts((current) => ({
      ...current,
      [key]: nextSeatNumber,
    }))
    setMessage(`${enrollment.name} 학생의 ${subject.name} 좌석을 저장했습니다.`)
  }

  if (loading) {
    return <p className="text-sm text-gray-500">좌석 관리 화면을 불러오는 중입니다...</p>
  }

  if (!course) {
    return <p className="text-sm text-red-600">{error || '강좌를 찾을 수 없습니다.'}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
              className="text-xs font-medium text-gray-400 hover:underline"
            >
              ← {course.name}
            </Link>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">좌석 배정</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              강좌마다 과목 구성과 정렬 순서가 다를 수 있습니다. 과목을 먼저 정리한 뒤
              탭 구분 텍스트를 <span className="font-semibold text-gray-900">수험번호, 수강생 이름, 과목명, 좌석번호</span>
              순서로 붙여넣어 주세요.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              강좌 설정
            </Link>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}/students`, tenant.type)}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              수강생 관리
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: '과목 수', value: summary.subjectCount },
            { label: '좌석 배정 수', value: summary.seatRows },
            { label: '배정된 수강생', value: summary.assignedStudents },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-semibold text-gray-500">{item.label}</p>
              <p className="mt-3 text-3xl font-extrabold text-gray-900">{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      {(error || message) && (
        <div className="flex flex-col gap-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      )}

      <div className="grid gap-6">
        <div className="grid gap-6 xl:grid-cols-2 xl:items-stretch">
          <section className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Subjects</p>
                <h3 className="mt-3 text-xl font-extrabold text-gray-900">과목 관리</h3>
                <p className="mt-2 text-sm text-gray-500">
                  붙여넣기 후 좌석 표시는 강좌별 과목 정렬순서 기준으로 보입니다.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateSubject} className="mt-6 grid gap-3 md:grid-cols-[1fr,120px,auto]">
              <input
                value={newSubject.name}
                onChange={(event) => setNewSubject((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 형사법"
                className="rounded-xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
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
                className="rounded-xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
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
                    <div className="grid gap-3 md:grid-cols-[1fr,120px,auto]">
                      <input
                        defaultValue={subject.name}
                        onBlur={(event) => {
                          const value = event.target.value.trim()
                          if (value && value !== subject.name) {
                            void handleSubjectPatch(subject, { name: value })
                          }
                        }}
                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-slate-400"
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
                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSubjectDelete(subject)}
                        className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <form onSubmit={handleBulkSeats} className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Bulk Paste</p>
            <h3 className="mt-3 text-xl font-extrabold text-gray-900">좌석 데이터 붙여넣기</h3>
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
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">확인이 필요한 행</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-red-700">
                  {bulkIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--theme)' }}
            >
              {submitting ? '반영 중...' : '좌석 일괄 반영'}
            </button>
            </div>
          </form>
        </div>

        <section className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-gray-900">현재 좌석 배정</h3>
              <p className="mt-2 text-sm text-gray-500">
                한 학생을 한 줄로 보고 모든 과목 좌석을 한 번에 수정할 수 있습니다. Enter 또는 포커스 해제 시 저장되고, 빈 값으로 저장하면 해당 좌석이 비워집니다.
              </p>
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
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              새로고침
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 lg:flex-row lg:items-end lg:justify-between">
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
                  className="rounded-full bg-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-300"
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
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
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
                          const originalValue = originalSeatMap[key] ?? ''
                          const currentValue = seatDrafts[key] ?? originalValue
                          const isSaving = savingSeatKeys.includes(key)
                          const isDirty = currentValue.trim() !== originalValue.trim()

                          return (
                            <td key={key} className="px-5 py-4 align-top">
                              <div className="flex flex-col gap-2">
                                <input
                                  value={currentValue}
                                  onChange={(event) => handleSeatDraftChange(enrollment.id, subject.id, event.target.value)}
                                  onBlur={() => void handleSeatSave(enrollment, subject)}
                                  onKeyDown={(event) => handleSeatInputKeyDown(event, enrollment, subject)}
                                  placeholder="-"
                                  className={`w-full min-w-0 rounded-xl border px-4 py-2.5 text-sm text-gray-900 outline-none transition ${
                                    isDirty
                                      ? 'border-blue-300 bg-blue-50 focus:border-blue-400'
                                      : 'border-slate-200 bg-white focus:border-slate-400'
                                  }`}
                                />
                                <div className="text-[11px] font-medium text-slate-400">
                                  {isSaving ? '저장 중...' : isDirty ? '저장 전 변경됨' : '저장됨'}
                                </div>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
