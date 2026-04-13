'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import type { Course, Material } from '@/types/database'

type MaterialForm = {
  name: string
  description: string
  is_active: boolean
  sort_order: number
}

type MaterialsPageData = {
  course: Course
  materials: Material[]
}

const EMPTY_FORM: MaterialForm = {
  name: '',
  description: '',
  is_active: true,
  sort_order: 0,
}

function toForm(material: Material): MaterialForm {
  return {
    name: material.name,
    description: material.description ?? '',
    is_active: material.is_active,
    sort_order: material.sort_order,
  }
}

async function fetchMaterialsPageData(courseId: number): Promise<MaterialsPageData> {
  const [courseResponse, materialsResponse] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/materials?courseId=${courseId}`, { cache: 'no-store' }),
  ])

  const coursePayload = await courseResponse.json().catch(() => null)
  const materialsPayload = await materialsResponse.json().catch(() => null)

  if (!courseResponse.ok) {
    throw new Error(coursePayload?.error ?? '강좌 정보를 불러오지 못했습니다.')
  }

  if (!materialsResponse.ok) {
    throw new Error(materialsPayload?.error ?? '자료 목록을 불러오지 못했습니다.')
  }

  return {
    course: coursePayload.course as Course,
    materials: (materialsPayload.materials ?? []) as Material[],
  }
}

export default function CourseMaterialsPage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)
  const [course, setCourse] = useState<Course | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [createForm, setCreateForm] = useState<MaterialForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<MaterialForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshPage() {
    const data = await fetchMaterialsPageData(courseId)
    setCourse(data.course)
    setMaterials(data.materials)
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }

    fetchMaterialsPageData(courseId)
      .then((data) => {
        setCourse(data.course)
        setMaterials(data.materials)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '자료 페이지를 열지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId])

  const summary = useMemo(() => {
    const active = materials.filter((material) => material.is_active).length
    return {
      total: materials.length,
      active,
      inactive: materials.length - active,
    }
  }, [materials])

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
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      setError(payload?.error ?? '자료를 생성하지 못했습니다.')
      return
    }

    setCreateForm(EMPTY_FORM)
    setMaterials((current) =>
      [...current, payload.material as Material].sort((left, right) => left.sort_order - right.sort_order),
    )
    setMessage('자료를 생성했습니다.')
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
    setMaterials((current) =>
      current
        .map((entry) => (entry.id === updated.id ? updated : entry))
        .sort((left, right) => left.sort_order - right.sort_order),
    )
    setEditingId(null)
    setMessage('자료를 수정했습니다.')
  }

  async function handleDelete(material: Material) {
    const confirmed = window.confirm(`"${material.name}" 자료를 삭제할까요?`)
    if (!confirmed) {
      return
    }

    setError('')
    setMessage('')

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
    setMessage('자료를 삭제했습니다.')
  }

  if (loading) {
    return <p className="text-sm text-gray-500">자료 목록을 불러오는 중...</p>
  }

  if (!course) {
    return <p className="text-sm text-red-600">{error || '강좌를 찾지 못했습니다.'}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              자료 관리
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900">{course.name}</h2>
            <p className="mt-2 text-sm text-gray-500">
              현장 QR 배부에 사용할 교재·자료 목록을 관리합니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              강좌 설정
            </Link>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}/students`, tenant.type)}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              수강생
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: '전체 자료', value: summary.total },
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
            자료 추가
          </p>
          <h3 className="mt-3 text-2xl font-extrabold text-gray-900">새 자료 만들기</h3>

          <div className="mt-6 grid gap-4">
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="자료명"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
            />
            <textarea
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              placeholder="자료 설명"
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
                placeholder="정렬순서"
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
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 rounded-2xl px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--theme)' }}
          >
            {saving ? '저장 중...' : '자료 생성'}
          </button>
        </form>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-2xl font-extrabold text-gray-900">자료 목록</h3>
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
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                새로고침
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              {materials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-gray-500">
                  아직 등록된 자료가 없습니다.
                </div>
              ) : (
                materials.map((material) => (
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
                        </div>
                        {material.description ? (
                          <p className="mt-2 text-sm leading-6 text-gray-500">{material.description}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-gray-400">정렬순서 {material.sort_order}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(material)}
                          className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(material)}
                          className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
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

          {editingId ? (
            <form onSubmit={handleSaveEdit} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-extrabold text-gray-900">자료 수정</h3>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  닫기
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="자료명"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                />
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={4}
                  placeholder="자료 설명"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    type="number"
                    value={editForm.sort_order}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        sort_order: Number(event.target.value || 0),
                      }))
                    }
                    placeholder="정렬순서"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
                  />
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-gray-700">
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
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-5 rounded-2xl px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--theme)' }}
              >
                {saving ? '저장 중...' : '변경사항 저장'}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
