'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, CourseSubject, CourseType, EnrollmentFieldDef } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'

export type CourseDetailData = {
  course: Course
  subjects: CourseSubject[]
}

type CoursePatchForm = {
  name: string
  slug: string
  course_type: CourseType
  status: 'active' | 'archived'
  theme_color: string
  sort_order: number
  feature_qr_pass: boolean
  feature_qr_distribution: boolean
  feature_seat_assignment: boolean
  feature_designated_seat: boolean
  feature_attendance: boolean
  feature_time_window: boolean
  feature_photo: boolean
  feature_dday: boolean
  feature_notices: boolean
  feature_refund_policy: boolean
  feature_exam_delivery_mode: boolean
  feature_weekday_color: boolean
  feature_anti_forgery_motion: boolean
  time_window_start: string
  time_window_end: string
  target_date: string
  target_date_label: string
  notice_title: string
  notice_content: string
  notice_visible: boolean
  refund_policy: string
  kakao_chat_url: string
  extra_site_url: string
  designated_seat_open: boolean
  attendance_open: boolean
  enrolled_from: string
  enrolled_until: string
}

const EMPTY_SUBJECT = { name: '', sort_order: 0 }

type CourseDetailPageProps = {
  initialData?: CourseDetailData | null
  initialError?: string
  initialLoaded?: boolean
}

