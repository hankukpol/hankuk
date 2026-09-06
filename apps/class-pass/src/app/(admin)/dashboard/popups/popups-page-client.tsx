'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import type { FormEvent } from 'react'
import { useEffect, useState, useRef } from 'react'
import { AdminDrawer } from '@/components/admin/AdminDrawer'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import type { PopupRow } from '@/lib/popups.shared'
import { formatDateTime } from '@/lib/utils'

type Popup = Omit<PopupRow, 'division'>

const POPUP_TYPES = [
  { value: 'notice', label: '공지사항' },
  { value: 'rule', label: '이용 규칙' },
  { value: 'refund', label: '환불 규정' },
  { value: 'guide', label: '안내문' },
  { value: 'custom', label: '기타' },
]

export default function PopupManagementPageClient({
  initialPopups,
  initialError = '',
  initialLoaded = true,
}: {
  initialPopups: Popup[]
  initialError?: string
  initialLoaded?: boolean
}) {
  const [popups, setPopups] = useState<Popup[]>(initialPopups)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)
  const [deleteTarget, setDeleteTarget] = useState<Popup | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

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
    if (initialLoaded) {
      return
    }

    fetch('/api/popups', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (response.ok) setPopups((payload?.popups ?? []) as Popup[])
      })
      .finally(() => setLoading(false))
  }, [initialLoaded])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setError(''); setMessage('')
      const response = await fetch('/api/popups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, title: newTitle, content: newContent, is_active: true }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) { setError(payload?.error ?? '팝업을 생성하지 못했습니다.'); return }
      setPopups((c) => [...c, payload.popup as Popup])
      setNewTitle(''); setNewContent(''); setMessage('팝업을 생성했습니다.'); setShowForm(false)
    } catch (reason) {
      setError(getUserErrorMessage(reason, '저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function startEdit(popup: Popup) {
    setEditingId(popup.id); setEditType(popup.type); setEditTitle(popup.title ?? '')
    setEditContent(popup.content ?? ''); setEditActive(popup.is_active); setError(''); setMessage('')
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingId) return
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setError(''); setMessage('')
      const response = await fetch('/api/popups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, type: editType, title: editTitle, content: editContent, is_active: editActive }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) { setError(payload?.error ?? '팝업을 수정하지 못했습니다.'); return }
      const updated = payload.popup as Popup
      setPopups((c) => c.map((p) => (p.id === updated.id ? updated : p)))
      setEditingId(null); setMessage('팝업을 수정했습니다.')
    } catch (reason) {
      setError(getUserErrorMessage(reason, '저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleDeleteConfirmed() {
    const popup = deleteTarget
    if (!popup) return
    setDeleteSubmitting(true)
    setError(''); setMessage('')
    const response = await fetch('/api/popups', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: popup.id }),
    })
    const payload = await response.json().catch(() => null)
    setDeleteSubmitting(false)
    if (!response.ok) { setError(payload?.error ?? '팝업을 삭제하지 못했습니다.'); return }
    setPopups((c) => c.filter((p) => p.id !== popup.id))
    if (editingId === popup.id) setEditingId(null)
    setDeleteTarget(null)
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

  if (loading) return <p className="py-12 text-center text-sm text-[#86868b]">불러오는 중...</p>

  return (
    <>
    <ConfirmationModal
      open={Boolean(deleteTarget)}
      title="팝업을 삭제할까요?"
      description={deleteTarget ? `"${deleteTarget.title || deleteTarget.type}" 팝업은 삭제 후 복구할 수 없습니다.` : undefined}
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
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="admin-page-title">팝업 관리</h2>
          <p className="mt-1 text-sm text-[#86868b]">{popups.length}개 등록</p>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setMessage(''); setShowForm(true) }}
          className="admin-button admin-button-primary"
        >
          + 새 팝업
        </button>
      </div>

      {/* ── Create drawer ── */}
      <AdminDrawer open={showForm} title="새 팝업 만들기" closeDisabled={saving}
        onClose={() => { if (!saving) setShowForm(false) }} onSubmit={handleCreate}
        footer={<>
          <button type="button" className="admin-button" disabled={saving} onClick={() => setShowForm(false)}>취소</button>
          <button type="submit" className="admin-button admin-button-primary" disabled={saving}>{saving ? '생성 중...' : '팝업 생성'}</button>
        </>}>
        <fieldset disabled={saving} className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="admin-material-field"><span className="admin-material-label">팝업 유형</span><select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
            >
              {POPUP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select></label>
            <label className="admin-material-field"><span className="admin-material-label">제목</span><input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="제목"
              className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
            /></label>
          </div>
          <label className="admin-material-field mt-4"><span className="admin-material-label">내용</span><textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            placeholder="내용을 입력하세요..."
            className="w-full rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
          /></label>
        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm text-red-600">{getUserErrorMessage(error)}</p> : null}
      </AdminDrawer>

      {/* ── Edit drawer ── */}
      <AdminDrawer open={editingId !== null} title="팝업 편집" closeDisabled={saving}
        onClose={() => { if (!saving) setEditingId(null) }} onSubmit={handleSaveEdit}
        footer={<>
          <button type="button" className="admin-button" disabled={saving} onClick={() => setEditingId(null)}>취소</button>
          <button type="submit" className="admin-button admin-button-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
        </>}>
        <fieldset disabled={saving} className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="admin-material-field"><span className="admin-material-label">팝업 유형</span><select
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              className="rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
            >
              {POPUP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select></label>
            <label className="admin-material-field"><span className="admin-material-label">제목</span><input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="제목"
              className="rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
            /></label>
          </div>
          <label className="admin-material-field mt-4"><span className="admin-material-label">내용</span><textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            placeholder="내용"
            className="w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
          /></label>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#1d1d1f]">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="rounded" />
              활성 상태
            </label>
          </div>
        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm text-red-600">{getUserErrorMessage(error)}</p> : null}
      </AdminDrawer>

      {!showForm && !editingId && (error || message) && (
        <div>
          {error && <p className="text-xs text-red-500">{getUserErrorMessage(error)}</p>}
          {message && <p className="text-xs text-[#1b7a1b]">{message}</p>}
        </div>
      )}

      {/* ── Popup table ── */}
      <section className="admin-table-frame overflow-hidden bg-white">
        {popups.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#86868b]">등록된 팝업이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f5f5f7] text-left text-xs font-medium text-[#86868b]">
                  <th className="px-5 py-3">유형</th>
                  <th className="px-3 py-3">제목</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="hidden px-3 py-3 md:table-cell">수정일</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f7]">
                {popups.map((popup) => (
                  <tr key={popup.id} className="hover:bg-[#f5f5f7]/60">
                    <td className="px-5 py-3.5">
                      <span className="inline-block rounded-[4px] bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        {typeLabel(popup.type)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-semibold text-[#1d1d1f]">{popup.title || '(제목 없음)'}</p>
                      {popup.content && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-[#86868b]">{popup.content}</p>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-block rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                        popup.is_active ? 'bg-[#f5f5f7] text-[#1b7a1b]' : 'bg-[#f5f5f7] text-[#86868b]'
                      }`}>
                        {popup.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3.5 text-[#86868b] md:table-cell">
                      {formatDateTime(popup.updated_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(popup)}
                          className="rounded-[8px] bg-[#f5f5f7] px-2.5 py-1.5 text-[11px] font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed]"
                        >
                          {popup.is_active ? '비활성화' : '활성화'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(popup)}
                          className="rounded-[8px] bg-[#f5f5f7] px-2.5 py-1.5 text-[11px] font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed]"
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(popup)}
                          className="rounded-[8px] bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#ff3b30] hover:bg-red-100"
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
    </>
  )
}
