'use client'

import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { SeatEditModal } from '@/components/designated-seat/SeatEditModal'
import { useDeferredInteractionWork } from '@/hooks/use-deferred-interaction-work'
import type { Course, CourseSubject, Material, MaterialType } from '@/types/database'
import { useMotionConfig } from '@/lib/motion'

type MaterialForm = {
  name: string
  description: string
  is_active: boolean
  sort_order: number
  subject_id: number | null
}

export type MaterialsPageData = {
  course: Course
  materials: Material[]
  subjects: CourseSubject[]
}

type CourseMaterialsPageProps = {
  initialData?: MaterialsPageData | null
  initialError?: string
  initialLoaded?: boolean
}

const EMPTY_FORM: MaterialForm = {
  name: '',
  description: '',
  is_active: true,
  sort_order: 0,
  subject_id: null,
}

function toForm(material: Material): MaterialForm {
  return {
    name: material.name,
    description: material.description ?? '',
    is_active: material.is_active,
    sort_order: material.sort_order,
    subject_id: material.subject_id ?? null,
  }
}

function getTabLabel(materialType: MaterialType) {
  return materialType === 'textbook' ? '교재' : '배부자료'
}

async function fetchMaterialsPageData(courseId: number): Promise<MaterialsPageData> {
  const [courseResponse, materialsResponse, subjectsResponse] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/materials?courseId=${courseId}`, { cache: 'no-store' }),
    fetch(`/api/courses/${courseId}/subjects`, { cache: 'no-store' }),
  ])

  const coursePayload = await courseResponse.json().catch(() => null)
  const materialsPayload = await materialsResponse.json().catch(() => null)
  const subjectsPayload = await subjectsResponse.json().catch(() => null)

  if (!courseResponse.ok) {
    throw new Error(coursePayload?.error ?? '과정 정보를 불러오지 못했습니다.')
  }

  if (!materialsResponse.ok) {
    throw new Error(materialsPayload?.error ?? '자료 목록을 불러오지 못했습니다.')
  }

  return {
    course: coursePayload.course as Course,
    materials: (materialsPayload.materials ?? []) as Material[],
    subjects: (subjectsPayload?.subjects ?? []) as CourseSubject[],
  }
}

export default function CourseMaterialsPage({
  initialData = null,
  initialError = '',
  initialLoaded = Boolean(initialData),
}: CourseMaterialsPageProps) {
  const params = useParams<{ id: string }>()
  const motionConfig = useMotionConfig()
  const deferInteractionWork = useDeferredInteractionWork()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [materials, setMaterials] = useState<Material[]>(initialData?.materials ?? [])
  const [subjects, setSubjects] = useState<CourseSubject[]>(initialData?.subjects ?? [])
  const [activeTab, setActiveTab] = useState<MaterialType>('handout')
  const [createForm, setCreateForm] = useState<MaterialForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<MaterialForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(!initialLoaded)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)

  async function refreshPage() {
    const data = await fetchMaterialsPageData(courseId)
    setCourse(data.course)
    setMaterials(data.materials)
    setSubjects(data.subjects)
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 과정 ID입니다.')
      setLoading(false)
      return
    }

    if (initialLoaded) {
      return
    }

    fetchMaterialsPageData(courseId)
      .then((data) => {
        setCourse(data.course)
        setMaterials(data.materials)
        setSubjects(data.subjects)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '자료 페이지를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId, initialLoaded])

  const subjectNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const subject of subjects) {
      map.set(subject.id, subject.name)
    }
    return map
  }, [subjects])

  const editingMaterial = useMemo(
    () => materials.find((material) => material.id === editingId) ?? null,
    [editingId, materials],
  )

  const summary = useMemo(() => {
    const currentMaterials = materials.filter((material) => material.material_type === activeTab)
    const active = currentMaterials.filter((material) => material.is_active).length

    return {
      total: currentMaterials.length,
      active,
      inactive: currentMaterials.length - active,
    }
  }, [activeTab, materials])

  const filteredMaterials = useMemo(
    () => materials
      .filter((material) => material.material_type === activeTab)
      .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [activeTab, materials],
  )

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        ...createForm,
        material_type: activeTab,
        // 과목 게이팅은 배부자료(handout) 전용. 교재 생성 시에는 과목을 보내지 않는다.
        subject_id: activeTab === 'handout' ? createForm.subject_id : null,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      setError(payload?.error ?? '자료를 생성하지 못했습니다.')
      return
    }

    setCreateForm(EMPTY_FORM)
    setMaterials((current) => [...current, payload.material as Material])
    setMessage(`${getTabLabel(activeTab)}를 생성했습니다.`)
  }

  function startEdit(material: Material) {
    setEditingId(material.id)
    setEditForm(toForm(material))
    setError('')
    setMessage('')
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingId) {
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const response = await fetch(`/api/materials/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      setError(payload?.error ?? '자료를 수정하지 못했습니다.')
      return
    }

    const updated = payload.material as Material
    setMaterials((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    setEditingId(null)
    setMessage('자료를 수정했습니다.')
  }

  function requestDelete(material: Material) {
    deferInteractionWork(() => {
      setDeleteTarget(material)
    })
  }

  async function handleDeleteConfirmed() {
    const material = deleteTarget
    if (!material || deleteSubmitting) {
      return
    }

    setDeleteSubmitting(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/materials/${material.id}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '자료를 삭제하지 못했습니다.')
        return
      }

      setMaterials((current) => current.filter((entry) => entry.id !== material.id))
      if (editingId === material.id) {
        setEditingId(null)
      }
      setDeleteTarget(null)
      setMessage('자료를 삭제했습니다.')
    } catch {
      setError('자료를 삭제하지 못했습니다.')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">자료 목록을 불러오는 중입니다.</p>
  }

  if (!course) {
    return <p className="text-sm text-red-600">{error || '과정을 찾을 수 없습니다.'}</p>
  }

  return (
    <>
      <ConfirmationModal
        open={Boolean(deleteTarget)}
        title="자료를 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.name}" 항목은 삭제 후 되돌릴 수 없습니다.` : undefined}
        confirmLabel="삭제"
        pendingLabel="삭제 중..."
        tone="danger"
        submitting={deleteSubmitting}
        onClose={() => {
          if (!deleteSubmitting) {
            setDeleteTarget(null)
          }
        }}
        onConfirm={() => {
          void handleDeleteConfirmed()
        }}
      />
      <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex gap-6 border-b border-slate-200 overflow-x-auto">
          {(['handout', 'textbook'] as const).map((materialType) => (
            <button
              key={materialType}
              type="button"
              onClick={() => {
                if (activeTab === materialType) {
                  return
                }

                deferInteractionWork(() => {
                  startTransition(() => {
                    setActiveTab(materialType)
                    setEditingId(null)
                    setMessage('')
                    setError('')
                  })
                })
              }}
              className={`relative -mb-px whitespace-nowrap border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${
                activeTab === materialType
                  ? 'text-[#1d1d1f]'
                  : 'text-slate-500 hover:text-[#1d1d1f]'
              }`}
            >
              {getTabLabel(materialType)}
              {activeTab === materialType ? (
                <motion.div
                  layoutId="materials-tabs"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d1d1f]"
                  transition={motionConfig.tab}
                />
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: `${getTabLabel(activeTab)} 전체`, value: summary.total },
            { label: '활성', value: summary.active },
            { label: '비활성', value: summary.inactive },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-semibold text-gray-500">{item.label}</p>
              <p className="mt-3 text-3xl font-extrabold text-gray-900">{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
        <form onSubmit={handleCreate} className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {getTabLabel(activeTab)} 추가
          </p>
          <h3 className="mt-3 text-2xl font-extrabold text-gray-900">
            새 {getTabLabel(activeTab)} 만들기
          </h3>

          <div className="mt-6 grid gap-4">
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={`${getTabLabel(activeTab)} 이름`}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
            />
            <textarea
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              placeholder="설명"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="number"
                value={createForm.sort_order}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    sort_order: Number(event.target.value || 0),
                  }))
                }
                placeholder="정렬 순서"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
              />
              <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-gray-700">
                <span>활성 상태</span>
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, is_active: event.target.checked }))
                  }
                />
              </label>
            </div>
            {subjects.length > 0 && activeTab === 'handout' ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-500">
                  배부 대상 과목 (선택)
                </span>
                <select
                  value={createForm.subject_id ?? ''}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      subject_id: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                >
                  <option value="">전체 배부 (좌석 무관)</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name} 좌석 배정자만
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">
                  과목을 지정하면 그 과목 좌석을 배정받은 학생만 이 자료를 받을 수 있습니다.
                </span>
              </label>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 rounded-2xl px-5 py-4 text-lg font-bold text-white transition-all duration-200 ease-ios hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
            style={{ background: 'var(--theme)' }}
          >
            {saving ? '저장 중...' : `${getTabLabel(activeTab)} 생성`}
          </button>
        </form>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-2xl font-extrabold text-gray-900">
                {getTabLabel(activeTab)} 목록
              </h3>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setLoading(true)
                  refreshPage()
                    .catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : '자료 목록을 새로고침하지 못했습니다.')
                    })
                    .finally(() => setLoading(false))
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97]"
              >
                새로고침
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              {filteredMaterials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-gray-500">
                  아직 등록된 {getTabLabel(activeTab)}가 없습니다.
                </div>
              ) : (
                filteredMaterials.map((material) => (
                  <article key={material.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-bold text-gray-900">{material.name}</h4>
                          <span
                            className={`rounded-2xl px-3 py-1 text-xs font-semibold ${
                              material.is_active
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {material.is_active ? '활성' : '비활성'}
                          </span>
                          {material.material_type === 'handout' ? (
                            material.subject_id != null ? (
                              <span className="rounded-2xl bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                                {subjectNameById.get(material.subject_id) ?? '과목'} 좌석자만
                              </span>
                            ) : (
                              <span className="rounded-2xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                                전체 배부
                              </span>
                            )
                          ) : null}
                        </div>
                        {material.description ? (
                          <p className="mt-2 text-sm leading-6 text-gray-500">{material.description}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-gray-400">정렬 순서 {material.sort_order}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(material)}
                          className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97]"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(material)}
                          className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 ease-ios hover:bg-rose-50 active:scale-[0.97]"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

        </div>
      </div>
      </div>

      <SeatEditModal
        open={Boolean(editingId)}
        title="자료 수정"
        badge={editingMaterial ? getTabLabel(editingMaterial.material_type) : undefined}
        description={editingMaterial ? `"${editingMaterial.name}" 항목을 수정합니다.` : undefined}
        widthClassName="max-w-lg"
        onClose={() => setEditingId(null)}
      >
        <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#86868b]">이름</span>
            <input
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="이름"
              className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0071e3]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#86868b]">설명</span>
            <textarea
              value={editForm.description}
              onChange={(event) =>
                setEditForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              placeholder="설명"
              className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0071e3]"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#86868b]">정렬 순서</span>
              <input
                type="number"
                value={editForm.sort_order}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    sort_order: Number(event.target.value || 0),
                  }))
                }
                placeholder="정렬 순서"
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0071e3]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 self-end rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm font-medium text-[#1d1d1f]">
              <span>활성 상태</span>
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, is_active: event.target.checked }))
                }
              />
            </label>
          </div>
          {subjects.length > 0 && editingMaterial?.material_type === 'handout' ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#86868b]">배부 대상 과목 (선택)</span>
              <select
                value={editForm.subject_id ?? ''}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    subject_id: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0071e3]"
              >
                <option value="">전체 배부 (좌석 무관)</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} 좌석 배정자만
                  </option>
                ))}
              </select>
              <span className="text-xs text-[#86868b]">
                과목을 지정하면 그 과목 좌석을 배정받은 학생만 이 자료를 받을 수 있습니다.
              </span>
            </label>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[8px] bg-[#0071e3] px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
            >
              {saving ? '저장 중...' : '변경사항 저장'}
            </button>
          </div>
        </form>
      </SeatEditModal>
    </>
  )
}
