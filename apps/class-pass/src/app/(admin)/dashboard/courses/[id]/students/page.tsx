'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, Enrollment, EnrollmentFieldDef, Material } from '@/types/database'
import { formatDateTime } from '@/lib/utils'
import { withTenantPrefix } from '@/lib/tenant'

type TabMode = 'manage' | 'receipts'
type Panel = 'none' | 'create' | 'bulk' | 'edit'

type ReceiptRow = { enrollment: Enrollment; receipts: Record<number, { distributed_at: string; logId: number }> }

type EnrollmentForm = {
  name: string
  phone: string
  exam_number: string
  birth_date: string
  custom_data: Record<string, string>
}

function emptyForm(): EnrollmentForm {
  return { name: '', phone: '', exam_number: '', birth_date: '', custom_data: {} }
}

function toEditForm(enrollment: Enrollment): EnrollmentForm {
  return {
    name: enrollment.name,
    phone: enrollment.phone,
    exam_number: enrollment.exam_number ?? '',
    birth_date: enrollment.student_profile?.birth_date ?? '',
    custom_data: enrollment.custom_data ?? {},
  }
}

type PinRevealState = {
  title: string
  pins: Array<{ name: string; phone: string; pin: string }>
}

function DynamicFieldInput({
  field, value, onChange,
}: {
  field: EnrollmentFieldDef; value: string; onChange: (val: string) => void
}) {
  if (field.type === 'select' && field.options?.length) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      >
        <option value="">{field.label} 선택</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label}
      className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
    />
  )
}

