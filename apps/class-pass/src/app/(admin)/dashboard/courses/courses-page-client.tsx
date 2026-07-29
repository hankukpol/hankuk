'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DragEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, GripVertical, Loader2 } from 'lucide-react'
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
type MoveDirection = 'up' | 'down'
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

function isVisibleForFilter(course: Course, filter: CourseFilter) {
  return course.status === filter
}

function normalizeSortOrder(courseList: Course[]) {
  return courseList.map((course, index) => (
    course.sort_order === index ? course : { ...course, sort_order: index }
  ))
}

function mergeVisibleCourseOrder(
  allCourses: Course[],
  filter: CourseFilter,
  nextVisibleCourses: Course[],
) {
  let visibleIndex = 0
  return normalizeSortOrder(allCourses.map((course) => {
    if (!isVisibleForFilter(course, filter)) {
      return course
    }

    const nextCourse = nextVisibleCourses[visibleIndex]
    visibleIndex += 1
    return nextCourse ?? course
  }))
}

function moveVisibleCourse(
  allCourses: Course[],
  filter: CourseFilter,
  courseId: number,
  direction: MoveDirection,
) {
  const visibleCourses = allCourses.filter((course) => isVisibleForFilter(course, filter))
  const currentIndex = visibleCourses.findIndex((course) => course.id === courseId)
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= visibleCourses.length) {
    return null
  }

  const nextVisibleCourses = [...visibleCourses]
  const [movedCourse] = nextVisibleCourses.splice(currentIndex, 1)
  nextVisibleCourses.splice(nextIndex, 0, movedCourse)
  return mergeVisibleCourseOrder(allCourses, filter, nextVisibleCourses)
}

