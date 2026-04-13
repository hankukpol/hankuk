'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, CourseType } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'

type CreateCourseForm = {
  name: string
  course_type: CourseType
  theme_color: string
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

const DEFAULT_FORM: CreateCourseForm = {
  name: '',
  course_type: 'general',
  theme_color: '#1A237E',
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
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [form, setForm] = useState<CreateCourseForm>(DEFAULT_FORM)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicatingCourseId, setDuplicatingCourseId] = useState<number | null>(null)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')

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

  const filtered = filter === 'all'
    ? courses
    : courses.filter((c) => c.status === filter)

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, theme_color: form.theme_color.trim() }),
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
    await loadCourses().catch(() => {})
  }

  async function handleArchive(course: Course) {
    if (!window.confirm(`"${course.name}" 강좌를 아카이브할까요?`)) return
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${course.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '아카이브 실패'); return }
    setCourses((c) => c.map((e) => (e.id === course.id ? { ...e, status: 'archived' as const } : e)))
    setMessage('강좌를 아카이브했습니다.')
  }

  async function handleDuplicate(course: Course) {
    const confirmed = window.confirm(
      `"${course.name}" 강좌를 복사할까요?\n\n강좌 설정, 과목, 수강생 추가 필드만 복사되고 학생/자료/좌석 데이터는 복사되지 않습니다.`,
    )
    if (!confirmed) return

    setDuplicatingCourseId(course.id)
    setError('')
    setMessage('')

    const response = await fetch(`/api/courses/${course.id}/duplicate`, {
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    setDuplicatingCourseId(null)

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

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header + actions ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#1d1d1f]">강좌 관리</h2>
          <p className="mt-1 text-sm text-[#86868b]">
            전체 {courses.length}개 · 운영중 {courses.filter((c) => c.status === 'active').length}개
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-[8px] bg-[#0071e3] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          {showForm ? '닫기' : '+ 새 강좌'}
        </button>
      </div>

      {/* ── Create form (collapsible) ── */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-[8px] border border-[#d2d2d7] bg-white p-5">
          <h3 className="text-sm font-bold text-[#1d1d1f]">새 강좌 만들기</h3>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              placeholder="강좌명"
              className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b] sm:col-span-2"
            />
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
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            {FEATURE_LABELS.map((item) => (
              <label key={item.key} className="flex items-center gap-1.5 text-xs text-[#1d1d1f]">
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

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[8px] bg-[#0071e3] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? '생성 중...' : '강좌 생성'}
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {message && <span className="text-xs text-[#1b7a1b]">{message}</span>}
          </div>
        </form>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 rounded-[8px] bg-[#f5f5f7] p-1">
        {(['all', 'active', 'archived'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-[8px] px-3 py-2 text-xs font-semibold transition ${
              filter === f ? 'bg-white text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#1d1d1f]'
            }`}
          >
            {f === 'all' ? '전체' : f === 'active' ? '운영중' : '보관됨'}
          </button>
        ))}
      </div>

      {/* ── Course table ── */}
      <section className="overflow-hidden rounded-[8px] bg-white">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-[#86868b]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#86868b]">해당 강좌가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f5f5f7] text-left text-xs font-medium text-[#86868b]">
                  <th className="px-5 py-3">강좌</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="hidden px-3 py-3 md:table-cell">기능</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f7]">
                {filtered.map((course) => {
                  const tags = [
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
                  ].filter(Boolean)

                  return (
                    <tr key={course.id} className="hover:bg-[#f5f5f7]/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white"
                            style={{ background: '#1d1d1f' }}
                          >
                            {course.id}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-[#1d1d1f]">{course.name}</p>
                              {course.copied_from_course_id ? (
                                <span className="rounded-[4px] bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  복사본
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-[#86868b]">
                              {course.slug}
                              {course.copied_from_course_name ? ` · 원본 ${course.copied_from_course_name}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-[#86868b]">{courseTypeLabel(course.course_type)}</td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-block rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                          course.status === 'active'
                            ? 'bg-[#f5f5f7] text-[#1b7a1b]'
                            : 'bg-[#f5f5f7] text-[#86868b]'
                        }`}>
                          {course.status === 'active' ? '운영중' : '보관됨'}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3.5 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <span key={t as string} className="rounded-[4px] bg-[#f5f5f7] px-1.5 py-0.5 text-[10px] font-medium text-[#86868b]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                            className="rounded-[8px] bg-[#f5f5f7] px-2.5 py-1.5 text-[11px] font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed]"
                          >
                            수강생
                          </Link>
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
                            className="rounded-[8px] bg-[#1d1d1f] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1d1d1f]"
                          >
                            설정
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(course)}
                            disabled={duplicatingCourseId === course.id}
                            className="rounded-[8px] bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {duplicatingCourseId === course.id ? '복사중' : '복사'}
                          </button>
                          {course.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => void handleArchive(course)}
                              className="rounded-[8px] bg-[#f5f5f7] px-2.5 py-1.5 text-[11px] font-semibold text-[#86868b] hover:bg-[#e8e8ed]"
                            >
                              보관
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
        )}
      </section>
    </div>
  )
}