async function fetchCourseDetailData(courseId: number) {
  const [courseResponse, subjectResponse] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/courses/${courseId}/subjects`, { cache: 'no-store' }),
  ])

  const coursePayload = await courseResponse.json().catch(() => null)
  const subjectPayload = await subjectResponse.json().catch(() => null)

  if (!courseResponse.ok) {
    throw new Error(coursePayload?.error ?? '강좌 정보를 불러오지 못했습니다.')
  }

  if (!subjectResponse.ok) {
    throw new Error(subjectPayload?.error ?? '과목 목록을 불러오지 못했습니다.')
  }

  return {
    course: coursePayload.course as Course,
    subjects: (subjectPayload.subjects ?? []) as CourseSubject[],
  }
}

function toPatchForm(course: Course): CoursePatchForm {
  return {
    name: course.name,
    slug: course.slug,
    course_type: course.course_type,
    status: course.status,
    theme_color: course.theme_color ?? '#1A237E',
    sort_order: course.sort_order,
    feature_qr_pass: course.feature_qr_pass,
    feature_qr_distribution: course.feature_qr_distribution,
    feature_seat_assignment: course.feature_seat_assignment,
    feature_designated_seat: course.feature_designated_seat,
    feature_attendance: course.feature_attendance,
    feature_time_window: course.feature_time_window,
    feature_photo: course.feature_photo,
    feature_dday: course.feature_dday,
    feature_notices: course.feature_notices,
    feature_refund_policy: course.feature_refund_policy,
    feature_exam_delivery_mode: course.feature_exam_delivery_mode,
    feature_weekday_color: course.feature_weekday_color,
    feature_anti_forgery_motion: course.feature_anti_forgery_motion,
    time_window_start: course.time_window_start ?? '',
    time_window_end: course.time_window_end ?? '',
    target_date: course.target_date ?? '',
    target_date_label: course.target_date_label ?? '',
    notice_title: course.notice_title ?? '',
    notice_content: course.notice_content ?? '',
    notice_visible: course.notice_visible,
    refund_policy: course.refund_policy ?? '',
    kakao_chat_url: course.kakao_chat_url ?? '',
    extra_site_url: course.extra_site_url ?? '',
    designated_seat_open: course.designated_seat_open,
    attendance_open: course.attendance_open,
    enrolled_from: course.enrolled_from ?? '',
    enrolled_until: course.enrolled_until ?? '',
  }
}

function courseTypeLabel(value: CourseType) {
  return formatCourseTypeLabel(value)
}

export default function CourseDetailPage({
  initialData = null,
  initialError = '',
  initialLoaded = Boolean(initialData),
}: CourseDetailPageProps) {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)
  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [subjects, setSubjects] = useState<CourseSubject[]>(initialData?.subjects ?? [])
  const [form, setForm] = useState<CoursePatchForm | null>(
    initialData?.course ? toPatchForm(initialData.course) : null,
  )
  const [newSubject, setNewSubject] = useState(EMPTY_SUBJECT)
  const [enrollmentFields, setEnrollmentFields] = useState<EnrollmentFieldDef[]>(
    initialData?.course?.enrollment_fields ?? [],
  )
  const [fieldsSaving, setFieldsSaving] = useState(false)
  const [fieldsMessage, setFieldsMessage] = useState('')
  const [loading, setLoading] = useState(!initialLoaded)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)
  const [warning, setWarning] = useState('')

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }

    if (initialLoaded) {
      return
    }

    fetchCourseDetailData(courseId)
      .then((data) => {
        setCourse(data.course)
        setForm(toPatchForm(data.course))
        setSubjects(data.subjects)
        setEnrollmentFields(data.course.enrollment_fields ?? [])
        setWarning('')
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '강좌 상세를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId, initialLoaded])

  const stats = useMemo(
    () => ({
      subjectCount: subjects.length,
      seatEnabled: Boolean(course?.feature_seat_assignment),
      designatedSeatEnabled: Boolean(course?.feature_designated_seat),
      attendanceEnabled: Boolean(course?.feature_attendance),
      materialEnabled: Boolean(course?.feature_qr_distribution),
    }),
    [course, subjects.length],
  )

  async function handleDuplicate() {
    if (!course) return

    const confirmed = window.confirm(
      `"${course.name}" 강좌를 복사할까요?\n\n강좌 설정, 과목, 수강생 추가 필드만 복사되고 학생/자료/좌석 데이터는 복사되지 않습니다.`,
    )
    if (!confirmed) return

    setDuplicating(true)
    setError('')
    setWarning('')
    setMessage('')

    const response = await fetch(`/api/courses/${course.id}/duplicate`, {
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    setDuplicating(false)

    if (!response.ok) {
      setError(payload?.error ?? '강좌 복사본을 만들지 못했습니다.')
      return
    }

    const duplicated = payload?.course as Course | undefined
    if (!duplicated?.id) {
      setError('복사된 강좌 정보를 확인하지 못했습니다.')
      return
    }

    router.push(withTenantPrefix(`/dashboard/courses/${duplicated.id}`, tenant.type))
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true); setError(''); setWarning(''); setMessage('')
    const response = await fetch(`/api/courses/${courseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        slug: form.slug.trim(),
        theme_color: form.theme_color.trim(),
        time_window_start: form.time_window_start || null,
        time_window_end: form.time_window_end || null,
        target_date: form.target_date || null,
        target_date_label: form.target_date_label || null,
        notice_title: form.notice_title || null,
        notice_content: form.notice_content || null,
        refund_policy: form.refund_policy || null,
        kakao_chat_url: form.kakao_chat_url || null,
        extra_site_url: form.extra_site_url || null,
        designated_seat_open: form.feature_designated_seat ? form.designated_seat_open : false,
        attendance_open: form.feature_attendance ? form.attendance_open : false,
        enrolled_from: form.enrolled_from || null,
        enrolled_until: form.enrolled_until || null,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) { setError(payload?.error ?? '강좌를 저장하지 못했습니다.'); return }
    const updated = payload.course as Course
    setCourse(updated)
    setForm(toPatchForm(updated))
    setWarning(payload?.warning ?? '')
    setMessage('강좌 설정을 저장했습니다.')
  }

  async function handleCreateSubject(event: FormEvent) {
    event.preventDefault(); setError(''); setWarning(''); setMessage('')
    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSubject),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '과목을 추가하지 못했습니다.'); return }
    setSubjects((current) =>
      [...current, payload.subject as CourseSubject].sort((a, b) => a.sort_order - b.sort_order),
    )
    setNewSubject({ name: '', sort_order: subjects.length + 1 })
    setMessage('과목을 추가했습니다.')
  }

  async function handleSubjectPatch(subject: CourseSubject, values: Partial<CourseSubject>) {
    setError('')
    setWarning('')
    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId: subject.id, ...values }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '과목을 수정하지 못했습니다.'); return }
    const updated = payload.subject as CourseSubject
    setSubjects((current) =>
      current.map((e) => (e.id === updated.id ? updated : e)).sort((a, b) => a.sort_order - b.sort_order),
    )
    setMessage('과목을 수정했습니다.')
  }

  async function handleSubjectDelete(subject: CourseSubject) {
    if (!window.confirm(`"${subject.name}" 과목을 삭제할까요?`)) return
    setError('')
    setWarning('')
    const response = await fetch(`/api/courses/${courseId}/subjects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId: subject.id }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '과목을 삭제하지 못했습니다.'); return }
    setSubjects((current) => current.filter((e) => e.id !== subject.id))
    setMessage('과목을 삭제했습니다.')
  }

  function addField() {
    setEnrollmentFields((current) => [
      ...current,
      { key: `field_${Date.now()}`, label: '', type: 'text' as const },
    ])
  }

  function updateField(index: number, patch: Partial<EnrollmentFieldDef>) {
    setEnrollmentFields((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    )
  }

  function removeField(index: number) {
    setEnrollmentFields((current) => current.filter((_, i) => i !== index))
  }

  function moveField(index: number, direction: 'up' | 'down') {
    setEnrollmentFields((current) => {
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [field] = next.splice(index, 1)
      next.splice(nextIndex, 0, field)
      return next
    })
  }

  async function handleSaveFields() {
    setFieldsSaving(true); setFieldsMessage(''); setError(''); setWarning('')
    const validFields = enrollmentFields.filter((f) => f.label.trim())
    const normalized = validFields.map((f) => ({
      ...f,
      key: f.key || `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: f.label.trim(),
    }))
    const response = await fetch(`/api/courses/${courseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_fields: normalized }),
    })
    const payload = await response.json().catch(() => null)
    setFieldsSaving(false)
    if (!response.ok) { setError(payload?.error ?? '필드 설정을 저장하지 못했습니다.'); return }
    const updated = payload.course as Course
    setCourse(updated)
    setEnrollmentFields(updated.enrollment_fields ?? [])
    setFieldsMessage('수강생 정보 필드를 저장했습니다.')
  }

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
  if (error && !course) return <p className="py-12 text-center text-sm text-red-500">{error}</p>
  if (!course || !form) return <p className="py-12 text-center text-sm text-gray-400">강좌 정보를 찾지 못했습니다.</p>

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={withTenantPrefix('/dashboard/courses', tenant.type)}
            className="text-xs font-medium text-gray-400 hover:underline"
          >
            ← 강좌 관리
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-gray-900">{course.name}</h2>
            {course.copied_from_course_id ? (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                복사본
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            {courseTypeLabel(course.course_type)} · slug {course.slug}
          </p>
          {course.copied_from_course_name ? (
            <p className="mt-1 text-xs font-medium text-indigo-600">
              원본 강좌: {course.copied_from_course_name}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={duplicating}
            className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {duplicating ? '복사중' : '복사'}
          </button>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}/students`, tenant.type)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            수강생 관리
          </Link>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}/seats`, tenant.type)}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            좌석 배정
          </Link>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}/designated-seats`, tenant.type)}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            지정좌석
          </Link>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}/attendance`, tenant.type)}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            출결 관리
          </Link>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}/materials`, tenant.type)}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            자료 관리
          </Link>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">과목 수</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-600">{stats.subjectCount}</p>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">좌석 기능</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">{stats.seatEnabled ? 'ON' : 'OFF'}</p>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">자료 배부</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-600">{stats.materialEnabled ? 'ON' : 'OFF'}</p>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">지정좌석</p>
          <p className="mt-1 text-2xl font-extrabold text-violet-600">{stats.designatedSeatEnabled ? 'ON' : 'OFF'}</p>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">출결 체크</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-600">{stats.attendanceEnabled ? 'ON' : 'OFF'}</p>
        </div>
      </div>

      {(error || warning || message) && (
        <div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {warning && <p className="text-xs text-amber-600">{warning}</p>}
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        {/* ── Course settings form ── */}
        <form onSubmit={handleSave} className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">강좌 설정</h3>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">강좌명</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((c) => c && { ...c, name: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">슬러그</label>
                <input
                  value={form.slug}
                  readOnly
                  className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-gray-400 outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-gray-500">강좌 유형</label>
                <select
                  value={form.course_type}
                  onChange={(e) => setForm((c) => c ? { ...c, course_type: e.target.value as CourseType } : c)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="general">일반</option>
                  <option value="lecture">강의</option>
                  <option value="mock_exam">모의고사</option>
                  <option value="interview">면접</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">상태</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((c) => c ? { ...c, status: e.target.value as 'active' | 'archived' } : c)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="active">운영중</option>
                  <option value="archived">보관</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">정렬순서</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((c) => c ? { ...c, sort_order: Number(e.target.value || 0) } : c)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">테마 색상</label>
                <div className="flex items-center gap-2">
                  <input
                    value={form.theme_color}
                    onChange={(e) => setForm((c) => c && { ...c, theme_color: e.target.value })}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                  <span className="h-9 w-9 shrink-0 rounded-lg border border-slate-200" style={{ background: form.theme_color }} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">입장 시작</label>
                <input
                  type="time"
                  value={form.time_window_start}
                  onChange={(e) => setForm((c) => c && { ...c, time_window_start: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">입장 종료</label>
                <input
                  type="time"
                  value={form.time_window_end}
                  onChange={(e) => setForm((c) => c && { ...c, time_window_end: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">수강 시작일</label>
                <input
                  type="date"
                  value={form.enrolled_from}
                  onChange={(e) => setForm((c) => c && { ...c, enrolled_from: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">수강 종료일</label>
                <input
                  type="date"
                  value={form.enrolled_until}
                  onChange={(e) => setForm((c) => c && { ...c, enrolled_until: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">목표일</label>
                <input
                  type="date"
                  value={form.target_date}
                  onChange={(e) => setForm((c) => c && { ...c, target_date: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">목표일 라벨</label>
                <input
                  value={form.target_date_label}
                  onChange={(e) => setForm((c) => c && { ...c, target_date_label: e.target.value })}
                  placeholder="예: 시험일, 면접일"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            {/* Feature toggles */}
            <div className="mt-1 flex flex-wrap gap-3">
              {([
                ['feature_qr_pass', 'QR 수강증'],
                ['feature_qr_distribution', '자료 배부'],
                ['feature_seat_assignment', '좌석 배정'],
                ['feature_designated_seat', '지정좌석'],
                ['feature_time_window', '시간 제한'],
                ['feature_photo', '사진 표시'],
                ['feature_dday', 'D-day'],
                ['feature_notices', '공지 사용'],
                ['feature_refund_policy', '환불 규정'],
                ['feature_exam_delivery_mode', '시험 배부 모드'],
                ['feature_weekday_color', '요일별 색상'],
                ['feature_anti_forgery_motion', '위조 방지 효과'],
                ['notice_visible', '공지 공개'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof CoursePatchForm])}
                    onChange={(e) => setForm((c) => c ? { ...c, [key]: e.target.checked } : c)}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={form.feature_attendance}
                onChange={(e) => setForm((c) => c ? { ...c, feature_attendance: e.target.checked } : c)}
                className="rounded"
              />
              출결 체크 기능 사용
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={form.designated_seat_open}
                onChange={(e) => setForm((c) => c ? { ...c, designated_seat_open: e.target.checked } : c)}
                className="rounded"
                disabled={!form.feature_designated_seat}
              />
              지정좌석 학생 신청 열기
            </label>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">공지 제목</label>
              <input
                value={form.notice_title}
                onChange={(e) => setForm((c) => c && { ...c, notice_title: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">공지 내용</label>
              <textarea
                value={form.notice_content}
                onChange={(e) => setForm((c) => c && { ...c, notice_content: e.target.value })}
                rows={4}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">환불 규정</label>
              <textarea
                value={form.refund_policy}
                onChange={(e) => setForm((c) => c && { ...c, refund_policy: e.target.value })}
                rows={4}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">카카오톡 단톡방 링크</label>
              <input
                value={form.kakao_chat_url}
                onChange={(e) => setForm((c) => c && { ...c, kakao_chat_url: e.target.value })}
                placeholder="https://open.kakao.com/o/..."
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
              {form.kakao_chat_url ? (
                <p className="text-xs text-gray-400">학생 수강증 화면에 카카오톡 참여 버튼이 표시됩니다.</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">추가 사이트 링크</label>
              <input
                value={form.extra_site_url}
                onChange={(e) => setForm((c) => c && { ...c, extra_site_url: e.target.value })}
                placeholder="https://example.com"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
              {form.extra_site_url ? (
                <p className="text-xs text-gray-400">학생 강좌 화면에 추가 사이트 이동 버튼이 표시됩니다.</p>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
          >
            {saving ? '저장 중...' : '강좌 저장'}
          </button>
        </form>

        {/* ── Subjects section ── */}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">과목 설정</h3>
          <p className="mt-1 text-xs text-gray-400">
            좌석 배정 강좌는 과목을 먼저 만들어 두어야 좌석 일괄 입력이 가능합니다.
          </p>

          <form onSubmit={handleCreateSubject} className="mt-4 grid gap-2 md:grid-cols-[1fr,80px,auto]">
            <input
              value={newSubject.name}
              onChange={(e) => setNewSubject((c) => ({ ...c, name: e.target.value }))}
              placeholder="예: 형사법"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
            <input
              type="number"
              value={newSubject.sort_order}
              onChange={(e) => setNewSubject((c) => ({ ...c, sort_order: Number(e.target.value || 0) }))}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
              추가
            </button>
          </form>

          <div className="mt-4">
            {subjects.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">등록된 과목이 없습니다.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                      <th className="px-4 py-3">과목명</th>
                      <th className="px-3 py-3 w-20">순서</th>
                      <th className="px-4 py-3 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {subjects.map((subject) => (
                      <tr key={subject.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <input
                            defaultValue={subject.name}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              if (v && v !== subject.name) void handleSubjectPatch(subject, { name: v })
                            }}
                            className="w-full rounded-lg border border-transparent px-2 py-1 text-sm text-gray-900 outline-none focus:border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            defaultValue={subject.sort_order}
                            onBlur={(e) => {
                              const v = Number(e.target.value || 0)
                              if (v !== subject.sort_order) void handleSubjectPatch(subject, { sort_order: v })
                            }}
                            className="w-full rounded-lg border border-transparent px-2 py-1 text-sm text-gray-900 outline-none focus:border-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={withTenantPrefix(`/dashboard/courses/${courseId}/seats`, tenant.type)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                            >
                              좌석
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleSubjectDelete(subject)}
                              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Enrollment fields ── */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700">수강생 정보 필드</h3>
        <p className="mt-1 text-xs text-gray-400">
          학번, 이름, 연락처는 기본 필수 항목입니다. 강좌별로 추가 정보 필드를 설정할 수 있습니다.
        </p>

        <div className="mt-4 grid gap-2">
          <div className="grid grid-cols-[72px,1fr,1fr,100px,auto] gap-2 text-[11px] font-semibold text-gray-400">
            <span>순서</span>
            <span>필드명</span>
            <span>유형</span>
            <span>선택지</span>
            <span />
          </div>

          {enrollmentFields.map((field, index) => (
            <div key={field.key} className="grid grid-cols-[72px,1fr,1fr,100px,auto] gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveField(index, 'up')}
                  disabled={index === 0}
                  className="rounded-lg bg-slate-100 px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >UP</button>
                <button
                  type="button"
                  onClick={() => moveField(index, 'down')}
                  disabled={index === enrollmentFields.length - 1}
                  className="rounded-lg bg-slate-100 px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >DN</button>
              </div>
              <input
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="필드명 (예: 성별, 지역)"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
              <select
                value={field.type}
                onChange={(e) => updateField(index, { type: e.target.value as 'text' | 'select' })}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              >
                <option value="text">텍스트</option>
                <option value="select">선택</option>
              </select>
              <div>
                {field.type === 'select' ? (
                  <input
                    value={(field.options ?? []).join(',')}
                    onChange={(e) =>
                      updateField(index, {
                        options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="남,여"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                ) : (
                  <span className="block py-2.5 text-center text-xs text-gray-400">—</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addField}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            + 필드 추가
          </button>
          <button
            type="button"
            onClick={() => void handleSaveFields()}
            disabled={fieldsSaving}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
          >
            {fieldsSaving ? '저장 중...' : '필드 설정 저장'}
          </button>
          {fieldsMessage && <span className="text-xs text-emerald-600">{fieldsMessage}</span>}
        </div>
      </section>
    </div>
  )
}
