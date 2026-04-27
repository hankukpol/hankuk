'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTenantConfig } from '@/components/TenantProvider'
import { useMotionConfig } from '@/lib/motion'
import { withTenantPrefix } from '@/lib/tenant'
import type { Course, CourseSubject, Enrollment } from '@/types/database'
import {
  AttendanceExcuseModal,
  type AttendanceExcuseRecord,
  type AttendanceExcuseStudentOption,
} from './attendance-excuse-modal'
import { AttendanceExcusesPanel } from './attendance-excuses-panel'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'

type DashboardRecord = {
  enrollmentId: number
  studentName: string
  examNumber: string | null
  phone: string
}

type DashboardTargetRecord = DashboardRecord & {
  seatLabel: string | null
  status: 'present' | 'absent' | 'excused'
  attendedAt: string | null
  consecutiveAbsences: number
  attendanceStartDate: string | null
  excuseId: number | null
  excuseReason: string | null
  excuseSubjectId: number | null
  excuseSubjectName: string | null
}

type DashboardPayload = {
  date: string
  attendanceStarted: boolean
  attendanceStartDate: string | null
  totalEnrolled: number
  presentCount: number
  absentCount: number
  excusedCount: number
  attendanceRate: number
  targets: DashboardTargetRecord[]
  absentees: Array<DashboardRecord & {
    consecutiveAbsences: number
    attendanceStartDate: string | null
    seatLabel: string | null
  }>
  recentRecords: Array<DashboardRecord & {
    seatLabel: string | null
    attendedAt: string
  }>
  checkedSubjects: Array<{
    subjectId: number | null
    subjectName: string
    sessionCount: number
    latestStartedAt: string
    isActive: boolean
  }>
  displaySession: {
    id: number | null
    isActive: boolean
    expiresAt: string | null
    subjectId: number | null
    subjectName: string | null
  }
}

type WarningRow = {
  enrollmentId: number
  studentName: string
  examNumber: string | null
  consecutiveAbsences: number
  lastAttendedDate: string | null
  attendanceStartDate: string | null
  seatLabel: string | null
  subjectId: number | null
  subjectName: string | null
}

type AbsenceReportPayload = {
  threshold: number
  flaggedStudents: WarningRow[]
}

type TabKey = 'targets' | 'attendees' | 'absentees' | 'warnings' | 'excuses'

type ExcuseModalState = {
  open: boolean
  editingExcuse: AttendanceExcuseRecord | null
  lockedEnrollmentId: number | null
  defaultSubjectId: number | null
  defaultDate: string
}

type OverrideConfirmationState = {
  enrollmentId: number
  studentName: string
  status: 'present' | 'absent'
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

function formatTime(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
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
  const motionConfig = useMotionConfig()

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${
        props.active
          ? 'text-[#1d1d1f]'
          : 'text-slate-500 hover:text-[#1d1d1f]'
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
      {props.active ? (
        <motion.div
          layoutId="attendance-tabs"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d1d1f]"
          transition={motionConfig.tab}
        />
      ) : null}
    </button>
  )
}

function StatusChip(props: { status: 'present' | 'absent' | 'excused' }) {
  return props.status === 'present' ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      출석
    </span>
  ) : props.status === 'excused' ? (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      사유
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
      결석
    </span>
  )
}