function dropVisibleCourse(
  allCourses: Course[],
  filter: CourseFilter,
  sourceCourseId: number,
  targetCourseId: number,
) {
  if (sourceCourseId === targetCourseId) {
    return null
  }

  const visibleCourses = allCourses.filter((course) => isVisibleForFilter(course, filter))
  const sourceIndex = visibleCourses.findIndex((course) => course.id === sourceCourseId)
  const targetIndex = visibleCourses.findIndex((course) => course.id === targetCourseId)

  if (sourceIndex < 0 || targetIndex < 0) {
    return null
  }

  const nextVisibleCourses = [...visibleCourses]
  const [movedCourse] = nextVisibleCourses.splice(sourceIndex, 1)
  nextVisibleCourses.splice(targetIndex, 0, movedCourse)
  return mergeVisibleCourseOrder(allCourses, filter, nextVisibleCourses)
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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyingTemplateCourseId, setCopyingTemplateCourseId] = useState<number | null>(null)
  const [restoringCourseId, setRestoringCourseId] = useState<number | null>(null)
  const [reorderingCourseId, setReorderingCourseId] = useState<number | null>(null)
  const [draggedCourseId, setDraggedCourseId] = useState<number | null>(null)
  const [dragOverCourseId, setDragOverCourseId] = useState<number | null>(null)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

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
  const filtered = courses.filter((course) => course.status === filter)

  function handleOpenCourseDetail(courseId: number) {
    router.push(withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type))
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
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
    setSaving(false)

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

  async function persistCourseOrder(nextCourses: Course[], movedCourseId: number) {
    const previousCourses = courses
    setCourses(nextCourses)
    setReorderingCourseId(movedCourseId)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/courses/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: nextCourses.map((course) => course.id) }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setCourses(previousCourses)
        setError(payload?.error ?? '강좌 순서를 저장하지 못했습니다.')
        return
      }

      setMessage('강좌 순서를 저장했습니다.')
    } catch {
      setCourses(previousCourses)
      setError('강좌 순서를 저장하지 못했습니다. 네트워크 상태를 확인해 주세요.')
    } finally {
      setReorderingCourseId(null)
    }
  }

  function handleMoveCourse(courseId: number, direction: MoveDirection) {
    if (reorderingCourseId !== null) {
      return
    }

    const nextCourses = moveVisibleCourse(courses, filter, courseId, direction)
    if (!nextCourses) {
      return
    }

    void persistCourseOrder(nextCourses, courseId)
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, courseId: number) {
    if (reorderingCourseId !== null) {
      event.preventDefault()
      return
    }

    setDraggedCourseId(courseId)
    setDragOverCourseId(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(courseId))
  }

  function handleDragOver(event: DragEvent<HTMLElement>, courseId: number) {
    if (reorderingCourseId !== null) {
      return
    }

    const sourceCourseId = Number(event.dataTransfer.getData('text/plain')) || draggedCourseId
    if (!sourceCourseId || sourceCourseId === courseId) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverCourseId(courseId)
  }

  function handleDrop(event: DragEvent<HTMLElement>, courseId: number) {
    event.preventDefault()
    const sourceCourseId = Number(event.dataTransfer.getData('text/plain')) || draggedCourseId
    setDraggedCourseId(null)
    setDragOverCourseId(null)

    if (!sourceCourseId || sourceCourseId === courseId || reorderingCourseId !== null) {
      return
    }

    const nextCourses = dropVisibleCourse(courses, filter, sourceCourseId, courseId)
    if (!nextCourses) {
      return
    }

    void persistCourseOrder(nextCourses, sourceCourseId)
  }

  function handleDragEnd() {
    setDraggedCourseId(null)
    setDragOverCourseId(null)
  }

  function renderOrderControls(course: Course, index: number, total: number) {
    const isSavingThisCourse = reorderingCourseId === course.id
    const disabled = reorderingCourseId !== null
    const iconButtonClassName = 'flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#f5f5f7] text-[#86868b] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] hover:text-[#1d1d1f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100'

    return (
      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          draggable={!disabled}
          onDragStart={(event) => handleDragStart(event, course.id)}
          onDragEnd={handleDragEnd}
          disabled={disabled}
          aria-label={`${course.name} 드래그해서 순서 변경`}
          title="드래그해서 순서 변경"
          className={`${iconButtonClassName} cursor-grab active:cursor-grabbing`}
        >
          {isSavingThisCourse ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GripVertical className="h-4 w-4" />
          )}
        </button>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => handleMoveCourse(course.id, 'up')}
            disabled={disabled || index === 0}
            aria-label={`${course.name} 위로 이동`}
            title="위로 이동"
            className="flex h-[15px] w-8 items-center justify-center rounded-[6px] bg-[#f5f5f7] text-[#86868b] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] hover:text-[#1d1d1f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => handleMoveCourse(course.id, 'down')}
            disabled={disabled || index === total - 1}
            aria-label={`${course.name} 아래로 이동`}
            title="아래로 이동"
            className="flex h-[15px] w-8 items-center justify-center rounded-[6px] bg-[#f5f5f7] text-[#86868b] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] hover:text-[#1d1d1f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
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
          <h2 className="text-xl font-semibold text-[#1d1d1f]">강좌 관리</h2>
          <p className="mt-1 text-sm text-[#86868b]">
            운영강좌 {activeCoursesCount}개 · 보관강좌 {archivedCoursesCount}개
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="w-full rounded-[8px] bg-[#0071e3] px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 sm:w-auto"
        >
          {showForm ? '닫기' : '+ 새 강좌'}
        </button>
      </div>

      {/* ── Create form (collapsible) ── */}
      <AnimatePresence initial={false}>
      {showForm ? (
        <motion.form
          layout
          onSubmit={handleCreate}
          initial={{ opacity: 0, scale: 0.98, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -8 }}
          transition={motionConfig.modal}
          className="rounded-[8px] border border-[#d2d2d7] bg-white p-5"
        >
          <h3 className="text-sm font-bold text-[#1d1d1f]">새 강좌 만들기</h3>
          <p className="mt-1 text-xs text-[#86868b]">
            강좌 금액은 결제 추가 시 정가와 수납 금액으로 자동 적용됩니다.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_120px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#86868b]">강좌명</span>
              <input
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="예: 2026 경찰 기본반"
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
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
            <label className="flex flex-col gap-1.5">
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
            <label className="flex flex-col gap-1.5">
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
              <label key={item.key} className="flex min-h-9 items-center gap-1.5 rounded-[8px] bg-[#f5f5f7] px-2.5 text-xs text-[#1d1d1f] sm:min-h-0 sm:bg-transparent sm:px-0">
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

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[8px] bg-[#0071e3] px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-ios hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100 sm:py-2"
            >
              {saving ? '생성 중...' : '강좌 생성'}
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {message && <span className="text-xs text-[#1b7a1b]">{message}</span>}
          </div>
        </motion.form>
      ) : null}
      </AnimatePresence>

      {/* ── Filter tabs ── */}
      {(error || message) && !showForm ? (
        <div className="flex flex-col gap-1">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {message && <p className="text-xs text-[#1b7a1b]">{message}</p>}
        </div>
      ) : null}

      <motion.div layout className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#e8e8ed] p-1">
        {([
          { key: 'active', label: '운영강좌', count: activeCoursesCount },
          { key: 'archived', label: '보관강좌', count: archivedCoursesCount },
        ] satisfies Array<{ key: CourseFilter; label: string; count: number }>).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`relative flex-1 rounded-[8px] px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.98] ${
              filter === item.key
                ? 'text-white'
                : 'text-[#1d1d1f] hover:bg-white/70'
            }`}
          >
            {filter === item.key ? (
              <motion.div
                layoutId="courses-filter-tabs"
                className="absolute inset-0 rounded-[8px] bg-[#1d1d1f] shadow-sm"
                transition={motionConfig.tab}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              <span>{item.label}</span>
              <span className={filter === item.key ? 'text-white/70' : 'text-[#86868b]'}>
                {item.count.toLocaleString('ko-KR')}
              </span>
            </span>
          </button>
        ))}
      </motion.div>

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
            {filter === 'active' ? '운영 중인 강좌가 없습니다.' : '보관된 강좌가 없습니다.'}
          </motion.p>
        ) : (
          <motion.div
            key={`courses-${filter}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionConfig.modal}
            className="overflow-hidden rounded-[8px] bg-white shadow-sm ring-1 ring-slate-100"
          >
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full">
                <thead className="border-b border-[#e8e8ed] bg-[#f5f5f7] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
                  <tr>
                    <th className="px-3 py-3 text-center">순서</th>
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
                <tbody className="divide-y divide-[#f0f0f2] text-sm text-[#1d1d1f]">
                  {filtered.map((course, index) => {
                    const tags = getCourseFeatureTags(course)
                    const isActive = course.status === 'active'
                    const activeEnrollmentCount = getActiveEnrollmentCount(course)
                    const isDragTarget = dragOverCourseId === course.id
                    const isDragging = draggedCourseId === course.id

                    return (
                      <tr
                        key={course.id}
                        onClick={() => handleOpenCourseDetail(course.id)}
                        onDragOver={(event) => handleDragOver(event, course.id)}
                        onDrop={(event) => handleDrop(event, course.id)}
                        className={`cursor-pointer transition-colors hover:bg-[#f5f5f7] ${
                          isDragTarget ? 'bg-[#0071e3]/5' : ''
                        } ${isDragging ? 'opacity-55' : ''}`}
                      >
                        <td className="px-3 py-3 align-middle">
                          {renderOrderControls(course, index, filtered.length)}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex flex-col items-start gap-1">
                            <span className="rounded-[6px] bg-[#f5f5f7] px-2 py-1 text-[11px] font-semibold text-[#1d1d1f]">
                              {courseTypeLabel(course.course_type)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="min-w-0">
                            <p className="line-clamp-1 font-semibold text-[#1d1d1f]">{course.name}</p>
                            <p className="mt-0.5 truncate text-xs text-[#86868b]">{course.slug}</p>
                            {course.copied_from_course_name ? (
                              <p className="mt-0.5 truncate text-[11px] text-[#86868b]">
                                원본 {course.copied_from_course_name}
                              </p>
                            ) : null}
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
                        <td className="px-3 py-3 text-right align-middle tabular-nums">
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.section>
    </motion.div>
    </>
  )
}
