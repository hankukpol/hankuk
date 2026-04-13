'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { formatDateTime } from '@/lib/utils'

type StaffAccount = { id: string; name: string; created_at: string }

export default function StaffAccountsPage() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPin, setEditPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/staff-accounts', { cache: 'no-store' })
      .then(async (r) => { const p = await r.json().catch(() => null); if (r.ok) setAccounts((p?.accounts ?? []) as StaffAccount[]) })
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('')
    const r = await fetch('/api/staff-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin }) })
    const p = await r.json().catch(() => null); setSaving(false)
    if (!r.ok) { setError(p?.error ?? '생성 실패'); return }
    setAccounts((c) => [...c, p.account as StaffAccount]); setName(''); setPin(''); setMessage('직원 등록 완료'); setShowForm(false)
  }

  function startEdit(a: StaffAccount) { setEditingId(a.id); setEditName(a.name); setEditPin(''); setError(''); setMessage('') }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault(); if (!editingId) return; setSaving(true); setError(''); setMessage('')
    const r = await fetch('/api/staff-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, name: editName || undefined, pin: editPin || undefined }) })
    const p = await r.json().catch(() => null); setSaving(false)
    if (!r.ok) { setError(p?.error ?? '수정 실패'); return }
    const u = p.account as StaffAccount; setAccounts((c) => c.map((x) => (x.id === u.id ? u : x))); setEditingId(null); setMessage('수정 완료')
  }

  async function handleDelete(a: StaffAccount) {
    if (!window.confirm(`"${a.name}" 삭제?`)) return; setError(''); setMessage('')
    const r = await fetch('/api/staff-accounts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    const p = await r.json().catch(() => null)
    if (!r.ok) { setError(p?.error ?? '삭제 실패'); return }
    setAccounts((c) => c.filter((x) => x.id !== a.id)); if (editingId === a.id) setEditingId(null); setMessage('삭제 완료')
  }

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">직원 관리</h2>
          <p className="mt-1 text-sm text-gray-400">{accounts.length}명 등록</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          {showForm ? '닫기' : '+ 직원 등록'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">새 직원 등록</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="직원 이름" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN (최소 4자리)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? '등록 중...' : '등록'}</button>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {message && <span className="text-xs text-emerald-600">{message}</span>}
          </div>
        </form>
      )}

      {editingId && (
        <form onSubmit={handleSaveEdit} className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">직원 편집</h3>
            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">닫기</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="직원 이름" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
            <input type="password" value={editPin} onChange={(e) => setEditPin(e.target.value)} placeholder="새 PIN (변경 시에만)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="mt-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      )}

      {!showForm && !editingId && (error || message) && (
        <div>{error && <p className="text-xs text-red-500">{error}</p>}{message && <p className="text-xs text-emerald-600">{message}</p>}</div>
      )}

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {accounts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">등록된 직원이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                <th className="px-5 py-3">이름</th>
                <th className="px-3 py-3">등록일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-semibold text-gray-900">{a.name}</td>
                  <td className="px-3 py-3.5 text-gray-400">{formatDateTime(a.created_at)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => startEdit(a)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">편집</button>
                      <button type="button" onClick={() => void handleDelete(a)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
