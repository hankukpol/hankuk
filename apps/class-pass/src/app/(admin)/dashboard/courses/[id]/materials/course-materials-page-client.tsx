'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import { createMaterialRequestId } from '@/lib/distribution/material-request-id'
import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { startTransition, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { SeatEditModal } from '@/components/designated-seat/SeatEditModal'
import { useDeferredInteractionWork } from '@/hooks/use-deferred-interaction-work'
import type { Course, CourseSubject, Material, MaterialType } from '@/types/database'
import { MaterialSeriesModal } from './material-series-modal'
import { MaterialFormFields, type MaterialForm } from './material-form-fields'
import { MaterialCreateDrawer } from './material-create-drawer'

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
  if (!subjectsResponse.ok) {
    throw new Error(subjectsPayload?.error ?? '배부 대상 과목을 불러오지 못했습니다. 새로고침해 주세요.')
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
  const editFormId = useId()
  const deferInteractionWork = useDeferredInteractionWork()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [materials, setMaterials] = useState<Material[]>(initialData?.materials ?? [])
  const [subjects, setSubjects] = useState<CourseSubject[]>(initialData?.subjects ?? [])
  const [activeTab, setActiveTab] = useState<MaterialType>('handout')
  const [createForm, setCreateForm] = useState<MaterialForm>(EMPTY_FORM)
  const [creatingType, setCreatingType] = useState<MaterialType | null>(null)
  const createPending = useRef(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<MaterialForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(!initialLoaded)
  const [saving, setSaving] = useState(false)
  const [createUncertain, setCreateUncertain] = useState(false)
  const creationRequest = useRef<string | null>(null)
  const [seriesSource, setSeriesSource] = useState<Material | null | undefined>(undefined)
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
    if (saving || createPending.current || !creatingType) return
    createPending.current = true
    setSaving(true)
    setError('')
    setMessage('')

    try {
      creationRequest.current ??= JSON.stringify({
        requestId: createMaterialRequestId(), courseId, ...createForm, material_type: creatingType,
        subject_id: creatingType === 'handout' ? createForm.subject_id : null,
      })
      const response = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: creationRequest.current,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        // A rejection of this retry (including expired authentication) says nothing
        // about whether an earlier response-lost request already committed.
        const keepUncertainRequest = createUncertain || response.status >= 500
        if (keepUncertainRequest) {
          setCreateUncertain(true)
        } else {
          creationRequest.current = null
          setCreateUncertain(false)
        }
        const errorMessage = payload?.error ?? '자료를 생성하지 못했습니다.'
        setError(keepUncertainRequest
          ? `${errorMessage} 이전 생성 결과가 아직 확정되지 않아 입력과 닫기를 잠근 상태입니다. 문제를 해결한 뒤 생성 버튼을 다시 누르면 기존 요청으로 확인합니다.`
          : errorMessage)
        return
      }
      if (!payload?.material) throw new Error('자료 생성 결과를 확인하지 못했습니다.')

      setCreateForm(EMPTY_FORM)
      creationRequest.current = null
      setCreateUncertain(false)
      setMaterials((current) => [...current.filter(item => item.id !== payload.material.id), payload.material as Material])
      setCreatingType(null)
      setMessage(payload.warning ?? `${getTabLabel(creatingType)}를 생성했습니다.`)
    } catch {
      setCreateUncertain(creationRequest.current !== null)
      setError(creationRequest.current === null
        ? '자료 생성 요청을 준비하지 못해 전송하지 않았습니다. 최신 브라우저나 HTTPS 연결에서 다시 시도해 주세요.'
        : '자료 생성 결과를 확인하지 못했습니다. 저장됐을 수 있어 입력과 닫기를 잠갔습니다. 생성 버튼을 다시 누르면 같은 요청의 결과를 확인하며 중복 생성하지 않습니다.')
    } finally {
      createPending.current = false
      setSaving(false)
    }
  }

  function startEdit(material: Material) {
    setEditingId(material.id)
    setEditForm(toForm(material))
    setError('')
    setMessage('')
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingId || saving) {
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/materials/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error ?? '자료를 수정하지 못했습니다.')
        return
      }
      if (!payload?.material) throw new Error('자료 수정 결과를 확인하지 못했습니다.')

      const updated = payload.material as Material
      setMaterials((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setEditingId(null)
      setMessage('자료를 수정했습니다.')
    } catch {
      setError('자료 수정 결과를 확인하지 못했습니다. 목록을 새로고침해 저장 여부를 확인해 주세요.')
    } finally {
      setSaving(false)
    }
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
    return <p className="text-sm text-red-600">{getUserErrorMessage(error || '과정을 찾을 수 없습니다.')}</p>
  }

  return (
    <>
      <MaterialCreateDrawer open={creatingType !== null} materialType={creatingType ?? activeTab}
        courseName={course.name} value={createForm} subjects={subjects} saving={saving} locked={createUncertain} error={error}
        onChange={(value) => { if (!createPending.current && !createUncertain) setCreateForm(value) }} onSubmit={handleCreate}
        onClose={() => { if (!createPending.current && !createUncertain) { creationRequest.current = null; setCreatingType(null); setError('') } }} />
      <AnimatePresence>{seriesSource !== undefined ? (
        <MaterialSeriesModal
          key={seriesSource?.id ?? 'new-series'}
          courseId={courseId}
          source={seriesSource}
          subjects={subjects}
          onClose={() => setSeriesSource(undefined)}
          onCreated={(created, warning) => {
            setMaterials((current) => [...current, ...created])
            setSeriesSource(undefined)
            setError('')
            setMessage(`${created.length}개 회차를 비활성 자료로 만들었습니다. 이름과 배부 대상을 확인한 뒤 수정에서 활성화해 주세요.${warning ? ` ${warning}` : ''}`)
          }}
        />
      ) : null}</AnimatePresence>
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
      <section>
        <div className="admin-subtabs" role="group" aria-label="자료 종류">
          {(['handout', 'textbook'] as const).map((materialType) => (
            <button
              key={materialType}
              type="button"
              disabled={saving || deleteSubmitting}
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
              className="admin-subtab"
              data-active={activeTab === materialType}
              aria-pressed={activeTab === materialType}
            >
              {getTabLabel(materialType)}
            </button>
          ))}
        </div>

        <div className="admin-metric-strip admin-material-summary mt-6">
          {[
            { label: `${getTabLabel(activeTab)} 전체`, value: summary.total },
            { label: '활성', value: summary.active },
            { label: '비활성', value: summary.inactive },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-sm font-semibold text-gray-500">{item.label}</p>
              <p className="mt-1 font-extrabold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

          <section className="min-w-0">
            <div className="admin-material-toolbar">
              <h3 className="admin-section-title">
                {getTabLabel(activeTab)} 목록
              </h3>
              <div className="admin-material-actions">
              <button type="button" className="admin-button admin-button-primary" disabled={saving || deleteSubmitting}
                onClick={() => { setCreateForm(EMPTY_FORM); setError(''); setMessage(''); setCreatingType(activeTab) }}>
                <Plus size={16} aria-hidden="true" />
                새 {getTabLabel(activeTab)}
              </button>
              {activeTab === 'handout' ? (
                <button type="button" className="admin-button" disabled={saving || deleteSubmitting} onClick={() => setSeriesSource(null)}>
                  여러 회차 만들기
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving || deleteSubmitting}
                onClick={() => {
                  setError('')
                  setLoading(true)
                  refreshPage()
                    .catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : '자료 목록을 새로고침하지 못했습니다.')
                    })
                    .finally(() => setLoading(false))
                }}
                className="admin-button"
              >
                새로고침
              </button>
              </div>
            </div>

            {error && !creatingType && !editingId ? <p role="alert" className="admin-material-notice mt-4 text-red-600">{getUserErrorMessage(error)}</p> : null}
            {message ? <p role="status" className="admin-material-notice mt-4 text-emerald-700">{message}</p> : null}

            <div className="admin-material-list">
              {filteredMaterials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-gray-500">
                  아직 등록된 {getTabLabel(activeTab)}가 없습니다.
                </div>
              ) : (
                filteredMaterials.map((material) => (
                  <article key={material.id} className="admin-material-item">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="admin-material-name">{material.name}</h4>
                          <span
                            className={`admin-material-badge ${
                              material.is_active
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {material.is_active ? '활성' : '비활성'}
                          </span>
                          {material.material_type === 'handout' ? (
                            material.subject_id != null ? (
                              <span className="admin-material-badge bg-indigo-100 text-indigo-700">
                                {subjectNameById.get(material.subject_id) ?? '과목'} 좌석자만
                              </span>
                            ) : (
                              <span className="admin-material-badge bg-slate-100 text-slate-500">
                                전체 배부
                              </span>
                            )
                          ) : null}
                        </div>
                        {material.description ? (
                          <p className="admin-material-help mt-2">{material.description}</p>
                        ) : null}
                        <p className="admin-material-help mt-2">정렬 순서 {material.sort_order}</p>
                      </div>

                      <div className="admin-material-actions">
                        {material.material_type === 'handout' ? (
                          <button type="button" className="admin-button" disabled={saving || deleteSubmitting} onClick={() => setSeriesSource(material)}>
                            다음 회차 만들기
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving || deleteSubmitting}
                          onClick={() => startEdit(material)}
                          className="admin-button admin-material-edit"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={saving || deleteSubmitting}
                          onClick={() => requestDelete(material)}
                          className="admin-button admin-material-danger"
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

      <SeatEditModal
        open={Boolean(editingId)}
        title="자료 수정"
        badge={editingMaterial ? getTabLabel(editingMaterial.material_type) : undefined}
        description={editingMaterial ? `"${editingMaterial.name}" 항목을 수정합니다.` : undefined}
        widthClassName="max-w-lg"
        closeDisabled={saving}
        footer={<>
          <button type="button" disabled={saving} onClick={() => setEditingId(null)} className="admin-button">취소</button>
          <button type="submit" form={editFormId} disabled={saving} className="admin-button admin-button-primary">
            {saving ? '저장 중...' : '변경사항 저장'}
          </button>
        </>}
        onClose={() => { if (!saving) setEditingId(null) }}
      >
        <form id={editFormId} onSubmit={handleSaveEdit} className="flex flex-col gap-4">
          <MaterialFormFields value={editForm} onChange={setEditForm}
            nameLabel={`${editingMaterial ? getTabLabel(editingMaterial.material_type) : '자료'} 이름`} handout={editingMaterial?.material_type === 'handout'}
            subjects={subjects} disabled={saving} />

          {error ? <p role="alert" className="admin-material-notice text-red-600">{getUserErrorMessage(error)}</p> : null}
        </form>
      </SeatEditModal>
    </>
  )
}
