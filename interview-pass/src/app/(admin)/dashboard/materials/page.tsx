'use client'

import { useEffect, useState } from 'react'
import type { Material } from '@/types/database'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import { useAppConfig } from '@/hooks/use-app-config'

export default function MaterialsPage() {
  const { config, isLoading: isFeatureLoading } = useAppConfig()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', is_active: true, sort_order: 0 })
  const [editTarget, setEditTarget] = useState<Material | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', sort_order: 0 })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/materials?all=1')
    const data = await res.json()
    setMaterials(data.materials ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!isFeatureLoading && config.admin_materials_enabled) {
      void load()
    }
  }, [config.admin_materials_enabled, isFeatureLoading])

  async function toggleActive(material: Material) {
    await fetch(`/api/materials/${material.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !material.is_active }),
    })
    void load()
  }

  async function handleAdd() {
    if (saving) return
    setSaving(true)
    const res = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setForm({ name: '', description: '', is_active: true, sort_order: 0 })
      void load()
    } else {
      const data = await res.json()
      alert(data.error ?? '자료 추가에 실패했습니다.')
    }
  }

  function openEdit(material: Material) {
    setEditTarget(material)
    setEditForm({
      name: material.name,
      description: material.description ?? '',
      sort_order: material.sort_order,
    })
  }

  async function handleEdit() {
    if (!editTarget || saving) return
    setSaving(true)
    const res = await fetch(`/api/materials/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    if (res.ok) {
      setEditTarget(null)
      void load()
    } else {
      const data = await res.json()
      alert(data.error ?? '자료 수정에 실패했습니다.')
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setConfirmDeleteId(null)
      void load()
    } else {
      setConfirmDeleteId(null)
      alert('자료 삭제에 실패했습니다.')
    }
  }

  if (isFeatureLoading) {
    return <div className="py-16 text-center text-sm text-gray-500">기능 설정을 확인하는 중입니다...</div>
  }

  if (!config.admin_materials_enabled) {
    return (
      <FeatureDisabledPanel
        title="자료 설정 기능이 꺼져 있습니다."
        description="이 지점에서는 관리자 자료 생성, 수정, 정렬, 활성화/비활성화 설정이 비활성화되어 있습니다. 설정 허브에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">자료 설정</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--theme)' }}
        >
          + 자료 추가
        </button>
      </div>

      <div className="overflow-hidden border border-gray-200 bg-white">
        {loading ? (
          <div className="py-10 text-center text-gray-400">로딩 중...</div>
        ) : materials.length === 0 ? (
          <div className="py-10 text-center text-gray-400">등록된 자료가 없습니다.</div>
        ) : (
          <ul>
            {materials.map((material, index) => (
              <li
                key={material.id}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 ${
                  index > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <span className="w-5 shrink-0 text-xs text-gray-400">{material.sort_order}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{material.name}</p>
                  {material.description ? (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{material.description}</p>
                  ) : null}
                </div>
                <button
                  onClick={() => void toggleActive(material)}
                  className={`shrink-0 border px-3 py-1.5 text-xs font-medium transition-colors ${
                    material.is_active
                      ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                      : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {material.is_active ? '활성' : '비활성'}
                </button>
                <button
                  onClick={() => openEdit(material)}
                  className="shrink-0 text-xs text-blue-500 hover:text-blue-700"
                >
                  수정
                </button>
                {confirmDeleteId === material.id ? (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleDelete(material.id)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      확인
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      취소
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(material.id)}
                    className="shrink-0 text-xs text-red-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-400">* 활성/비활성 버튼을 클릭하면 즉시 변경됩니다.</p>

      {editTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="w-full max-w-sm border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">자료 수정</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">자료명</label>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">설명</label>
                <input
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">정렬 순서</label>
                <input
                  type="number"
                  value={editForm.sort_order}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))
                  }
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditTarget(null)}
                disabled={saving}
                className="flex-1 border border-gray-300 py-2.5 text-sm text-gray-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => void handleEdit()}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--theme)' }}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-sm border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">자료 추가</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">자료명</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">설명</label>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">정렬 순서</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))
                  }
                  className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="flex-1 border border-gray-300 py-2.5 text-sm text-gray-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--theme)' }}
              >
                {saving ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