function ExcuseActionButton(props: {
  excuse: AttendanceExcuseRecord | null
  onCreate: () => void
  onEdit: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {props.excuse ? (
        <>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            사유
          </span>
          <button
            type="button"
            onClick={props.onEdit}
            disabled={props.disabled}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
          >
            수정
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={props.onCreate}
          disabled={props.disabled}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
        >
          사유 등록
        </button>
      )}
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

export default function AdminAttendancePage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(null)
  const [subjects, setSubjects] = useState<CourseSubject[]>([])
  const [studentOptions, setStudentOptions] = useState<AttendanceExcuseStudentOption[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [absenceReport, setAbsenceReport] = useState<AbsenceReportPayload | null>(null)
  const [dailyExcuses, setDailyExcuses] = useState<AttendanceExcuseRecord[]>([])
  const [date, setDate] = useState(getToday())
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(10)
  const [displayUrl, setDisplayUrl] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('targets')
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [excuseModalState, setExcuseModalState] = useState<ExcuseModalState>({
    open: false,
    editingExcuse: null,
    lockedEnrollmentId: null,
    defaultSubjectId: null,
    defaultDate: getToday(),
  })
  const [overrideConfirmation, setOverrideConfirmation] = useState<OverrideConfirmationState | null>(null)
  const [excusesRefreshKey, setExcusesRefreshKey] = useState(0)
  const courseLoadedRef = useRef(false)
  const studentsLoadedRef = useRef(false)

  useEffect(() => {
    courseLoadedRef.current = false
    studentsLoadedRef.current = false
    setCourse(null)
    setSubjects([])
    setStudentOptions([])
    setSelectedSubjectId('')
    setDailyExcuses([])
    setExcuseModalState({
      open: false,
      editingExcuse: null,
      lockedEnrollmentId: null,
      defaultSubjectId: null,
      defaultDate: getToday(),
    })
    setOverrideConfirmation(null)
  }, [courseId])

  const loadData = useCallback(async () => {
    const dashboardQuery = new URLSearchParams({
      courseId: String(courseId),
      date,
    })
    const reportQuery = new URLSearchParams({
      courseId: String(courseId),
      threshold: '2',
    })
    const excuseQuery = new URLSearchParams({
      courseId: String(courseId),
      fromDate: date,
      toDate: date,
    })

    if (selectedSubjectId) {
      dashboardQuery.set('subjectId', selectedSubjectId)
      reportQuery.set('subjectId', selectedSubjectId)
    }

    const [courseResponse, studentsResponse, subjectsResponse, dashboardResponse, reportResponse, excusesResponse] = await Promise.all([
      courseLoadedRef.current
        ? Promise.resolve(null)
        : fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
      studentsLoadedRef.current
        ? Promise.resolve(null)
        : fetch(`/api/courses/${courseId}/bootstrap?view=students`, { cache: 'no-store' }),
      fetch(`/api/courses/${courseId}/subjects`, { cache: 'no-store' }),
      fetch(`/api/attendance/admin/dashboard?${dashboardQuery.toString()}`, { cache: 'no-store' }),
      fetch(`/api/attendance/admin/absence-report?${reportQuery.toString()}`, { cache: 'no-store' }),
      fetch(`/api/attendance/admin/excuses?${excuseQuery.toString()}`, { cache: 'no-store' }),
    ])

    const coursePayload = courseResponse ? await readJson<{ course?: Course; error?: string }>(courseResponse) : null
    const studentsPayload = studentsResponse
      ? await readJson<{ enrollments?: Enrollment[]; course?: Course; error?: string }>(studentsResponse)
      : null
    const subjectsPayload = await readJson<{ subjects?: CourseSubject[]; error?: string }>(subjectsResponse)
    const dashboardPayload = await readJson<DashboardPayload & { error?: string }>(dashboardResponse)
    const reportPayload = await readJson<AbsenceReportPayload & { error?: string }>(reportResponse)
    const excusesPayload = await readJson<{ excuses?: AttendanceExcuseRecord[]; error?: string }>(excusesResponse)

    if (courseResponse && !courseResponse.ok) {
      throw new Error(coursePayload?.error ?? '강의 정보를 불러오지 못했습니다.')
    }

    if (studentsResponse && !studentsResponse.ok) {
      throw new Error(studentsPayload?.error ?? '학생 목록을 불러오지 못했습니다.')
    }

    if (!dashboardResponse.ok) {
      throw new Error(dashboardPayload?.error ?? '출석 현황을 불러오지 못했습니다.')
    }

    if (!subjectsResponse.ok) {
      throw new Error(subjectsPayload?.error ?? '과목 정보를 불러오지 못했습니다.')
    }

    if (!reportResponse.ok) {
      throw new Error(reportPayload?.error ?? '결석 경고 정보를 불러오지 못했습니다.')
    }

    if (!excusesResponse.ok) {
      throw new Error(excusesPayload?.error ?? '사유서 정보를 불러오지 못했습니다.')
    }

    if (coursePayload?.course) {
      setCourse(coursePayload.course)
      courseLoadedRef.current = true
    }

    if (studentsPayload?.course && !courseLoadedRef.current) {
      setCourse(studentsPayload.course)
      courseLoadedRef.current = true
    }

    if (studentsPayload?.enrollments) {
      setStudentOptions(
        studentsPayload.enrollments
          .filter((enrollment) => enrollment.status === 'active')
          .map((enrollment) => ({
            id: enrollment.id,
            name: enrollment.name,
            examNumber: enrollment.exam_number,
            phone: enrollment.phone,
          })),
      )
      studentsLoadedRef.current = true
    }

    setSubjects(subjectsPayload?.subjects ?? [])
    setDashboard(dashboardPayload as DashboardPayload)
    setAbsenceReport(reportPayload as AbsenceReportPayload)
    setDailyExcuses(excusesPayload?.excuses ?? [])
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

  useEffect(() => {
    if (selectedSubjectId || !dashboard || subjects.length === 0) {
      return
    }

    const today = getToday()
    const autoSubjectId = date === today
      ? dashboard.displaySession.subjectId
      : dashboard.checkedSubjects.length === 1
        ? dashboard.checkedSubjects[0]?.subjectId ?? null
        : null

    if (autoSubjectId != null) {
      setSelectedSubjectId(String(autoSubjectId))
    }
  }, [dashboard, date, selectedSubjectId, subjects.length])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, attendanceSearch, pageSize, date, selectedSubjectId])

  const progressWidth = useMemo(() => `${dashboard?.attendanceRate ?? 0}%`, [dashboard?.attendanceRate])
  const selectedSubjectName = useMemo(
    () => subjects.find((subject) => String(subject.id) === selectedSubjectId)?.name ?? null,
    [selectedSubjectId, subjects],
  )
  const effectiveSubjectId = useMemo(() => {
    if (selectedSubjectId) {
      return Number(selectedSubjectId)
    }

    if (dashboard?.displaySession.subjectId != null) {
      return dashboard.displaySession.subjectId
    }

    if (dashboard?.checkedSubjects.length === 1) {
      return dashboard.checkedSubjects[0]?.subjectId ?? null
    }

    return null
  }, [dashboard, selectedSubjectId])
  const effectiveSubjectName = useMemo(() => {
    if (selectedSubjectName) {
      return selectedSubjectName
    }

    if (dashboard?.displaySession.subjectName) {
      return dashboard.displaySession.subjectName
    }

    if (dashboard?.checkedSubjects.length === 1) {
      return dashboard.checkedSubjects[0]?.subjectName ?? null
    }

    return null
  }, [dashboard, selectedSubjectName])
  const requiresSubjectSelection = subjects.length > 0
  const startBlockedBySubjectSelection = requiresSubjectSelection && !selectedSubjectId
  const isBeforeAttendanceStartForSelectedDate = Boolean(
    dashboard?.attendanceStartDate && !dashboard.attendanceStarted,
  )
  const isBeforeAttendanceStartToday = Boolean(course?.enrolled_from && getToday() < course.enrolled_from)
  const dailyExcusesByEnrollment = useMemo(() => {
    const nextMap = new Map<number, AttendanceExcuseRecord[]>()

    for (const excuse of dailyExcuses) {
      const entries = nextMap.get(excuse.enrollmentId) ?? []
      entries.push(excuse)
      nextMap.set(excuse.enrollmentId, entries)
    }

    return nextMap
  }, [dailyExcuses])

  const findDailyExcuse = useCallback((enrollmentId: number, subjectId?: number | null) => {
    const excuses = dailyExcusesByEnrollment.get(enrollmentId) ?? []
    if (excuses.length === 0) {
      return null
    }

    if (subjectId != null) {
      return excuses.find((excuse) => excuse.subjectId === subjectId) ?? null
    }

    return excuses.length === 1 ? excuses[0] : null
  }, [dailyExcusesByEnrollment])

  const filteredTargets = useMemo(() => (
    (dashboard?.targets ?? []).filter((row) => matchesFields(attendanceSearch, [
      row.studentName,
      row.examNumber,
      row.phone,
      row.seatLabel,
      row.status === 'present' ? '출석' : row.status === 'excused' ? '사유' : '결석',
      row.excuseReason,
    ]))
  ), [attendanceSearch, dashboard?.targets])

  const filteredAttendees = useMemo(() => (
    [...(dashboard?.targets ?? [])]
      .filter((row) => row.status === 'present')
      .sort((left, right) => (
        (right.attendedAt ?? '').localeCompare(left.attendedAt ?? '')
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      ))
      .filter((row) => matchesFields(attendanceSearch, [
        row.studentName,
        row.examNumber,
        row.phone,
        row.seatLabel,
        row.attendedAt,
      ]))
  ), [attendanceSearch, dashboard?.targets])

  const filteredAbsentees = useMemo(() => (
    (dashboard?.absentees ?? []).filter((row) => matchesFields(attendanceSearch, [
      row.studentName,
      row.examNumber,
      row.phone,
      row.seatLabel,
    ]))
  ), [attendanceSearch, dashboard?.absentees])

  const filteredWarnings = useMemo(() => (
    (absenceReport?.flaggedStudents ?? []).filter((row) => matchesFields(attendanceSearch, [
      row.studentName,
      row.examNumber,
      row.seatLabel,
      row.subjectName,
      findDailyExcuse(row.enrollmentId, row.subjectId)?.reason,
    ]))
  ), [absenceReport?.flaggedStudents, attendanceSearch, findDailyExcuse])

  const activeRowsCount = activeTab === 'targets'
    ? filteredTargets.length
    : activeTab === 'attendees'
      ? filteredAttendees.length
      : activeTab === 'absentees'
        ? filteredAbsentees.length
        : activeTab === 'warnings'
          ? filteredWarnings.length
          : 0

  const pageCount = activeTab === 'excuses'
    ? 1
    : Math.max(1, Math.ceil(activeRowsCount / pageSize))

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  const pageStart = (currentPage - 1) * pageSize
  const pagedTargets = filteredTargets.slice(pageStart, pageStart + pageSize)
  const pagedAttendees = filteredAttendees.slice(pageStart, pageStart + pageSize)
  const pagedAbsentees = filteredAbsentees.slice(pageStart, pageStart + pageSize)
  const pagedWarnings = filteredWarnings.slice(pageStart, pageStart + pageSize)
  const latestRecentRecord = dashboard?.recentRecords[0] ?? null

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
        subjectId: selectedSubjectId ? Number(selectedSubjectId) : null,
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

  function requestOverrideConfirmation(params: OverrideConfirmationState) {
    setOverrideConfirmation(params)
  }

  function confirmOverride() {
    if (!overrideConfirmation) {
      return
    }

    const { enrollmentId, status } = overrideConfirmation
    setOverrideConfirmation(null)
    void handleOverride(enrollmentId, status)
  }

  function openCreateExcuseModal(options?: {
    enrollmentId?: number
    subjectId?: number | null
    date?: string
  }) {
    if (subjects.length === 0) {
      setError('사유서를 등록할 과목이 없습니다.')
      setMessage('')
      return
    }

    setExcuseModalState({
      open: true,
      editingExcuse: null,
      lockedEnrollmentId: options?.enrollmentId ?? null,
      defaultSubjectId: options?.subjectId ?? effectiveSubjectId ?? null,
      defaultDate: options?.date ?? date,
    })
  }

  function openEditExcuseModal(excuse: AttendanceExcuseRecord) {
    setExcuseModalState({
      open: true,
      editingExcuse: excuse,
      lockedEnrollmentId: excuse.enrollmentId,
      defaultSubjectId: excuse.subjectId,
      defaultDate: excuse.excuseDate,
    })
  }

  function closeExcuseModal() {
    setExcuseModalState((current) => ({
      ...current,
      open: false,
      editingExcuse: null,
      lockedEnrollmentId: null,
      defaultSubjectId: effectiveSubjectId ?? null,
      defaultDate: date,
    }))
  }

  function handleExcuseChanged(nextMessage: string) {
    setError('')
    setMessage(nextMessage)
    setExcusesRefreshKey((current) => current + 1)
    void loadData().catch(() => null)
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
          className="inline-flex w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:shadow-md active:scale-[0.97]"
        >
          강의 설정으로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap justify-end gap-2">
          {false ? (
            <div>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
              className="text-xs font-medium text-gray-400 hover:underline"
            >
              &larr; {course!.name}
            </Link>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">출석 관리</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              교실 화면 코드 기반 출석과 결석 누적 현황을 한곳에서 관리합니다.
            </p>
            </div>
          ) : null}
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
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
            >
              출석 시작
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={working || !dashboard.displaySession.isActive}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
            >
              출석 종료
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4">
          <p className="text-sm font-semibold text-sky-900">운영 가이드</p>
          <div className="mt-2 space-y-1 text-sm text-sky-800">
            <p>1. 과목이 있는 강좌는 먼저 과목을 선택합니다.</p>
            <p>2. 과목을 선택한 뒤 출석 시작을 눌러 교실 화면을 엽니다.</p>
            <p>3. 수업이 끝나면 출석 종료 후 다음 과목으로 다시 시작합니다.</p>
          </div>
          {requiresSubjectSelection ? (
            <p className="mt-3 text-xs font-medium text-sky-700">
              과목형 출석에서는 선택한 과목의 좌석이 있는 학생만 출석 대상에 포함됩니다.
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
              {dashboard.displaySession.subjectName ? (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  과목 {dashboard.displaySession.subjectName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-[#0071e3]" style={{ width: progressWidth }} />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              선택 날짜 출석 과목
            </p>
            {dashboard.checkedSubjects.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {dashboard.checkedSubjects.map((subject) => (
                  <span
                    key={`${subject.subjectId ?? 'none'}:${subject.latestStartedAt}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    <span>{subject.subjectName}</span>
                    <span className="text-slate-400">{formatTime(subject.latestStartedAt)} 시작</span>
                    {subject.sessionCount > 1 ? <span className="text-slate-400">{subject.sessionCount}회</span> : null}
                    {subject.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                        진행 중
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">선택한 날짜에 시작된 출석 세션이 없습니다.</p>
            )}
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">출석 대상 관리</h3>
            <p className="mt-2 text-sm text-slate-500">
              전체 대상, 출석자, 결석자, 연속 결석 경고를 분리해 필요한 학생만 빠르게 확인할 수 있습니다.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[640px] xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">오늘 체크인</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{dashboard.recentRecords.length}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">최근 처리</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {latestRecentRecord ? latestRecentRecord.studentName : '없음'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {latestRecentRecord ? formatDateTime(latestRecentRecord.attendedAt) : '아직 처리 내역이 없습니다.'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">연속 결석 경고</p>
              <p className="mt-1 text-lg font-bold text-rose-600">{absenceReport?.flaggedStudents.length ?? 0}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">사유(선택 날짜)</p>
              <p className="mt-1 text-lg font-bold text-amber-600">{dailyExcuses.length}건</p>
              <p className="mt-1 text-xs text-slate-400">
                결석 집계 제외 {dashboard.excusedCount}명
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <TabButton
            active={activeTab === 'targets'}
            label="전체 대상"
            count={dashboard.targets.length}
            onClick={() => setActiveTab('targets')}
          />
          <TabButton
            active={activeTab === 'attendees'}
            label="출석자"
            count={dashboard.presentCount}
            onClick={() => setActiveTab('attendees')}
          />
          <TabButton
            active={activeTab === 'absentees'}
            label="결석자"
            count={dashboard.absentCount}
            onClick={() => setActiveTab('absentees')}
          />
          <TabButton
            active={activeTab === 'warnings'}
            label="연속 결석 경고"
            count={absenceReport?.flaggedStudents.length ?? 0}
            onClick={() => setActiveTab('warnings')}
          />
          <TabButton
            active={activeTab === 'excuses'}
            label="사유서"
            count={dailyExcuses.length}
            onClick={() => setActiveTab('excuses')}
          />
        </div>

        {activeTab !== 'excuses' ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-slate-800">
                {activeTab === 'targets'
                  ? '전체 출석 대상'
                  : activeTab === 'attendees'
                    ? '출석 완료 수강생'
                    : activeTab === 'absentees'
                      ? '오늘 결석 대상'
                      : '연속 결석 경고 대상'}
              </p>
              <p className="text-xs text-slate-500">
                {activeTab === 'warnings'
                  ? effectiveSubjectName
                    ? `${effectiveSubjectName}에서 2회 이상 연속 결석한 학생만 표시합니다.`
                    : '과목별 2회 이상 연속 결석한 학생만 표시합니다.'
                  : effectiveSubjectName
                    ? `${effectiveSubjectName} 기준으로 집계 중이며, 좌석번호도 해당 과목 데이터로 표시됩니다.`
                    : '과목 전체 기준으로 집계 중입니다.'}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={attendanceSearch}
                onChange={(event) => setAttendanceSearch(event.target.value)}
                placeholder={
                  activeTab === 'warnings'
                    ? '이름, 수험번호, 좌석번호, 과목 검색'
                    : '이름, 연락처, 수험번호, 좌석번호 검색'
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400 sm:w-80"
              />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
        ) : null}

        {dashboard.checkedSubjects.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {dashboard.date}에는 {dashboard.checkedSubjects.map((subject) => subject.subjectName).join(', ')} 출석 체크가 있었습니다.
          </p>
        ) : null}

        {isBeforeAttendanceStartForSelectedDate ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            수강 시작일 {dashboard.attendanceStartDate} 이전 날짜에서는 결석 집계와 출석 대상 목록을 표시하지 않습니다.
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          {activeTab === 'targets' ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">상태</th>
                      <th className="px-4 py-3">수험번호</th>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">좌석번호</th>
                      <th className="px-4 py-3">연락처</th>
                      <th className="px-4 py-3">최근 처리</th>
                      <th className="px-4 py-3">연속 결석</th>
                      <th className="px-4 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                    {pagedTargets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                          {attendanceSearch.trim() ? '검색 결과가 없습니다.' : '출석 대상이 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      pagedTargets.map((row) => (
                        <tr key={row.enrollmentId} className="bg-white">
                          <td className="px-4 py-3 align-middle text-center">
                            <StatusChip status={row.status} />
                          </td>
                          <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.examNumber ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="font-semibold text-slate-900">{row.studentName}</div>
                            {row.status === 'excused' && row.excuseReason ? (
                              <div className="mt-1 text-xs text-amber-700">{row.excuseReason}</div>
                            ) : null}
                            {row.attendanceStartDate ? (
                              <div className="mt-1 text-xs text-slate-400">기준일 {row.attendanceStartDate}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.seatLabel ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.phone}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{formatDateTime(row.attendedAt)}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <span className={row.consecutiveAbsences >= 2 ? 'font-semibold text-rose-600' : 'text-slate-600'}>
                              {row.consecutiveAbsences}회
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const nextStatus = row.status === 'present' ? 'absent' : 'present'
                                if (nextStatus === 'absent') {
                                  requestOverrideConfirmation({
                                    enrollmentId: row.enrollmentId,
                                    studentName: row.studentName,
                                    status: nextStatus,
                                  })
                                  return
                                }

                                void handleOverride(row.enrollmentId, nextStatus)
                              }}
                              disabled={working}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 ${
                                row.status === 'present'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {row.status === 'present' ? '결석 처리' : '출석 처리'}
                            </button>
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
                totalCount={filteredTargets.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          ) : null}

          {activeTab === 'attendees' ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">수험번호</th>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">좌석번호</th>
                      <th className="px-4 py-3">연락처</th>
                      <th className="px-4 py-3">최근 처리</th>
                      <th className="px-4 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                    {pagedAttendees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                          {attendanceSearch.trim() ? '검색 결과가 없습니다.' : '아직 출석 처리된 학생이 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      pagedAttendees.map((row) => (
                        <tr key={row.enrollmentId} className="bg-white">
                          <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.examNumber ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="font-semibold text-slate-900">{row.studentName}</div>
                            <div className="mt-1 text-xs text-emerald-600">출석 완료</div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.seatLabel ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.phone}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{formatDateTime(row.attendedAt)}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <button
                              type="button"
                              onClick={() => {
                                requestOverrideConfirmation({
                                  enrollmentId: row.enrollmentId,
                                  studentName: row.studentName,
                                  status: 'absent',
                                })
                              }}
                              disabled={working}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                            >
                              결석 처리
                            </button>
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
                totalCount={filteredAttendees.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          ) : null}

          {activeTab === 'absentees' ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">수험번호</th>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">좌석번호</th>
                      <th className="px-4 py-3">연락처</th>
                      <th className="px-4 py-3">연속 결석</th>
                      <th className="px-4 py-3">기준일</th>
                      <th className="px-4 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                    {pagedAbsentees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                          {attendanceSearch.trim() ? '검색 결과가 없습니다.' : '모든 학생이 출석했습니다.'}
                        </td>
                      </tr>
                    ) : (
                      pagedAbsentees.map((row) => (
                        <tr key={row.enrollmentId} className="bg-white">
                          {(() => {
                            const existingExcuse = findDailyExcuse(row.enrollmentId, effectiveSubjectId)

                            return (
                              <>
                          <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.examNumber ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="font-semibold text-slate-900">{row.studentName}</div>
                            <div className="mt-1 text-xs text-slate-400">결석 대상</div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.seatLabel ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.phone}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <span className={row.consecutiveAbsences >= 2 ? 'font-semibold text-rose-600' : 'text-slate-600'}>
                              {row.consecutiveAbsences}회
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.attendanceStartDate ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleOverride(row.enrollmentId, 'present')}
                                disabled={working}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
                              >
                                출석 처리
                              </button>
                              <ExcuseActionButton
                                excuse={existingExcuse}
                                disabled={working}
                                onCreate={() => openCreateExcuseModal({
                                  enrollmentId: row.enrollmentId,
                                  subjectId: effectiveSubjectId,
                                  date,
                                })}
                                onEdit={() => {
                                  if (existingExcuse) {
                                    openEditExcuseModal(existingExcuse)
                                  }
                                }}
                              />
                            </div>
                          </td>
                              </>
                            )
                          })()}
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
                totalCount={filteredAbsentees.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          ) : null}

          {activeTab === 'warnings' ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead className="bg-slate-50 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">과목</th>
                      <th className="px-4 py-3">수험번호</th>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">좌석번호</th>
                      <th className="px-4 py-3">연속 결석</th>
                      <th className="px-4 py-3">마지막 출석</th>
                      <th className="px-4 py-3">기준일</th>
                      <th className="px-4 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-center text-sm text-slate-700">
                    {pagedWarnings.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                          {isBeforeAttendanceStartToday
                            ? `수강 시작일 ${course.enrolled_from} 이전이라 연속 결석 경고가 없습니다.`
                            : attendanceSearch.trim()
                              ? '검색 결과가 없습니다.'
                              : '현재 기준에 맞는 연속 결석 경고 대상이 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      pagedWarnings.map((row) => (
                        <tr key={`${row.enrollmentId}:${row.subjectId ?? 'course'}`} className="bg-white">
                          {(() => {
                            const existingExcuse = findDailyExcuse(row.enrollmentId, row.subjectId ?? effectiveSubjectId)

                            return (
                              <>
                          <td className="px-4 py-3 align-middle text-center">
                            {row.subjectName ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {row.subjectName}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.examNumber ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center font-semibold text-slate-900">{row.studentName}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.seatLabel ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <span className="font-semibold text-rose-600">{row.consecutiveAbsences}회</span>
                          </td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.lastAttendedDate ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center text-slate-600">{row.attendanceStartDate ?? '-'}</td>
                          <td className="px-4 py-3 align-middle text-center">
                            <ExcuseActionButton
                              excuse={existingExcuse}
                              disabled={working}
                              onCreate={() => openCreateExcuseModal({
                                enrollmentId: row.enrollmentId,
                                subjectId: row.subjectId ?? effectiveSubjectId,
                                date,
                              })}
                              onEdit={() => {
                                if (existingExcuse) {
                                  openEditExcuseModal(existingExcuse)
                                }
                              }}
                            />
                          </td>
                              </>
                            )
                          })()}
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
                totalCount={filteredWarnings.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          ) : null}

          {activeTab === 'excuses' ? (
            <div className="p-4 sm:p-5">
              <AttendanceExcusesPanel
                active={activeTab === 'excuses'}
                courseId={courseId}
                subjects={subjects}
                students={studentOptions}
                defaultDate={date}
                defaultSubjectId={effectiveSubjectId}
                refreshKey={excusesRefreshKey}
                onCreateRequest={(defaults) => openCreateExcuseModal(defaults)}
                onEditRequest={openEditExcuseModal}
                onChanged={handleExcuseChanged}
              />
            </div>
          ) : null}
        </div>
      </section>

      <AttendanceExcuseModal
        open={excuseModalState.open}
        courseId={courseId}
        subjects={subjects}
        students={studentOptions}
        defaultDate={excuseModalState.defaultDate}
        defaultSubjectId={excuseModalState.defaultSubjectId}
        lockedEnrollmentId={excuseModalState.lockedEnrollmentId}
        editingExcuse={excuseModalState.editingExcuse}
        onClose={closeExcuseModal}
        onSaved={(excuse, nextMessage) => {
          closeExcuseModal()
          handleExcuseChanged(nextMessage)

          if (excuse.excuseDate !== date) {
            setDate(excuse.excuseDate)
          }
        }}
      />
      <ConfirmationModal
        open={Boolean(overrideConfirmation)}
        title="결석 처리할까요?"
        description={
          overrideConfirmation
            ? `${overrideConfirmation.studentName} 수강생의 출석 상태를 결석으로 변경합니다.`
            : undefined
        }
        confirmLabel="결석 처리"
        pendingLabel="처리 중..."
        cancelLabel="취소"
        tone="danger"
        submitting={working}
        onClose={() => {
          if (!working) {
            setOverrideConfirmation(null)
          }
        }}
        onConfirm={confirmOverride}
      />
    </div>
  )
}
