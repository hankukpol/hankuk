'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { formatDateTime } from '@/lib/utils'

type Popup = {
  id: number
  type: string
  title: string | null
  content: string | null
  is_active: boolean
  updated_at: string | null
}

const POPUP_TYPES = [
  { value: 'notice', label: '공지사항' },
  { value: 'rule', label: '이용 규칙' },
  { value: 'refund', label: '환불 규정' },
  { value: 'guide', label: '안내문' },
  { value: 'custom', label: '기타' },
]

export default function PopupManagementPage() {
  const [popups, setPopups] = useState<Popup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Create form
  const [newType, setNewType] = useState('notice')
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editType, setEditType] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editActive, setEditActive] = useState(true)

  useEffect(() => {
    fetch('/api/popups', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (response.ok) setPopups((payload?.popups ?? []) as Popup[])
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const response = await fetch('/api/popups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newType, title: newTitle, content: newContent, is_active: true }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) { setError(payload?.error ?? '팝업을 생성하지 못했습니다.'); return }
    setPopups((c) => [...c, payload.popup as Popup])
    setNewTitle(''); setNewContent(''); setMessage('팝업을 생성했습니다.'); setShowForm(false)
  }

  function startEdit(popup: Popup) {
    setEditingId(popup.id); setEditType(popup.type); setEditTitle(popup.title ?? '')
    setEditContent(popup.content ?? ''); setEditActive(popup.is_active); setError(''); setMessage('')
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingId) return
    setSaving(true); setError(''); setMessage('')
    const response = await fetch('/api/popups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, type: editType, title: editTitle, content: editContent, is_active: editActive }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) { setError(payload?.error ?? '팝업을 수정하지 못했습니다.'); return }
    const updated = payload.popup as Popup
    setPopups((c) => c.map((p) => (p.id === updated.id ? updated : p)))
    setEditingId(null); setMessage('팝업을 수정했습니다.')
  }

  async function handleDelete(popup: Popup) {
    if (!window.confirm(`"${popup.title || popup.type}" 팝업을 삭제할까요?`)) return
    setError(''); setMessage('')
    const response = await fetch('/api/popups', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: popup.id }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { setError(payload?.error ?? '팝업을 삭제하지 못했습니다.'); return }
    setPopups((c) => c.filter((p) => p.id !== popup.id))
    if (editingId === popup.id) setEditingId(null)
    setMessage('팝업을 삭제했습니다.')
  }

  async function handleToggleActive(popup: Popup) {
    const response = await fetch('/api/popups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: popup.id, is_active: !popup.is_active }),
    })
    const payload = await response.json().catch(() => null)
    if (response.ok) {
      const updated = payload.popup as Popup
      setPopups((c) => c.map((p) => (p.id === updated.id ? updated : p)))
    }
  }

  function typeLabel(type: string) {
    return POPUP_TYPES.find((t) => t.value === type)?.label ?? type
  }

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">팝업 관리</h2>
          <p className="mt-1 text-sm text-gray-400">{popups.length}개 등록</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          {showForm ? '닫기' : '+ 새 팝업'}
        </button>
      </div>

      {/* ── Create form (collapsible) ── */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">새 팝업 만들기</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              {POPUP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="제목"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            placeholder="내용을 입력하세요..."
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {saving ? '생성 중...' : '팝업 생성'}
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {message && <span className="text-xs text-emerald-600">{message}</span>}
          </div>
        </form>
      )}

      {/* ── Edit form (inline) ── */}
      {editingId && (
        <form onSubmit={handleSaveEdit} className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">팝업 편집</h3>
            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">닫기</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              {POPUP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="제목"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            placeholder="내용"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="rounded" />
              활성 상태
            </label>
          </div>
          <div className="mt-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      )}

      {!showForm && !editingId && (error || message) && (
        <div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </div>
      )}

      {/* ── Popup table ── */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {popups.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">등록된 팝업이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                  <th className="px-5 py-3">유형</th>
                  <th className="px-3 py-3">제목</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="hidden px-3 py-3 md:table-cell">수정일</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {popups.map((popup) => (
                  <tr key={popup.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        {typeLabel(popup.type)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-semibold text-gray-900">{popup.title || '(제목 없음)'}</p>
                      {popup.content && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">{popup.content}</p>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        popup.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {popup.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3.5 text-gray-400 md:table-cell">
                      {formatDateTime(popup.updated_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(popup)}
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          {popup.is_active ? '비활성화' : '활성화'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(popup)}
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(popup)}
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
      </section>
    </div>
  )
}