async function fetchStudentsPageData(courseId: number) {
  const [courseRes, enrollRes] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?courseId=${courseId}`, { cache: 'no-store' }),
  ])
  const coursePay = await courseRes.json().catch(() => null)
  const enrollPay = await enrollRes.json().catch(() => null)
  if (!courseRes.ok) throw new Error(coursePay?.error ?? '강좌 정보를 불러오지 못했습니다.')
  if (!enrollRes.ok) throw new Error(enrollPay?.error ?? '수강생 목록을 불러오지 못했습니다.')
  return {
    course: coursePay.course as Course,
    enrollments: (enrollPay.enrollments ?? []) as Enrollment[],
  }
}

export default function CourseStudentsPage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [tab, setTab] = useState<TabMode>('manage')
  const [panel, setPanel] = useState<Panel>('none')
  const [course, setCourse] = useState<Course | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'refunded'>('all')

  // Receipt tab
  const [materials, setMaterials] = useState<Material[]>([])
  const [receiptData, setReceiptData] = useState<ReceiptRow[]>([])
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [bulkDistributing, setBulkDistributing] = useState(false)

  // Forms
  const [createForm, setCreateForm] = useState<EnrollmentForm>(emptyForm())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EnrollmentForm>(emptyForm())
  const [bulkText, setBulkText] = useState('')
  const [pinReveal, setPinReveal] = useState<PinRevealState | null>(null)

  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function copyPin(pin: string) {
    try {
      await navigator.clipboard.writeText(pin)
      setMessage(`PIN ${pin}을 복사했습니다.`)
    } catch {
      setError('PIN을 복사하지 못했습니다.')
    }
  }

  const refresh = useCallback(async () => {
    const data = await fetchStudentsPageData(courseId)
    setCourse(data.course)
    setEnrollments(data.enrollments)
  }, [courseId])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID')
      setLoading(false)
      return
    }
    refresh()
      .catch((r: unknown) => setError(r instanceof Error ? r.message : '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [courseId, refresh])

  // Filter + search
  const filtered = useMemo(() => {
    let list = enrollments
    if (statusFilter !== 'all') list = list.filter((e) => e.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.phone.includes(q) ||
          (e.exam_number ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [enrollments, statusFilter, search])

  const summary = useMemo(() => {
    const active = enrollments.filter((e) => e.status === 'active').length
    return { total: enrollments.length, active, refunded: enrollments.length - active }
  }, [enrollments])

  // Receipt tab
  const [receiptSearch, setReceiptSearch] = useState('')
  const [filterMatId, setFilterMatId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })

  async function loadReceipts() {
    setReceiptLoading(true)
    try {
      const res = await fetch(`/api/distribution/receipt-matrix?courseId=${courseId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('API 응답 오류')
      const payload = await res.json()
      const mats = (payload.materials ?? []) as Material[]
      setMaterials(mats)
      type L = { id: number; enrollment_id: number; material_id: number; distributed_at: string }
      const logs = (payload.logs ?? []) as L[]
      const map = new Map<number, Record<number, { distributed_at: string; logId: number }>>()
      for (const l of logs) {
        if (!map.has(l.enrollment_id)) map.set(l.enrollment_id, {})
        const m = map.get(l.enrollment_id)!
        if (!m[l.material_id]) m[l.material_id] = { distributed_at: l.distributed_at, logId: l.id }
      }
      setReceiptData(
        enrollments
          .filter((e) => e.status === 'active')
          .map((e) => ({ enrollment: e, receipts: map.get(e.id) ?? {} })),
      )
    } catch { setError('수령 현황 불러오기 실패') }
    finally { setReceiptLoading(false) }
  }

  useEffect(() => {
    if (tab === 'receipts' && enrollments.length > 0) void loadReceipts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, enrollments.length])

  const filteredReceipts = useMemo(() => {
    let list = receiptData
    if (receiptSearch.trim()) {
      const q = receiptSearch.trim().toLowerCase()
      list = list.filter((row) =>
        row.enrollment.name.toLowerCase().includes(q) ||
        row.enrollment.phone.includes(q) ||
        (row.enrollment.exam_number ?? '').toLowerCase().includes(q),
      )
    }
    if (filterMatId !== null) {
      list = list.filter((row) => !row.receipts[filterMatId])
    }
    return list
  }, [receiptData, receiptSearch, filterMatId])

  async function handleDistribute(enrollmentId: number, materialId: number) {
    setBulkDistributing(true)
    setError(''); setMessage('')
    const r = await fetch('/api/distribution/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, materialId }),
    })
    const p = await r.json().catch(() => null)
    setBulkDistributing(false)
    if (!r.ok) { setError(p?.error ?? '배부 실패'); return }
    setMessage(`${p?.student_name ?? '수강생'} — ${p?.material_name ?? '자료'} 배부 완료`)
    await loadReceipts()
  }

  async function handleUndo(logId: number, studentName: string, materialName: string) {
    if (!window.confirm(`"${studentName}"의 "${materialName}" 수령 기록을 취소할까요?`)) return
    setBulkDistributing(true)
    setError(''); setMessage('')
    const r = await fetch('/api/distribution/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    setBulkDistributing(false)
    if (!r.ok) { setError('수령 취소 실패'); return }
    setMessage(`${studentName} — ${materialName} 수령 취소 완료`)
    await loadReceipts()
  }

  async function handleBulkDistributeSelected() {
    if (filterMatId === null || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkDistributing(true)
    setBulkProgress({ done: 0, total: ids.length })
    setError(''); setMessage('')
    let successCount = 0

    // Process in chunks of 5 to avoid overwhelming the server
    const CHUNK_SIZE = 5
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE)
      const results = await Promise.allSettled(
        chunk.map(async (enrollmentId) => {
          const r = await fetch('/api/distribution/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enrollmentId, materialId: filterMatId }),
          })
          setBulkProgress((p) => ({ ...p, done: p.done + 1 }))
          if (r.ok) successCount++
          return r
        }),
      )
      // Stop early if all requests in chunk failed
      if (chunk.length > 1 && results.every((r) => r.status === 'rejected')) break
    }

    setBulkDistributing(false)
    setSelectedIds(new Set())
    const failCount = ids.length - successCount
    setMessage(`일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
    await loadReceipts()
  }

  // CRUD
  async function handleCreate(ev: FormEvent) {
    ev.preventDefault()
    setSubmitting(true); setError(''); setMessage('')
    const r = await fetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, ...createForm }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '등록 실패'); return }
    setCreateForm(emptyForm())
    setEnrollments((c) => [p.enrollment as Enrollment, ...c])
    if (p?.generated_pin) {
      setPinReveal({
        title: '신규 학생 PIN',
        pins: [{
          name: (p.enrollment as Enrollment).name,
          phone: (p.enrollment as Enrollment).phone,
          pin: p.generated_pin as string,
        }],
      })
    }
    setMessage('수강생을 등록했습니다.')
    setPanel('none')
  }

  async function handleBulkImport(ev: FormEvent) {
    ev.preventDefault()
    if (!bulkText.trim()) { setError('명단을 입력하세요.'); return }
    setSubmitting(true); setError(''); setMessage('')
    const r = await fetch('/api/enrollments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, text: bulkText }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '반영 실패'); return }
    setBulkText('')
    if (Array.isArray(p?.generated_pins) && p.generated_pins.length > 0) {
      setPinReveal({
        title: '일괄 생성된 학생 PIN',
        pins: p.generated_pins as Array<{ name: string; phone: string; pin: string }>,
      })
    }
    setMessage(`${p?.count ?? 0}건 반영`)
    setPanel('none')
    await refresh().catch(() => {})
  }

  function startEdit(e: Enrollment) {
    setEditingId(e.id)
    setEditForm(toEditForm(e))
    setEditPhotoUrl(e.photo_url ?? null)
    setPanel('edit')
    setError(''); setMessage('')
  }

  async function handlePhotoUpload(file: File) {
    if (!editingId) return
    setPhotoUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('photo', file)
    const r = await fetch(`/api/enrollments/${editingId}/photo`, { method: 'POST', body: formData })
    const p = await r.json().catch(() => null)
    setPhotoUploading(false)
    if (!r.ok) { setError(p?.error ?? '사진 업로드 실패'); return }
    setEditPhotoUrl(p.photo_url)
    setEnrollments((c) => c.map((x) => x.id === editingId ? { ...x, photo_url: p.photo_url } : x))
    setMessage('사진을 업로드했습니다.')
  }

  async function handlePhotoDelete() {
    if (!editingId) return
    setPhotoUploading(true)
    await fetch(`/api/enrollments/${editingId}/photo`, { method: 'DELETE' })
    setPhotoUploading(false)
    setEditPhotoUrl(null)
    setEnrollments((c) => c.map((x) => x.id === editingId ? { ...x, photo_url: null } : x))
    setMessage('사진을 삭제했습니다.')
  }

  async function handleSaveEdit(ev: FormEvent) {
    ev.preventDefault()
    if (!editingId) return
    setSubmitting(true); setError(''); setMessage('')
    const r = await fetch(`/api/enrollments/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '저장 실패'); return }
    const next = p.enrollment as Enrollment
    setEnrollments((c) => c.map((x) => (x.id === next.id ? next : x)))
    setPanel('none'); setEditingId(null)
    setMessage('수강생 정보를 저장했습니다.')
  }

  async function handleRefund(e: Enrollment) {
    if (!window.confirm(`"${e.name}" 환불 처리할까요?`)) return
    const r = await fetch(`/api/enrollments/${e.id}/refund`, { method: 'POST' })
    const p = await r.json().catch(() => null)
    if (!r.ok) { setError(p?.error ?? '환불 실패'); return }
    setEnrollments((c) => c.map((x) => (x.id === (p.enrollment as Enrollment).id ? p.enrollment as Enrollment : x)))
    setMessage('환불 처리 완료')
  }

  async function handleDelete(e: Enrollment) {
    if (!window.confirm(`"${e.name}" 삭제할까요?`)) return
    const r = await fetch(`/api/enrollments/${e.id}`, { method: 'DELETE' })
    if (!r.ok) { setError('삭제 실패'); return }
    setEnrollments((c) => c.filter((x) => x.id !== e.id))
    if (editingId === e.id) { setPanel('none'); setEditingId(null) }
    setMessage('삭제 완료')
  }

  async function handleResetPin(enrollment: Enrollment) {
    if (!enrollment.student_id) {
      setError('학생 프로필을 찾을 수 없습니다.')
      return
    }

    if (!window.confirm(`${enrollment.name} 학생의 로그인 PIN을 새로 발급할까요?`)) {
      return
    }

    setSubmitting(true); setError(''); setMessage('')
    const r = await fetch('/api/students/reset-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: enrollment.student_id }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)

    if (!r.ok) {
      setError(p?.error ?? 'PIN 재발급에 실패했습니다.')
      return
    }

    setPinReveal({
      title: '재발급된 학생 PIN',
      pins: [{
        name: enrollment.name,
        phone: enrollment.phone,
        pin: p.pin as string,
      }],
    })
    setMessage('학생 PIN을 재발급했습니다.')
  }

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
  if (!course) return <p className="py-12 text-center text-sm text-red-500">{error || '강좌를 찾을 수 없습니다.'}</p>

  const customFields = course.enrollment_fields ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
            className="text-xs font-medium text-gray-400 hover:underline"
          >
            ← {course.name}
          </Link>
          <h2 className="mt-1 text-xl font-extrabold text-gray-900">수강생 관리</h2>
          <p className="mt-1 text-sm text-gray-400">
            전체 {summary.total} · 활성 {summary.active} · 환불 {summary.refunded}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            + 수강생 등록
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === 'bulk' ? 'none' : 'bulk')}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            명단 붙여넣기
          </button>
          {course.feature_photo && (
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}/students/photos`, tenant.type)}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              사진 일괄 업로드
            </Link>
          )}
        </div>
      </div>

      {/* ── Collapsible panels ── */}
      {panel === 'create' && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">개별 수강생 등록</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input value={createForm.exam_number} onChange={(e) => setCreateForm((c) => ({ ...c, exam_number: e.target.value }))} placeholder="학번" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={createForm.name} onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} placeholder="이름" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={createForm.phone} onChange={(e) => setCreateForm((c) => ({ ...c, phone: e.target.value }))} placeholder="연락처" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={createForm.birth_date} onChange={(e) => setCreateForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="생년월일(YYMMDD, 선택)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            {customFields.map((f) => (
              <DynamicFieldInput key={f.key} field={f} value={createForm.custom_data[f.key] ?? ''} onChange={(v) => setCreateForm((c) => ({ ...c, custom_data: { ...c.custom_data, [f.key]: v } }))} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? '등록 중...' : '등록'}</button>
            <button type="button" onClick={() => setPanel('none')} className="text-xs text-gray-400 hover:underline">취소</button>
          </div>
        </form>
      )}

      {panel === 'bulk' && (
        <form onSubmit={handleBulkImport} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">명단 붙여넣기</h3>
          <p className="mt-1 text-xs text-gray-400">
            탭 구분 · 순서: <span className="font-semibold text-gray-600">학번, 이름, 연락처, 생년월일(선택){customFields.map((f) => `, ${f.label}`).join('')}</span>
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={`A-001\t홍길동\t01012345678\t990315\nA-002\t김소방\t01087654321`}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-slate-400"
          />
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? '반영 중...' : '일괄 반영'}</button>
            <button type="button" onClick={() => setPanel('none')} className="text-xs text-gray-400 hover:underline">취소</button>
          </div>
        </form>
      )}

      {panel === 'edit' && editingId && (
        <form onSubmit={handleSaveEdit} className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">수강생 편집</h3>
            <button type="button" onClick={() => { setPanel('none'); setEditingId(null) }} className="text-xs text-gray-400 hover:underline">닫기</button>
          </div>

          {course.feature_photo && (
            <div className="mt-3 flex items-center gap-4">
              <div className="h-[80px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {editPhotoUrl ? (
                  <img src={editPhotoUrl} alt="증명사진" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-gray-300">사진 없음</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                  {photoUploading ? '업로드 중...' : '사진 업로드'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); e.target.value = '' }}
                  />
                </label>
                {editPhotoUrl && (
                  <button type="button" onClick={() => void handlePhotoDelete()} disabled={photoUploading} className="text-left text-[10px] text-red-400 hover:underline">
                    사진 삭제
                  </button>
                )}
                <p className="text-[10px] text-gray-400">JPEG/PNG/WebP · 2MB 이하</p>
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input value={editForm.exam_number} onChange={(e) => setEditForm((c) => ({ ...c, exam_number: e.target.value }))} placeholder="학번" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.name} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} placeholder="이름" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} placeholder="연락처" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.birth_date} onChange={(e) => setEditForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="생년월일(YYMMDD)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            {customFields.map((f) => (
              <DynamicFieldInput key={f.key} field={f} value={editForm.custom_data[f.key] ?? ''} onChange={(v) => setEditForm((c) => ({ ...c, custom_data: { ...c.custom_data, [f.key]: v } }))} />
            ))}
          </div>
          <div className="mt-3">
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      )}

      {/* Messages */}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}
      {pinReveal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5" onClick={() => setPinReveal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">{pinReveal.title}</h3>
              <button type="button" onClick={() => setPinReveal(null)} className="text-sm text-gray-400 hover:text-gray-700">
                닫기
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">PIN은 지금 한 번만 표시됩니다. 필요한 경우 바로 복사해 주세요.</p>
            <div className="mt-4 flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
              {pinReveal.pins.map((entry) => (
                <div key={`${entry.name}-${entry.phone}-${entry.pin}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{entry.phone}</p>
                    </div>
                    <button type="button" onClick={() => void copyPin(entry.pin)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">
                      복사
                    </button>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-black tracking-[0.2em] text-slate-900">{entry.pin}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Tab toggle ── */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <button type="button" onClick={() => setTab('manage')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'manage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>수강생 목록</button>
        <button type="button" onClick={() => setTab('receipts')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'receipts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>수령 현황</button>
      </div>

      {/* ── Manage tab ── */}
      {tab === 'manage' && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {/* Search + filter bar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 연락처, 학번 검색..."
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-64"
            />
            <div className="flex gap-1">
              {(['all', 'active', 'refunded'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                    statusFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? '전체' : f === 'active' ? '활성' : '환불'}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">
              {search ? '검색 결과 없음' : '등록된 수강생이 없습니다.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                    <th className="px-5 py-3">학번</th>
                    <th className="px-3 py-3">이름</th>
                    <th className="px-3 py-3">연락처</th>
                    {customFields.map((f) => (
                      <th key={f.key} className="hidden px-3 py-3 lg:table-cell">{f.label}</th>
                    ))}
                    <th className="px-3 py-3">상태</th>
                    <th className="hidden px-3 py-3 md:table-cell">등록일</th>
                    <th className="px-5 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-gray-500">{e.exam_number || '-'}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">
                        <div className="flex flex-col gap-1">
                          <span>{e.name}</span>
                          <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            e.student_profile?.auth_method === 'birth_date'
                              ? 'bg-blue-50 text-blue-700'
                              : e.student_profile?.auth_method === 'pin'
                                ? 'bg-violet-50 text-violet-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {e.student_profile?.auth_method === 'birth_date'
                              ? '생년월일 인증'
                              : e.student_profile?.auth_method === 'pin'
                                ? 'PIN 인증'
                                : '인증 미설정'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{e.phone}</td>
                      {customFields.map((f) => (
                        <td key={f.key} className="hidden px-3 py-3 text-gray-500 lg:table-cell">
                          {(e.custom_data ?? {})[f.key] || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          e.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {e.status === 'active' ? '활성' : '환불'}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-xs text-gray-400 md:table-cell">
                        {formatDateTime(e.created_at).split(' ')[0]}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => startEdit(e)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">편집</button>
                          {e.student_profile?.auth_method === 'pin' && e.student_id ? (
                            <button type="button" onClick={() => void handleResetPin(e)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100">
                              PIN 재설정
                            </button>
                          ) : null}
                          {e.status === 'active' && (
                            <button type="button" onClick={() => void handleRefund(e)} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">환불</button>
                          )}
                          <button type="button" onClick={() => void handleDelete(e)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Receipt tab ── */}
      {tab === 'receipts' && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold text-gray-700">교재(자료) 수령 현황</h3>
            <input
              type="text"
              value={receiptSearch}
              onChange={(e) => setReceiptSearch(e.target.value)}
              placeholder="이름, 전화번호, 수험번호 검색"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-56"
            />
          </div>

          {/* Material filter banner */}
          {filterMatId !== null && (
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-2.5">
              <span className="text-xs font-semibold text-blue-700">
                &lsquo;{materials.find((m) => m.id === filterMatId)?.name}&rsquo; 미수령 학생 {filteredReceipts.length}명
              </span>
              <button
                type="button"
                onClick={() => { setFilterMatId(null); setSelectedIds(new Set()) }}
                className="rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-200"
              >
                필터 해제
              </button>
            </div>
          )}

          {receiptLoading ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">불러오는 중...</p>
          ) : materials.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">활성 자료 없음</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                    {filterMatId !== null && (
                      <th className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={filteredReceipts.length > 0 && selectedIds.size === filteredReceipts.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(new Set(filteredReceipts.map((r) => r.enrollment.id)))
                            else setSelectedIds(new Set())
                          }}
                          className="h-3.5 w-3.5 rounded"
                        />
                      </th>
                    )}
                    <th className="sticky left-0 bg-white px-5 py-3">수강생</th>
                    {materials.map((m) => (
                      <th
                        key={m.id}
                        className={`cursor-pointer select-none px-3 py-3 text-center whitespace-nowrap hover:text-gray-700 ${filterMatId === m.id ? 'bg-blue-50 text-blue-700' : ''}`}
                        onClick={() => {
                          setFilterMatId((prev) => (prev === m.id ? null : m.id))
                          setSelectedIds(new Set())
                        }}
                      >
                        {m.name} {filterMatId === m.id ? '▼' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={materials.length + 1 + (filterMatId !== null ? 1 : 0)} className="px-5 py-8 text-center text-gray-400">
                        {receiptSearch.trim() || filterMatId !== null ? '검색 결과 없음' : '데이터 없음'}
                      </td>
                    </tr>
                  ) : filteredReceipts.map((row) => (
                    <tr key={row.enrollment.id} className="hover:bg-slate-50/60">
                      {filterMatId !== null && (
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.enrollment.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds)
                              if (e.target.checked) next.add(row.enrollment.id)
                              else next.delete(row.enrollment.id)
                              setSelectedIds(next)
                            }}
                            className="h-3.5 w-3.5 rounded"
                          />
                        </td>
                      )}
                      <td className="sticky left-0 bg-white px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {row.enrollment.name}
                        <span className="ml-2 text-xs text-gray-400">{row.enrollment.exam_number || row.enrollment.phone}</span>
                      </td>
                      {materials.map((m) => {
                        const got = row.receipts[m.id]
                        return (
                          <td key={m.id} className="px-3 py-3 text-center">
                            {got ? (
                              <button
                                type="button"
                                onClick={() => void handleUndo(got.logId, row.enrollment.name, m.name)}
                                disabled={bulkDistributing}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 transition-colors hover:bg-amber-100 hover:text-amber-700 disabled:opacity-40"
                                title={`수령: ${formatDateTime(got.distributed_at)} — 클릭하여 취소`}
                              >
                                ✓
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleDistribute(row.enrollment.id, m.id)}
                                disabled={bulkDistributing}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-xs text-red-500 hover:bg-red-100 disabled:opacity-40"
                              >
                                ✗
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bulk distribute action bar */}
          {filterMatId !== null && selectedIds.size > 0 && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-blue-200 bg-blue-50 px-5 py-3">
              <span className="text-sm font-semibold text-blue-800">{selectedIds.size}명 선택</span>
              <button
                type="button"
                onClick={() => void handleBulkDistributeSelected()}
                disabled={bulkDistributing}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
              >
                {bulkDistributing
                  ? `배부 중... (${bulkProgress.done}/${bulkProgress.total})`
                  : `선택 ${selectedIds.size}명 일괄 배부`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
