'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, Enrollment, EnrollmentFieldDef, Material, TextbookAssignment } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { PinRevealModal } from './pin-reveal-modal'
import { StudentsManageTable } from './students-manage-table'
import { StudentsMatrixPanel } from './students-matrix-panel'
import {
  MATRIX_TAB_META,
  emptyForm,
  isMatrixTab,
  toEditForm,
  type EnrollmentForm,
  type MatrixMode,
  type MatrixRow,
  type Panel,
  type PinRevealState,
  type ReceiptCell,
  type StudentsPageData,
  type TabMode,
} from './students-page-types'

type CourseStudentsPageProps = {
  initialData?: StudentsPageData | null
  initialError?: string
  initialLoaded?: boolean
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
  const [courseRes, enrollRes, textbookRes] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?courseId=${courseId}`, { cache: 'no-store' }),
    fetch(`/api/materials?courseId=${courseId}&materialType=textbook`, { cache: 'no-store' }),
  ])
  const coursePay = await courseRes.json().catch(() => null)
  const enrollPay = await enrollRes.json().catch(() => null)
  const textbookPay = await textbookRes.json().catch(() => null)
  if (!courseRes.ok) throw new Error(coursePay?.error ?? '강좌 정보를 불러오지 못했습니다.')
  if (!enrollRes.ok) throw new Error(enrollPay?.error ?? '수강생 목록을 불러오지 못했습니다.')
  if (!textbookRes.ok) throw new Error(textbookPay?.error ?? '교재 목록을 불러오지 못했습니다.')
  return {
    course: coursePay.course as Course,
    enrollments: (enrollPay.enrollments ?? []) as Enrollment[],
    textbooks: (textbookPay.materials ?? []) as Material[],
  }
}

export default function CourseStudentsPage({
  initialData = null,
  initialError = '',
  initialLoaded = Boolean(initialData),
}: CourseStudentsPageProps) {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [tab, setTab] = useState<TabMode>('manage')
  const [panel, setPanel] = useState<Panel>('none')
  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialData?.enrollments ?? [])
  const [textbooks, setTextbooks] = useState<Material[]>(initialData?.textbooks ?? [])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'refunded'>('all')

  const [matrixMaterials, setMatrixMaterials] = useState<Material[]>([])
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([])
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixSearch, setMatrixSearch] = useState('')
  const [filterMatId, setFilterMatId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Forms
  const [createForm, setCreateForm] = useState<EnrollmentForm>(emptyForm())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EnrollmentForm>(emptyForm())
  const [bulkText, setBulkText] = useState('')
  const [pinReveal, setPinReveal] = useState<PinRevealState | null>(null)

  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [loading, setLoading] = useState(!initialLoaded)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)

  const customFields = course?.enrollment_fields ?? []
  const activeEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.status === 'active'),
    [enrollments],
  )
  const activeEnrollmentsRef = useRef(activeEnrollments)
  activeEnrollmentsRef.current = activeEnrollments
  const visibleTextbooks = useMemo(
    () => textbooks.filter((textbook) => textbook.is_active),
    [textbooks],
  )

  async function copyPin(pin: string) {
    try {
      await navigator.clipboard.writeText(pin)
      setMessage(`PIN ${pin}을 복사했습니다.`)
    } catch {
      setError('PIN을 복사하지 못했습니다.')
    }
  }

  function toggleCreateTextbook(materialId: number) {
    setCreateForm((current) => ({
      ...current,
      textbookIds: current.textbookIds.includes(materialId)
        ? current.textbookIds.filter((id) => id !== materialId)
        : [...current.textbookIds, materialId],
    }))
  }

  const refresh = useCallback(async () => {
    const data = await fetchStudentsPageData(courseId)
    setCourse(data.course)
    setEnrollments(data.enrollments)
    setTextbooks(data.textbooks)
  }, [courseId])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID')
      setLoading(false)
      return
    }
    refresh()
      .catch((r: unknown) => setError(r instanceof Error ? r.message : '불러오기 실패'))
      .finally(() => {
        if (!initialLoaded) {
          setLoading(false)
        }
      })
  }, [courseId, refresh, initialLoaded])

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

  const loadMatrixData = useCallback(async (mode: MatrixMode) => {
    setMatrixLoading(true)
    setError('')

    try {
      const meta = MATRIX_TAB_META[mode]
      const response = await fetch(
        `/api/distribution/receipt-matrix?courseId=${courseId}&materialType=${meta.materialType}`,
        { cache: 'no-store' },
      )
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? '매트릭스 데이터를 불러오지 못했습니다.')
      }

      const materials = (payload?.materials ?? []) as Material[]
      const logs = (payload?.logs ?? []) as Array<{
        id: number
        enrollment_id: number
        material_id: number
        distributed_at: string
      }>
      const assignments = (payload?.assignments ?? []) as TextbookAssignment[]

      const receiptMap = new Map<number, Record<number, ReceiptCell>>()
      for (const log of logs) {
        if (!receiptMap.has(log.enrollment_id)) {
          receiptMap.set(log.enrollment_id, {})
        }

        receiptMap.get(log.enrollment_id)![log.material_id] = {
          distributed_at: log.distributed_at,
          logId: log.id,
        }
      }

      const assignmentMap = new Map<number, Record<number, true>>()
      for (const assignment of assignments) {
        if (!assignmentMap.has(assignment.enrollment_id)) {
          assignmentMap.set(assignment.enrollment_id, {})
        }

        assignmentMap.get(assignment.enrollment_id)![assignment.material_id] = true
      }

      setMatrixMaterials(materials)
      setMatrixRows(
        activeEnrollmentsRef.current.map((enrollment) => ({
          enrollment,
          receipts: receiptMap.get(enrollment.id) ?? {},
          assignments: assignmentMap.get(enrollment.id) ?? {},
        })),
      )
      setFilterMatId(null)
      setSelectedIds(new Set())
      setMatrixSearch('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '매트릭스 데이터를 불러오지 못했습니다.')
    } finally {
      setMatrixLoading(false)
    }
  }, [courseId])

  const reloadCurrentMatrix = useCallback(async () => {
    if (isMatrixTab(tab)) {
      await loadMatrixData(tab)
    }
  }, [loadMatrixData, tab])

  useEffect(() => {
    if (!isMatrixTab(tab)) {
      return
    }

    void loadMatrixData(tab)
  }, [loadMatrixData, tab])

  const filteredMatrixRows = useMemo(() => {
    let rows = matrixRows

    if (matrixSearch.trim()) {
      const query = matrixSearch.trim().toLowerCase()
      rows = rows.filter((row) =>
        row.enrollment.name.toLowerCase().includes(query)
        || row.enrollment.phone.includes(query)
        || (row.enrollment.exam_number ?? '').toLowerCase().includes(query))
    }

    if (filterMatId === null) {
      return rows
    }

    if (tab === 'receipts') {
      return rows.filter((row) => !row.receipts[filterMatId])
    }

    if (tab === 'textbook-assign') {
      return rows.filter((row) => !row.assignments[filterMatId])
    }

    return rows.filter((row) => row.assignments[filterMatId] && !row.receipts[filterMatId])
  }, [filterMatId, matrixRows, matrixSearch, tab])

  const bulkActionEnabled = filterMatId !== null && (tab === 'receipts' || tab === 'textbook-assign')

  async function handleDistribute(enrollmentId: number, materialId: number) {
    setBulkProcessing(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/distribution/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, materialId }),
    })
    const p = await r.json().catch(() => null)
    setBulkProcessing(false)
    if (!r.ok) { setError(p?.error ?? '배부 처리에 실패했습니다.'); return }
    setMessage(`${p?.student_name ?? '수강생'} - ${p?.material_name ?? '자료'} 배부 완료`)
    await reloadCurrentMatrix()
  }

  async function handleUndo(logId: number, studentName: string, materialName: string) {
    if (!window.confirm(`"${studentName}"의 "${materialName}" 수령 기록을 취소할까요?`)) return
    setBulkProcessing(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/distribution/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    const p = await r.json().catch(() => null)
    setBulkProcessing(false)
    if (!r.ok) { setError(p?.error ?? '수령 취소에 실패했습니다.'); return }
    setMessage(`${studentName} - ${materialName} 수령 취소 완료`)
    await reloadCurrentMatrix()
  }

  async function handleBulkDistributeSelected() {
    if (filterMatId === null || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: ids.length })
    setError('')
    setMessage('')
    let successCount = 0

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
      if (chunk.length > 1 && results.every((r) => r.status === 'rejected')) break
    }

    setBulkProcessing(false)
    setSelectedIds(new Set())
    const failCount = ids.length - successCount
    setMessage(`일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
    await reloadCurrentMatrix()
  }

  async function handleAssignTextbook(enrollmentId: number, materialId: number, checked: boolean) {
    setBulkProcessing(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/textbook-assignments', {
      method: checked ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, materialId }),
    })
    const payload = await response.json().catch(() => null)
    setBulkProcessing(false)

    if (!response.ok) {
      setError(payload?.error ?? '교재 배정 처리에 실패했습니다.')
      return
    }

    setMessage(checked ? '교재를 배정했습니다.' : '교재 배정을 해제했습니다.')
    await reloadCurrentMatrix()
  }

  async function handleBulkAssignSelected() {
    if (filterMatId === null || selectedIds.size === 0) return

    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: selectedIds.size })
    setError('')
    setMessage('')

    const enrollmentIds = Array.from(selectedIds)
    const response = await fetch('/api/textbook-assignments/bulk-by-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId: filterMatId, enrollmentIds }),
    })
    const payload = await response.json().catch(() => null)

    setBulkProgress({ done: enrollmentIds.length, total: enrollmentIds.length })
    setBulkProcessing(false)

    if (!response.ok) {
      setError(payload?.error ?? '교재 일괄 배정에 실패했습니다.')
      return
    }

    setSelectedIds(new Set())
    setMessage(`${payload?.assignments?.length ?? enrollmentIds.length}명에게 교재를 배정했습니다.`)
    await reloadCurrentMatrix()
  }

  // CRUD
  async function handleCreate(ev: FormEvent) {
    ev.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        name: createForm.name,
        phone: createForm.phone,
        exam_number: createForm.exam_number || null,
        birth_date: createForm.birth_date || null,
        custom_data: createForm.custom_data,
        textbookIds: createForm.textbookIds,
      }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '수강생 등록에 실패했습니다.'); return }
    setCreateForm(emptyForm())
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
    await refresh().catch(() => null)
  }

  async function handleBulkImport(ev: FormEvent) {
    ev.preventDefault()
    if (!bulkText.trim()) { setError('명단을 입력해 주세요.'); return }
    setSubmitting(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/enrollments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, text: bulkText }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '대량 등록에 실패했습니다.'); return }
    setBulkText('')
    if (Array.isArray(p?.generated_pins) && p.generated_pins.length > 0) {
      setPinReveal({
        title: '일괄 생성 학생 PIN',
        pins: p.generated_pins as Array<{ name: string; phone: string; pin: string }>,
      })
    }
    setMessage(`${p?.count ?? 0}건 반영했습니다.`)
    setPanel('none')
    await refresh().catch(() => null)
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
    setSubmitting(true)
    setError('')
    setMessage('')
    const r = await fetch(`/api/enrollments/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        phone: editForm.phone,
        exam_number: editForm.exam_number || null,
        birth_date: editForm.birth_date || null,
        custom_data: editForm.custom_data,
      }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '수정에 실패했습니다.'); return }
    const next = p.enrollment as Enrollment
    setEnrollments((c) => c.map((x) => (x.id === next.id ? next : x)))
    setPanel('none'); setEditingId(null)
    setMessage('수강생 정보를 수정했습니다.')
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
    const p = await r.json().catch(() => null)
    if (!r.ok) { setError(p?.error ?? '삭제에 실패했습니다.'); return }
    setEnrollments((c) => c.filter((x) => x.id !== e.id))
    if (editingId === e.id) { setPanel('none'); setEditingId(null) }
    setMessage('수강생을 삭제했습니다.')
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

          {visibleTextbooks.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-700">구매 교재</p>
                <span className="text-xs text-gray-400">등록과 동시에 교재를 배정합니다.</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {visibleTextbooks.map((textbook) => (
                  <label key={textbook.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={createForm.textbookIds.includes(textbook.id)}
                      onChange={() => toggleCreateTextbook(textbook.id)}
                    />
                    <span>{textbook.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

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
          <p className="mt-3 text-xs text-gray-400">교재 배정은 등록 후 `교재 배정` 탭에서 교재별로 일괄 처리할 수 있습니다.</p>
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
                  <Image src={editPhotoUrl} alt="증명사진" width={60} height={80} unoptimized className="h-full w-full object-cover" />
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
      <PinRevealModal reveal={pinReveal} onClose={() => setPinReveal(null)} onCopyPin={copyPin} />

      {/* ── Tab toggle ── */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <button type="button" onClick={() => setTab('manage')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'manage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>관리</button>
        <button type="button" onClick={() => setTab('receipts')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'receipts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>배부자료 수령현황</button>
        <button type="button" onClick={() => setTab('textbook-assign')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'textbook-assign' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>교재 배정</button>
        <button type="button" onClick={() => setTab('textbook-receipts')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === 'textbook-receipts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>교재 수령현황</button>
      </div>

      {/* ── Manage tab ── */}
      {tab === 'manage' && (
        <StudentsManageTable
          filtered={filtered}
          search={search}
          statusFilter={statusFilter}
          customFields={customFields}
          onSearchChange={setSearch}
          onStatusFilterChange={setStatusFilter}
          onEdit={startEdit}
          onResetPin={(enrollment) => {
            void handleResetPin(enrollment)
          }}
          onRefund={(enrollment) => {
            void handleRefund(enrollment)
          }}
          onDelete={(enrollment) => {
            void handleDelete(enrollment)
          }}
        />
      )}

      {isMatrixTab(tab) && (
        <StudentsMatrixPanel
          tab={tab}
          matrixLoading={matrixLoading}
          matrixMaterials={matrixMaterials}
          filteredMatrixRows={filteredMatrixRows}
          matrixSearch={matrixSearch}
          filterMatId={filterMatId}
          selectedIds={selectedIds}
          bulkActionEnabled={bulkActionEnabled}
          bulkProcessing={bulkProcessing}
          bulkProgress={bulkProgress}
          onMatrixSearchChange={setMatrixSearch}
          onToggleFilterMaterial={(materialId) => {
            setFilterMatId((prev) => (prev === materialId ? null : materialId))
            setSelectedIds(new Set())
          }}
          onClearFilter={() => {
            setFilterMatId(null)
            setSelectedIds(new Set())
          }}
          onReplaceSelectedIds={setSelectedIds}
          onToggleRowSelection={(enrollmentId, checked) => {
            setSelectedIds((current) => {
              const next = new Set(current)
              if (checked) next.add(enrollmentId)
              else next.delete(enrollmentId)
              return next
            })
          }}
          onDistribute={(enrollmentId, materialId) => {
            void handleDistribute(enrollmentId, materialId)
          }}
          onUndo={(logId, studentName, materialName) => {
            void handleUndo(logId, studentName, materialName)
          }}
          onAssignTextbook={(enrollmentId, materialId, checked) => {
            void handleAssignTextbook(enrollmentId, materialId, checked)
          }}
          onRunBulkAction={() => {
            void (tab === 'receipts' ? handleBulkDistributeSelected() : handleBulkAssignSelected())
          }}
        />
      )}
    </div>
  )
}
