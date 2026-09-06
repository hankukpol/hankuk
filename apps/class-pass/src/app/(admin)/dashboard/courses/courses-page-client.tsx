'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { SortableCourseRow } from '@/components/admin/SortableCourseRow'
import { useCourseOrdering } from '@/components/admin/useCourseOrdering'
import { AdminDrawer } from '@/components/admin/AdminDrawer'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { useTenantConfig } from '@/components/TenantProvider'
import { useMotionConfig } from '@/lib/motion'
import { formatWon } from '@/lib/payments/format'
import type { Course, CourseType } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'

type CreateCourseForm = {
  name: string
  course_type: CourseType
  theme_color: string
  tuition_amount: string
  settlement_report_code: string
  status: 'active' | 'archived'
  feature_qr_pass: boolean
  feature_qr_distribution: boolean
  feature_seat_assignment: boolean
  feature_attendance: boolean
  feature_time_window: boolean
  feature_photo: boolean
  feature_dday: boolean
  feature_notices: boolean
  feature_refund_policy: boolean
  feature_exam_delivery_mode: boolean
  feature_weekday_color: boolean
  feature_anti_forgery_motion: boolean
}

type CourseFilter = 'active' | 'archived'
type CourseTypeFilter = CourseType | 'all'

const COURSE_TYPE_FILTERS: CourseTypeFilter[] = ['all', 'general', 'lecture', 'mock_exam', 'interview']

/** 강좌명·원본 강좌명·보고 코드에서 찾는다. 목록에 보이는 값만 대상으로 한다. */
function matchesCourseQuery(course: Course, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [course.name, course.copied_from_course_name, course.settlement_report_code]
    .some((value) => (value ?? '').toLowerCase().includes(needle))
}
type ConfirmationRequest = {
  title: string
  description?: string
  confirmLabel: string
  pendingLabel?: string
  tone?: 'default' | 'danger' | 'success'
  onConfirm: () => Promise<void> | void
}

const DEFAULT_FORM: CreateCourseForm = {
  name: '',
  course_type: 'general',
  theme_color: '#1A237E',
  tuition_amount: '',
  settlement_report_code: '',
  status: 'active',
  feature_qr_pass: true,
  feature_qr_distribution: false,
  feature_seat_assignment: true,
  feature_attendance: false,
  feature_time_window: false,
  feature_photo: false,
  feature_dday: false,
  feature_notices: true,
  feature_refund_policy: false,
  feature_exam_delivery_mode: false,
  feature_weekday_color: false,
  feature_anti_forgery_motion: false,
}

const FEATURE_LABELS: Array<{ key: keyof CreateCourseForm; label: string }> = [
  { key: 'feature_qr_pass', label: 'QR 수강증' },
  { key: 'feature_qr_distribution', label: 'QR 자료 배부' },
  { key: 'feature_seat_assignment', label: '좌석 배정' },
  { key: 'feature_attendance', label: '출결 체크' },
  { key: 'feature_time_window', label: '시간 제한' },
  { key: 'feature_photo', label: '사진 표시' },
  { key: 'feature_dday', label: 'D-day' },
  { key: 'feature_notices', label: '공지 노출' },
  { key: 'feature_refund_policy', label: '환불 규정' },
  { key: 'feature_exam_delivery_mode', label: '시험 배부 모드' },
  { key: 'feature_weekday_color', label: '요일별 색상' },
  { key: 'feature_anti_forgery_motion', label: '위조 방지 효과' },
]

function courseTypeLabel(value: CourseType) {
  return formatCourseTypeLabel(value)
}

function getCourseFeatureTags(course: Course) {
  return [
    course.feature_qr_pass && 'QR',
    course.feature_qr_distribution && '배부',
    course.feature_seat_assignment && '좌석',
    course.feature_attendance && '출결',
    course.feature_time_window && '시간',
    course.feature_photo && '사진',
    course.feature_dday && 'D-day',
    course.feature_exam_delivery_mode && '배부모드',
    course.feature_weekday_color && '요일색',
    course.feature_anti_forgery_motion && '보안효과',
  ].filter(Boolean) as string[]
}

function getActiveEnrollmentCount(course: Course) {
  return course.active_enrollment_count ?? 0
}

