'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, CourseSubject } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'

type DashboardRecord = {
  enrollmentId: number
  studentName: string
  examNumber: string | null
  phone: string
}

type DashboardPayload = {
  date: string
  attendanceStarted: boolean
  attendanceStartDate: string | null
  totalEnrolled: number
  presentCount: number
  absentCount: number
  attendanceRate: number
  absentees: Array<DashboardRecord & {
    consecutiveAbsences: number
    attendanceStartDate: string | null
    seatLabel?: string | null
  }>
  recentRecords: Array<DashboardRecord & {
    attendedAt: string
  }>
  displaySession: {
    id: number | null
    isActive: boolean
    expiresAt: string | null
    subjectId: number | null
    subjectName: string | null
  }
}

type AbsenceReportPayload = {
  threshold: number
  flaggedStudents: Array<{
    enrollmentId: number
    studentName: string
    examNumber: string | null
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
    seatLabel: string | null
    subjectId: number | null
    subjectName: string | null
  }>
}

function getToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function formatDateTime(value: string | null) {
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

function normalizeAttendanceSearchValue(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '').replace(/-/g, '').toLowerCase()
}

function matchesAttendanceSearch(
  keyword: string,
  record: { studentName: string; examNumber: string | null; phone: string },
) {
  const normalizedKeyword = normalizeAttendanceSearchValue(keyword)
  if (!normalizedKeyword) {
    return true
  }

  return [
    normalizeAttendanceSearchValue(record.studentName),
    normalizeAttendanceSearchValue(record.examNumber),
    normalizeAttendanceSearchValue(record.phone),
  ].some((value) => value.includes(normalizedKeyword))
}

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function StatCard(props: { label: string; value: string | number; valueClassName?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 px-5 py-4">
      <p className="text-xs font-semibold text-slate-500">{props.label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${props.valueClassName ?? 'text-slate-900'}`}>{props.value}</p>
    </article>
  )
}

export default function AdminAttendancePage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(null)
  const [subjects, setSubjects] = useState<CourseSubject[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [absenceReport, setAbsenceReport] = useState<AbsenceReportPayload | null>(null)
  const [date, setDate] = useState(getToday())
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [durationMinutes, setDurationMinutes] = useState(10)
  const [displayUrl, setDisplayUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const courseLoadedRef = useRef(false)

  useEffect(() => {
    courseLoadedRef.current = false
    setCourse(null)
    setSubjects([])
    setSelectedSubjectId('')
  }, [courseId])

  const loadData = useCallback(async () => {
    const reportQuery = new URLSearchParams({
      courseId: String(courseId),
      threshold: '2',
    })
    if (selectedSubjectId) {
      reportQuery.set('subjectId', selectedSubjectId)
    }

    const [courseResponse, subjectsResponse, dashboardResponse, reportResponse] = await Promise.all([
      courseLoadedRef.current
        ? Promise.resolve(null)
        : fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
      fetch(`/api/courses/${courseId}/subjects`, { cache: 'no-store' }),
      fetch(`/api/attendance/admin/dashboard?courseId=${courseId}&date=${date}`, { cache: 'no-store' }),
      fetch(`/api/attendance/admin/absence-report?${reportQuery.toString()}`, { cache: 'no-store' }),
    ])

    const coursePayload = courseResponse ? await readJson<{ course?: Course; error?: string }>(courseResponse) : null
    const subjectsPayload = await readJson<{ subjects?: CourseSubject[]; error?: string }>(subjectsResponse)
    const dashboardPayload = await readJson<DashboardPayload & { error?: string }>(dashboardResponse)
    const reportPayload = await readJson<AbsenceReportPayload & { error?: string }>(reportResponse)

    if (courseResponse && !courseResponse.ok) {
      throw new Error(coursePayload?.error ?? '강의 정보를 불러오지 못했습니다.')
    }

    if (!dashboardResponse.ok) {
      throw new Error(dashboardPayload?.error ?? '출석 현황을 불러오지 못했습니다.')
    }

    if (!subjectsResponse.ok) {
      throw new Error(subjectsPayload?.error ?? '과목 정보를 불러오지 못했습니다.')
    }

    if (!reportResponse.ok) {
      throw new Error(reportPayload?.error ?? '결석 리포트를 불러오지 못했습니다.')
    }

    if (coursePayload?.course) {
      setCourse(coursePayload.course)
      courseLoadedRef.current = true
    }

    setSubjects(subjectsPayload?.subjects ?? [])
    setDashboard(dashboardPayload as DashboardPayload)
    setAbsenceReport(reportPayload as AbsenceReportPayload)
  }, [courseId, date, selectedSubjectId])

  useEffect(() => {
    let cancelled = false

    loadData()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '출석 정보를 불러오지 못했습니다.')
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
  }, [loadData])

  useEffect(() => {
    if (!dashboard?.displaySession.isActive) {
      return
    }

    const reload = () => {
      if (document.visibilityState === 'visible') {
        void loadData().catch(() => null)
      }
    }

    const timer = setInterval(reload, 10_000)
    document.addEventListener('visibilitychange', reload)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [dashboard?.displaySession.isActive, loadData])

  const progressWidth = useMemo(() => `${dashboard?.attendanceRate ?? 0}%`, [dashboard?.attendanceRate])
  const filteredRecentRecords = useMemo(
    () => (dashboard?.recentRecords ?? []).filter((record) => matchesAttendanceSearch(attendanceSearch, record)),
    [attendanceSearch, dashboard?.recentRecords],
  )
  const filteredAbsentees = useMemo(
    () => (dashboard?.absentees ?? []).filter((student) => matchesAttendanceSearch(attendanceSearch, student)),
    [attendanceSearch, dashboard?.absentees],
  )
  const isBeforeAttendanceStartForSelectedDate = Boolean(
    dashboard?.attendanceStartDate && !dashboard.attendanceStarted,
  )
  const isBeforeAttendanceStartToday = Boolean(
    course?.enrolled_from && getToday() < course.enrolled_from,
  )
  const selectedSubjectName = useMemo(() => (
    subjects.find((subject) => String(subject.id) === selectedSubjectId)?.name ?? null
  ), [selectedSubjectId, subjects])
  const requiresSubjectSelection = subjects.length > 0
  const startBlockedBySubjectSelection = requiresSubjectSelection && !selectedSubjectId

  async function handleStart() {
    if (startBlockedBySubjectSelection) {
      setError('과목이 있는 강좌는 과목을 선택한 뒤 출석을 시작할 수 있습니다.')
      setMessage('')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/attendance/admin/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        durationMinutes,
        subjectId: selectedSubjectId ? Number(selectedSubjectId) : null,
      }),
    })
    const payload = await readJson<{ displayUrl?: string; error?: string }>(response)
    setWorking(false)

    if (!response.ok) {
      setError(payload?.error ?? '출석 세션을 시작하지 못했습니다.')
      return
    }

    setDisplayUrl(payload?.displayUrl ?? '')
    setMessage(selectedSubjectName ? `${selectedSubjectName} 출석 세션을 시작했습니다.` : '출석 세션을 시작했습니다.')
    await loadData().catch(() => null)
  }

  async function handleStop() {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/attendance/admin/display', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
    })
    const payload = await readJson<{ error?: string }>(response)
    setWorking(false)

    if (!response.ok) {
      setError(payload?.error ?? '출석 세션을 종료하지 못했습니다.')
      return
    }

    setDisplayUrl('')
    setMessage('출석 세션을 종료했습니다.')
    await loadData().catch(() => null)
  }

  async function handleOverride(enrollmentId: number, status: 'present' | 'absent') {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/attendance/admin/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        enrollmentId,
        date,
        status,
      }),
    })
    const payload = await readJson<{ error?: string }>(response)
    setWorking(false)

    if (!response.ok) {
      setError(payload?.error ?? '수동 출석 처리에 실패했습니다.')
      return
    }

    setMessage(status === 'present' ? '수동 출석 처리했습니다.' : '결석 처리했습니다.')
    await loadData().catch(() => null)
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">출석 페이지를 불러오는 중입니다...</p>
  }

  if (!course || !dashboard) {
    return <p className="py-12 text-center text-sm text-red-500">{error || '출석 정보를 찾을 수 없습니다.'}</p>
  }

  if (!course.feature_attendance) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">이 강의는 출석 체크 기능이 비활성화되어 있습니다.</p>
        <Link
          href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
          className="inline-flex w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          강의 설정으로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
              className="text-xs font-medium text-gray-400 hover:underline"
            >
              &larr; {course.name}
            </Link>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">출석 관리</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              교실 화면 코드 기반 출석과 결석 누적 현황을 한곳에서 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {subjects.length > 0 ? (
              <select
                value={selectedSubjectId}
                onChange={(event) => setSelectedSubjectId(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
              >
                <option value="">과목 선택</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
            >
              <option value={5}>5분</option>
              <option value={10}>10분</option>
              <option value={15}>15분</option>
              <option value={30}>30분</option>
            </select>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={working || startBlockedBySubjectSelection}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              출석 시작
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={working || !dashboard.displaySession.isActive}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              출석 종료
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4">
          <p className="text-sm font-semibold text-sky-900">운영 가이드</p>
          <div className="mt-2 space-y-1 text-sm text-sky-800">
            <p>1. 과목이 있는 강좌는 먼저 과목을 선택합니다.</p>
            <p>2. 선택한 과목으로 `출석 시작`을 눌러 교실 화면을 엽니다.</p>
            <p>3. 수업이 끝나면 `출석 종료` 후 다음 과목으로 다시 시작합니다.</p>
          </div>
          {requiresSubjectSelection ? (
            <p className="mt-3 text-xs font-medium text-sky-700">
              이 강좌는 과목별 출석 경고를 사용하므로 `전체 강좌`로는 시작할 수 없습니다.
            </p>
          ) : null}
        </div>

        {(error || message) ? (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <StatCard label="출석 대상" value={dashboard.totalEnrolled} />
          <StatCard label="출석" value={dashboard.presentCount} valueClassName="text-emerald-600" />
          <StatCard label="결석" value={dashboard.absentCount} valueClassName="text-rose-600" />
          <StatCard label="출석률" value={`${dashboard.attendanceRate}%`} valueClassName="text-blue-600" />
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-700">{dashboard.date}</span>
            <div className="text-right">
              <span className={dashboard.displaySession.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                {dashboard.displaySession.isActive
                  ? `세션 진행 중 / ${formatDateTime(dashboard.displaySession.expiresAt)} 종료`
                  : '진행 중인 세션 없음'}
              </span>
              {dashboard.displaySession.isActive && dashboard.displaySession.subjectName ? (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  과목 {dashboard.displaySession.subjectName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-[#0071e3]" style={{ width: progressWidth }} />
          </div>
        </div>

        {displayUrl ? (
          <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs font-semibold text-slate-500">방금 생성한 출석 화면 URL</p>
            <input
              value={displayUrl}
              readOnly
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(displayUrl)
                  setMessage('출석 화면 URL을 복사했습니다.')
                }}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                URL 복사
              </button>
              <a
                href={displayUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                새 창으로 열기
              </a>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <h3 className="text-lg font-extrabold text-gray-900">오늘 출석</h3>
            <input
              type="text"
              value={attendanceSearch}
              onChange={(event) => setAttendanceSearch(event.target.value)}
              placeholder="이름, 연락처, 수험번호 검색"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-64"
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </div>

        {isBeforeAttendanceStartForSelectedDate ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            수강 시작일 {dashboard.attendanceStartDate} 이전 날짜라서 결석 집계와 출석 목록은 표시하지 않습니다.
          </div>
        ) : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">최근 출석</h4>
              <span className="text-xs text-slate-400">{filteredRecentRecords.length}건</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
              {filteredRecentRecords.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  {attendanceSearch.trim() ? '검색 결과가 없습니다.' : '아직 출석 기록이 없습니다.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredRecentRecords.map((record) => (
                    <div key={record.enrollmentId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {record.examNumber ? `[${record.examNumber}] ` : ''}
                          {record.studentName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(record.attendedAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`${record.studentName} 수강생을 결석 처리할까요?`)) {
                            return
                          }
                          void handleOverride(record.enrollmentId, 'absent')
                        }}
                        disabled={working}
                        className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                      >
                        결석 처리
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">결석 수강생</h4>
              <span className="text-xs text-slate-400">{filteredAbsentees.length}명</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
              {filteredAbsentees.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  {attendanceSearch.trim() ? '검색 결과가 없습니다.' : '모든 수강생이 출석했습니다.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredAbsentees.map((student) => (
                    <div key={student.enrollmentId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {student.examNumber ? `[${student.examNumber}] ` : ''}
                          {student.studentName}
                        </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{student.consecutiveAbsences}일 연속 결석</span>
                      {student.attendanceStartDate ? <span>기준일 {student.attendanceStartDate}</span> : null}
                      {student.seatLabel ? <span>좌석 {student.seatLabel}</span> : null}
                      {student.consecutiveAbsences >= 2 ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">주의</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOverride(student.enrollmentId, 'present')}
                        disabled={working}
                        className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        출석 처리
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">누적 결석 경고</h3>
            {selectedSubjectName ? (
              <p className="mt-1 text-xs font-medium text-slate-500">{selectedSubjectName}만 보는 중</p>
            ) : null}
          </div>
          <span className="text-xs text-slate-400">기준 2회</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          연속 불참은 강좌 시작일과 학생 등록일 중 더 늦은 날짜부터, 과목별 출석 기록 기준으로 계산합니다.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          {!absenceReport || absenceReport.flaggedStudents.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {isBeforeAttendanceStartToday
                ? `수강 시작일 ${course.enrolled_from} 전이라 누적 결석 경고가 아직 없습니다.`
                : '현재 기준을 넘는 결석 수강생이 없습니다.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {absenceReport.flaggedStudents.map((student) => (
                <div key={`${student.enrollmentId}:${student.subjectId ?? 'course'}`} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {student.examNumber ? `[${student.examNumber}] ` : ''}
                      {student.studentName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{student.consecutiveAbsences}회 연속 불참</span>
                      {student.subjectName ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                          {student.subjectName}
                        </span>
                      ) : null}
                      {student.lastAttendedDate ? <span>마지막 출석 {student.lastAttendedDate}</span> : null}
                      {student.attendanceStartDate ? <span>기준일 {student.attendanceStartDate}</span> : null}
                      {student.seatLabel ? <span>좌석 {student.seatLabel}</span> : null}
                    </div>
                  </div>
                  <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                    누적 결석
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