export default function CoursesPageClient({
  initialCourses,
  initialError = '',
  initialLoaded = true,
}: {
  initialCourses: Course[]
  initialError?: string
  initialLoaded?: boolean
}) {
  const router = useRouter()
  const tenant = useTenantConfig()
  const motionConfig = useMotionConfig()
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [form, setForm] = useState<CreateCourseForm>(DEFAULT_FORM)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<CourseFilter>('active')
  const [search, setSearch] = useState('')
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [copyingTemplateCourseId, setCopyingTemplateCourseId] = useState<number | null>(null)
  const [restoringCourseId, setRestoringCourseId] = useState<number | null>(null)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const ordering = useCourseOrdering({ courses, filter, onChange: setCourses,
    onFeedback: (text, failed) => { setError(failed ? text : ''); setMessage(failed ? '' : text) },
  })
  // 검색·유형으로 목록을 좁히면 보이는 행이 그 상태의 전부가 아니게 된다.
  // 순서 저장 API는 전체 목록을 요구하므로, 좁혀진 동안에는 드래그 정렬을 잠근다.
  const narrowed = search.trim() !== '' || courseTypeFilter !== 'all'
  const orderLocked = ordering.pending || ordering.draggingId !== null
  const orderUnavailable = narrowed || saving || copyingTemplateCourseId !== null || restoringCourseId !== null || confirmSubmitting || showForm

  async function loadCourses() {
    const response = await fetch('/api/courses', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error ?? '강좌 목록을 불러오지 못했습니다.')
    setCourses(payload.courses ?? [])
  }

  useEffect(() => {
    if (initialLoaded) {
      return
    }
    loadCourses()
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '강좌 목록을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [initialLoaded])

  const activeCoursesCount = courses.filter((course) => course.status === 'active').length
  const archivedCoursesCount = courses.filter((course) => course.status === 'archived').length
  const statusMatched = courses.filter((course) => course.status === filter)
  const filtered = statusMatched.filter((course) =>
    (courseTypeFilter === 'all' || course.course_type === courseTypeFilter) && matchesCourseQuery(course, search))

  function handleOpenCourseDetail(courseId: number) {
    router.push(withTenantPrefix(`/dashboard/courses/${courseId}/students`, tenant.type))
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true)
      setError('')
      setMessage('')

      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          theme_color: form.theme_color.trim(),
          tuition_amount: Number(form.tuition_amount.replace(/[^\d]/g, '') || 0),
          settlement_report_code: form.settlement_report_code.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null)


      if (!response.ok) {
        setError(payload?.error ?? '강좌를 생성하지 못했습니다.')
        return
      }

      setForm({ ...DEFAULT_FORM, theme_color: form.theme_color, course_type: form.course_type })
      setMessage('강좌를 생성했습니다.')
      setError(payload?.warning ?? '')
      setShowForm(false)
      setFilter('active')
      await loadCourses().catch(() => {})
    } catch (reason) {
      setError(getUserErrorMessage(reason, '저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function requestArchive(course: Course) {
    setConfirmation({
      title: '강좌를 보관할까요?',
      description: `"${course.name}" 강좌를 보관합니다. 수강생과 기록은 유지되며 운영중 목록에서 제외됩니다.`,
      confirmLabel: '보관',
      pendingLabel: '보관 중...',
      tone: 'danger',
      onConfirm: () => handleArchiveConfirmed(course),
    })
  }

  async function handleArchiveConfirmed(course: Course) {
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${course.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '아카이브 실패'); return }
    setCourses((c) => c.map((e) => (e.id === course.id ? { ...e, status: 'archived' as const } : e)))
    setMessage('강좌를 아카이브했습니다.')
  }

  function requestRestore(course: Course) {
    setConfirmation({
      title: '강좌를 복원할까요?',
      description: `"${course.name}" 강좌를 운영강좌로 다시 이동합니다. 수강생과 기존 기록은 그대로 유지됩니다.`,
      confirmLabel: '복원',
      pendingLabel: '복원 중...',
      tone: 'success',
      onConfirm: () => handleRestoreConfirmed(course),
    })
  }

  async function handleRestoreConfirmed(course: Course) {
    setRestoringCourseId(course.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '강좌를 복원하지 못했습니다.')
        return
      }

      const restoredCourse = payload?.course as Course | undefined
      setCourses((current) => current.map((entry) => (
        entry.id === course.id
          ? { ...entry, ...(restoredCourse ?? {}), status: 'active' as const }
          : entry
      )))
      setMessage('강좌를 운영강좌로 복원했습니다.')
    } catch {
      setError('강좌를 복원하지 못했습니다.')
    } finally {
      setRestoringCourseId(null)
    }
  }

  function requestTemplateCopy(course: Course) {
    setConfirmation({
      title: '강좌 템플릿을 복사할까요?',
      description: `"${course.name}" 강좌의 설정, 과목, 강의실과 좌석 배치를 복사합니다. 학생, 자료, 좌석 예약, 출석, 결제, 표시 설정은 복사되지 않습니다. 복사본은 보관강좌로 생성됩니다.`,
      confirmLabel: '템플릿 복사',
      pendingLabel: '템플릿 복사 중...',
      onConfirm: () => handleTemplateCopyConfirmed(course),
    })
  }

  async function handleTemplateCopyConfirmed(course: Course) {
    setCopyingTemplateCourseId(course.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/courses/${course.id}/template-copy`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '강좌 템플릿을 복사하지 못했습니다.')
        return
      }

      const copiedCourse = payload?.course as Course | undefined
      if (!copiedCourse?.id) {
        setError('복사된 강좌 템플릿 정보를 확인하지 못했습니다.')
        return
      }

      setCourses((current) => [
        copiedCourse,
        ...current.filter((entry) => entry.id !== copiedCourse.id),
      ])
      setFilter('archived')
      setMessage(`"${copiedCourse.name}" 템플릿을 만들었습니다. 강좌명을 변경한 뒤 운영강좌로 전환해 주세요.`)
    } catch {
      setError('강좌 템플릿을 복사하지 못했습니다.')
    } finally {
      setCopyingTemplateCourseId(null)
    }
  }

  async function runConfirmedAction() {
    if (!confirmation) {
      return
    }

    const current = confirmation
    setConfirmSubmitting(true)
    try {
      await current.onConfirm()
    } finally {
      setConfirmSubmitting(false)
      setConfirmation(null)
    }
  }

  return (
    <>
    <ConfirmationModal
      open={Boolean(confirmation)}
      title={confirmation?.title ?? ''}
      description={confirmation?.description}
      confirmLabel={confirmation?.confirmLabel ?? '확인'}
      pendingLabel={confirmation?.pendingLabel}
      tone={confirmation?.tone ?? 'default'}
      submitting={confirmSubmitting}
      onClose={() => {
        if (!confirmSubmitting) {
          setConfirmation(null)
        }
      }}
      onConfirm={() => {
        void runConfirmedAction()
      }}
    />
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={motionConfig.modal}
      className="flex flex-col gap-6"
    >
      {/* ── Header + actions ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="admin-page-title">강좌 관리</h2>
          <p className="mt-1 text-sm text-[#86868b]">
            운영강좌 {activeCoursesCount}개 · 보관강좌 {archivedCoursesCount}개
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setMessage(''); setShowForm(true) }}
          disabled={orderLocked}
          className="admin-button admin-button-primary w-full sm:w-auto"
        >
          + 새 강좌
        </button>
      </div>

      {/* ── Create drawer ── */}
      <AdminDrawer open={showForm} title="새 강좌 만들기" closeDisabled={saving}
        onClose={() => { if (!saving) setShowForm(false) }} onSubmit={handleCreate}
        footer={<>
          <button type="button" className="admin-button" disabled={saving} onClick={() => setShowForm(false)}>취소</button>
          <button type="submit" className="admin-button admin-button-primary" disabled={saving}>{saving ? '생성 중...' : '강좌 생성'}</button>
        </>}>
        <fieldset disabled={saving} className="min-w-0">

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#86868b]">강좌명</span>
              <input
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="예: 2026 경찰 기본반"
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#86868b]">강좌 유형</span>
              <select
                value={form.course_type}
                onChange={(e) => setForm((c) => ({ ...c, course_type: e.target.value as CourseType }))}
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
              >
                <option value="general">일반</option>
                <option value="lecture">강의</option>
                <option value="mock_exam">모의고사</option>
                <option value="interview">면접</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#86868b]">강좌 금액</span>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={form.tuition_amount}
                  onChange={(e) => setForm((c) => ({ ...c, tuition_amount: e.target.value.replace(/[^\d]/g, '') }))}
                  placeholder="50000"
                  className="w-full rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 pr-9 text-sm outline-none focus:border-[#86868b]"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#86868b]">원</span>
              </div>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#86868b]">보고 코드</span>
              <input
                value={form.settlement_report_code}
                onChange={(e) => setForm((c) => ({ ...c, settlement_report_code: e.target.value }))}
                maxLength={20}
                placeholder="11"
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            {FEATURE_LABELS.map((item) => (
              <label key={item.key} className="flex min-h-9 items-center gap-2 rounded-[8px] bg-[#f5f5f7] px-2.5 text-xs text-[#1d1d1f] sm:min-h-0 sm:bg-transparent sm:px-0">
                <input
                  type="checkbox"
                  checked={Boolean(form[item.key])}
                  onChange={(e) => setForm((c) => ({ ...c, [item.key]: e.target.checked }))}
                  className="rounded"
                />
                {item.label}
              </label>
            ))}
          </div>

        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm text-red-600">{getUserErrorMessage(error)}</p> : null}
      </AdminDrawer>

      {/* ── Filter tabs ── */}
      {(error || message) && !showForm ? (
        <div className="flex flex-col gap-1">
          {error && <p className="text-xs text-red-500">{getUserErrorMessage(error)}</p>}
          {message && <p className="text-xs text-[#1b7a1b]">{message}</p>}
        </div>
      ) : null}

      <div className="admin-tabs" aria-label="강좌 상태 필터">
        {([
          { key: 'active', label: '운영강좌', count: activeCoursesCount },
          { key: 'archived', label: '보관강좌', count: archivedCoursesCount },
        ] satisfies Array<{ key: CourseFilter; label: string; count: number }>).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            disabled={orderLocked}
            className="admin-tab"
            data-active={filter === item.key}
            aria-pressed={filter === item.key}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              <span>{item.label}</span>
              <span className="admin-tab-count">
                {item.count.toLocaleString('ko-KR')}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="admin-table-toolbar flex flex-wrap items-center justify-end gap-3">
        <label className="admin-students-search relative">
          <span className="sr-only">강좌 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={orderLocked}
            placeholder="강좌명, 원본 강좌, 보고 코드 검색"
            className="w-full rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="강좌 유형 필터">
          {COURSE_TYPE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCourseTypeFilter(value)}
              disabled={orderLocked}
              aria-pressed={courseTypeFilter === value}
              className="admin-button"
            >
              {value === 'all' ? '전체 유형' : courseTypeLabel(value)}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-slate-500">
          {filtered.length.toLocaleString('ko-KR')}개 표시
          {narrowed ? ` / 전체 ${statusMatched.length.toLocaleString('ko-KR')}개` : ''}
        </span>
      </div>

      <p id="course-order-help" role="status" className="text-xs text-slate-500">
        {ordering.pending ? '순서를 저장하고 있습니다…'
          : ordering.draggingId !== null ? '원하는 위치에 놓으면 저장됩니다. Esc 키로 취소할 수 있습니다.'
          : narrowed ? '검색·유형을 적용하는 동안에는 순서를 바꿀 수 없습니다. 전체 목록에서만 순서가 안전하게 저장됩니다.'
          : '강좌명 옆 손잡이를 드래그해 순서를 변경하세요. 손잡이에 초점을 두고 위·아래 방향키로도 이동할 수 있습니다.'}
      </p>

      {/* ── Course table ── */}
      <motion.section layout transition={motionConfig.tab}>
        {loading ? (
          <motion.p
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionConfig.modal}
            className="rounded-[8px] bg-white px-5 py-12 text-center text-sm text-[#86868b] shadow-sm"
          >
            불러오는 중...
          </motion.p>
        ) : filtered.length === 0 ? (
          <motion.p
            key={`empty-${filter}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionConfig.modal}
            className="rounded-[8px] bg-white px-5 py-12 text-center text-sm text-[#86868b] shadow-sm"
          >
            {narrowed ? '검색 결과가 없습니다.' : filter === 'active' ? '운영 중인 강좌가 없습니다.' : '보관된 강좌가 없습니다.'}
          </motion.p>
        ) : (
          <motion.div
            key={`courses-${filter}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionConfig.modal}
            className="admin-table-frame overflow-hidden bg-white"
          >
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full">
                <thead className="border-b border-[#e8e8ed] bg-[#f5f5f7] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
                  <tr>
                    <th className="px-3 py-3">유형</th>
                    <th className="px-4 py-3">강좌명</th>
                    <th className="px-3 py-3 text-center">상태</th>
                    <th className="px-3 py-3 text-right">수강중</th>
                    <th className="px-3 py-3 text-right">강좌 금액</th>
                    <th className="px-3 py-3 text-center">보고 코드</th>
                    <th className="px-4 py-3">기능</th>
                    <th className="px-4 py-3 text-right">작업</th>
                  </tr>
                </thead>
                <Reorder.Group as="tbody" axis="y" values={filtered.map((course) => course.id)} onReorder={ordering.preview}
                  className="divide-y divide-[#f0f0f2] text-sm text-[#1d1d1f]">
                  {filtered.map((course) => {
                    const tags = getCourseFeatureTags(course)
                    const isActive = course.status === 'active'
                    const activeEnrollmentCount = getActiveEnrollmentCount(course)

                    return (
                      <SortableCourseRow key={course.id} id={course.id} name={course.name}
                        disabled={ordering.pending || orderUnavailable || (ordering.draggingId !== null && ordering.draggingId !== course.id)}
                        dragging={ordering.draggingId === course.id}
                        onBegin={() => ordering.beginDrag(course.id)} onEnd={() => { void ordering.endDrag() }}
                        onCancel={ordering.cancelDrag} onMove={(direction) => { void ordering.move(course.id, direction) }}
                        onOpen={() => handleOpenCourseDetail(course.id)}>
                        {(handle) => <>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex flex-col items-start gap-1">
                            <span className="rounded-[6px] bg-[#f5f5f7] px-2 py-1 text-[11px] font-semibold text-[#1d1d1f]">
                              {courseTypeLabel(course.course_type)}
                            </span>
                          </div>
                        </td>
                        <td className="admin-table-course px-4 py-3 align-middle">
                          <div className="admin-course-name-cell">
                            {handle}
                            <div className="min-w-0">
                            <p className="break-words font-semibold text-[#1d1d1f]">{course.name}</p>
                            {course.copied_from_course_name ? (
                              <p className="mt-0.5 break-words text-[11px] text-[#86868b]">
                                원본 {course.copied_from_course_name}
                              </p>
                            ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center align-middle">
                          <span className={`inline-flex rounded-[8px] px-2.5 py-1 text-[11px] font-semibold ${
                            isActive ? 'bg-emerald-50 text-[#1b7a1b]' : 'bg-[#f5f5f7] text-[#86868b]'
                          }`}>
                            {isActive ? '운영중' : '보관됨'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right align-middle font-semibold tabular-nums">
                          {activeEnrollmentCount.toLocaleString('ko-KR')}명
                        </td>
                        <td className="admin-table-amount px-3 py-3 text-right align-middle tabular-nums">
                          {formatWon(course.tuition_amount ?? 0)}
                        </td>
                        <td className="px-3 py-3 text-center align-middle text-[#86868b]">
                          {course.settlement_report_code || '-'}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {tags.length > 0 ? (
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {tags.map((tag) => (
                                <span key={tag} className="rounded-[5px] bg-[#f5f5f7] px-1.5 py-0.5 text-[10px] font-medium text-[#86868b]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-[#c7c7cc]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            inert={orderLocked}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Link
                              href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                              className="rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
                            >
                              수강생
                            </Link>
                            <Link
                              href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
                              className="rounded-[8px] bg-[#1d1d1f] px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 ease-ios hover:shadow-md active:scale-[0.97] active:duration-100"
                            >
                              상세
                            </Link>
                            <button
                              type="button"
                              onClick={() => requestTemplateCopy(course)}
                              disabled={copyingTemplateCourseId === course.id}
                              className="whitespace-nowrap rounded-[8px] bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                            >
                              {copyingTemplateCourseId === course.id ? '복사 중' : '강좌 템플릿 복사'}
                            </button>
                            {isActive ? (
                              <button
                                type="button"
                                onClick={() => requestArchive(course)}
                                className="rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#86868b] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
                              >
                                보관
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => requestRestore(course)}
                                disabled={restoringCourseId === course.id}
                                className="rounded-[8px] bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                              >
                                {restoringCourseId === course.id ? '복원중' : '복원'}
                              </button>
                            )}
                          </div>
                        </td>
                        </>}
                      </SortableCourseRow>
                    )
                  })}
                </Reorder.Group>
              </table>
            </div>
          </motion.div>
        )}
      </motion.section>
    </motion.div>
    </>
  )
}
