'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Student } from '@/types/database'
import { useTenantConfig } from '@/components/TenantProvider'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import { useAppConfig } from '@/hooks/use-app-config'

interface Material { id: number; name: string }
interface StudentWithReceipts {
  id: string; name: string; exam_number: string | null
  series: string | null; region: string | null; received_ids: number[]
}
type StudentListField = 'name' | 'phone' | 'series' | 'exam_number' | 'gender' | 'region'

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

const LEGACY_SERIES_COLS = ['공채', '구급', '학과', '구조', '기타']

function parseExcelPaste(text: string): { name: string; phone: string; exam_number: string; gender: string; region: string; series: string }[] {
  return text.trim().split(/\r?\n/).flatMap(line => {
    const cols = line.split('\t').map(c => c.trim())
    const name = cols[0] ?? ''
    const phone = cols[1] ?? ''
    if (!name || !phone) return []
    if (name === '이름' && phone.includes('연락처')) return []

    const seriesFromCategory = cols[2] ?? ''
    const exam_number = cols[3] ?? ''
    const gender = cols[4] ?? ''
    const region = cols[5] ?? ''
    const legacySeriesIdx = LEGACY_SERIES_COLS.findIndex((_, i) => /^o$/i.test(cols[6 + i] ?? ''))
    const legacySeries = legacySeriesIdx >= 0 ? LEGACY_SERIES_COLS[legacySeriesIdx] : ''
    const series = seriesFromCategory || legacySeries

    return [{ name, phone, exam_number, gender, region, series }]
  })
}

function getStudentFieldValue(student: Student, field: StudentListField): string {
  const value = student[field]
  return value ?? '-'
}

export default function StudentsPage() {
  const tenant = useTenantConfig()
  const { config, isLoading: isFeatureLoading } = useAppConfig()
  const [tab, setTab] = useState<'list' | 'receipt'>('list')

  // 목록 탭
  const [students, setStudents] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', phone:'', exam_number:'', gender:'', region:'', series:'' })
  const [editId, setEditId] = useState<string | null>(null)

  // 엑셀 붙여넣기
  const [showBulk, setShowBulk] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseExcelPaste>>([])
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')

  // 수령현황 탭
  const [rcStudents, setRcStudents] = useState<StudentWithReceipts[]>([])
  const [rcMaterials, setRcMaterials] = useState<Material[]>([])
  const [rcTotal, setRcTotal] = useState(0)
  const [rcPage, setRcPage] = useState(1)
  const [rcSearch, setRcSearch] = useState('')
  const [rcSearchInput, setRcSearchInput] = useState('')
  const [rcLoading, setRcLoading] = useState(false)
  const RC_PAGE_SIZE = 50
  const rcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 자료 필터 + 배부
  type UnreceivedStudent = { id: string; name: string; phone: string; exam_number: string | null; series: string | null; region: string | null }
  const [filterMatId, setFilterMatId] = useState<number | null>(null)
  const [filteredStudents, setFilteredStudents] = useState<UnreceivedStudent[]>([])
  const [filteredSearch, setFilteredSearch] = useState('')
  const [filteredLoading, setFilteredLoading] = useState(false)
  const [distributing, setDistributing] = useState<Set<string>>(new Set())
  const [returning, setReturning] = useState<Set<string>>(new Set())
  const [distMsg, setDistMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null)
  const [confirmUndoKey, setConfirmUndoKey] = useState<string | null>(null)
  // 일괄 배부 선택
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set())
  const [bulkDistributing, setBulkDistributing] = useState(false)

  const PAGE_SIZE = 20
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), search })
      const res = await fetch(`/api/students?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStudents(data.students ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  const loadReceipt = useCallback(async () => {
    setRcLoading(true)
    try {
      const params = new URLSearchParams({ page: String(rcPage), limit: String(RC_PAGE_SIZE), search: rcSearch })
      const res = await fetch(`/api/students/receipt-status?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setRcStudents(data.students ?? [])
      setRcMaterials(data.materials ?? [])
      setRcTotal(data.total ?? 0)
    } catch { /* ignore */ } finally {
      setRcLoading(false)
    }
  }, [rcPage, rcSearch])

  const loadFiltered = useCallback(async () => {
    if (!filterMatId) return
    setFilteredLoading(true)
    try {
      const res = await fetch(`/api/distribution/unreceived?material_id=${filterMatId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setFilteredStudents(data.students ?? [])
    } catch { /* ignore */ } finally {
      setFilteredLoading(false)
    }
  }, [filterMatId])

  useEffect(() => {
    if (!isFeatureLoading && config.admin_student_management_enabled) {
      void load()
    }
  }, [config.admin_student_management_enabled, isFeatureLoading, load])

  useEffect(() => {
    if (!isFeatureLoading && config.admin_student_management_enabled && tab === 'receipt') {
      void loadReceipt()
    }
  }, [config.admin_student_management_enabled, isFeatureLoading, tab, loadReceipt])

  useEffect(() => {
    if (!isFeatureLoading && config.admin_student_management_enabled && filterMatId !== null) {
      void loadFiltered()
      setFilteredSearch('')
      setSelectedForBulk(new Set())
    }
  }, [config.admin_student_management_enabled, filterMatId, isFeatureLoading, loadFiltered])

  async function handleSave() {
    setSaving(true)
    const method = editId ? 'PATCH' : 'POST'
    const url = editId ? `/api/students/${editId}` : '/api/students'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) { setShowForm(false); setEditId(null); setForm({ name:'', phone:'', exam_number:'', gender:'', region:'', series:'' }); load() }
    else { const d = await res.json(); alert(d.error ?? '저장 실패') }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/students/${id}`, { method: 'DELETE' })
    setConfirmDeleteStudentId(null)
    if (res.ok) load()
    else alert('삭제 실패')
  }

  function startEdit(s: Student) {
    setForm({ name:s.name, phone:s.phone, exam_number:s.exam_number??'', gender:s.gender??'', region:s.region??'', series:s.series??'' })
    setEditId(s.id)
    setShowForm(true)
  }

  function handlePasteChange(text: string) {
    setPasteText(text)
    setBulkMsg('')
    setPreview(text.trim() ? parseExcelPaste(text) : [])
  }

  async function handleBulkImport() {
    if (!preview.length) return
    setBulkLoading(true)
    setBulkMsg('')
    const res = await fetch('/api/students/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preview),
    })
    const data = await res.json()
    setBulkLoading(false)
    if (!res.ok) { setBulkMsg(data.error ?? '등록 실패'); return }
    setBulkMsg(`완료: ${data.inserted}명 신규 등록${data.skipped > 0 ? `, ${data.skipped}명 중복 건너뜀` : ''} (전체 ${data.total}명)`)
    load()
  }

  async function distribute(studentId: string, materialId: number, studentName: string) {
    const key = `${studentId}-${materialId}`
    setDistributing(prev => new Set(prev).add(key))
    const res = await fetch('/api/distribution/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, material_id: materialId, note: '관리자 수동배부' }),
    })
    const data = await res.json()
    setDistributing(prev => { const s = new Set(prev); s.delete(key); return s })
    if (res.ok) {
      const matName = rcMaterials.find(m => m.id === materialId)?.name ?? ''
      setDistMsg({ text: `✓ ${studentName} — ${matName} 배부 완료`, ok: true })
      setRcStudents(prev => prev.map(s => s.id === studentId ? { ...s, received_ids: [...s.received_ids, materialId] } : s))
      setFilteredStudents(prev => prev.filter(s => s.id !== studentId))
    } else {
      setDistMsg({ text: data.error ?? '배부 실패', ok: false })
    }
    setTimeout(() => setDistMsg(null), 3000)
  }

  async function bulkDistribute() {
    if (!filterMatId || selectedForBulk.size === 0) return
    setBulkDistributing(true)
    const ids = [...selectedForBulk]
    const results = await Promise.all(
      ids.map(studentId =>
        fetch('/api/distribution/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, material_id: filterMatId, note: '관리자 일괄배부' }),
        }).then(r => r.json().then(d => ({ studentId, ok: r.ok, data: d })))
      )
    )
    const succeeded = results.filter(r => r.ok).map(r => r.studentId)
    const failed = results.filter(r => !r.ok).length
    setBulkDistributing(false)
    setSelectedForBulk(new Set())
    if (succeeded.length > 0) {
      setFilteredStudents(prev => prev.filter(s => !succeeded.includes(s.id)))
      const matName = rcMaterials.find(m => m.id === filterMatId)?.name ?? ''
      setDistMsg({
        text: `✓ ${succeeded.length}명 일괄 배부 완료${failed > 0 ? ` (${failed}명 실패)` : ''} — ${matName}`,
        ok: failed === 0,
      })
    } else {
      setDistMsg({ text: '일괄 배부에 실패했습니다.', ok: false })
    }
    setTimeout(() => setDistMsg(null), 4000)
  }

  async function undo(studentId: string, materialId: number, studentName: string) {
    const key = `${studentId}-${materialId}`
    if (confirmUndoKey !== key) { setConfirmUndoKey(key); return }
    setReturning(prev => new Set(prev).add(key))
    const res = await fetch('/api/distribution/undo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, material_id: materialId }),
    })
    const data = await res.json()
    setReturning(prev => { const s = new Set(prev); s.delete(key); return s })
    setConfirmUndoKey(null)
    if (res.ok) {
      const matName = rcMaterials.find(m => m.id === materialId)?.name ?? ''
      setDistMsg({ text: `↩ ${studentName} — ${matName} 반납 처리됨`, ok: true })
      setRcStudents(prev => prev.map(s => s.id === studentId
        ? { ...s, received_ids: s.received_ids.filter(id => id !== materialId) }
        : s
      ))
    } else {
      setDistMsg({ text: data.error ?? '반납 실패', ok: false })
    }
    setTimeout(() => setDistMsg(null), 3000)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const rcTotalPages = Math.ceil(rcTotal / RC_PAGE_SIZE)

  if (isFeatureLoading) {
    return <div className="py-16 text-center text-sm text-gray-500">기능 설정을 확인하는 중입니다...</div>
  }

  if (!config.admin_student_management_enabled) {
    return (
      <FeatureDisabledPanel
        title="학생/수령 관리 기능이 꺼져 있습니다."
        description="이 지점에서는 학생 명단, 일괄 등록, 수령 상태 조회와 관리자 수동 배부 기능을 사용하지 않습니다. 설정 허브에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">학생 명단 <span className="text-base text-gray-400 font-normal">({total}명)</span></h1>
        <div className="flex gap-2">
          <button onClick={() => { setPasteText(''); setPreview([]); setBulkMsg(''); setShowBulk(true) }}
            className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 bg-white">
            엑셀 붙여넣기
          </button>
          <button onClick={() => { setEditId(null); setForm({ name:'', phone:'', exam_number:'', gender:'', region:'', series:'' }); setShowForm(true) }}
            className="px-4 py-2 text-sm text-white font-medium" style={{ background: 'var(--theme)' }}>
            + 학생 추가
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex mb-4 border border-gray-200 overflow-hidden w-fit">
        {(['list', 'receipt'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2 text-sm font-medium transition-colors"
            style={tab === t ? { background: 'var(--theme)', color: '#fff' } : { background: '#fff', color: '#6b7280' }}
          >
            {t === 'list' ? '학생 목록' : '수령 현황'}
          </button>
        ))}
      </div>

      {/* ── 학생 목록 탭 ── */}
      {tab === 'list' && (
        <>
          <input
            defaultValue={search}
            onChange={e => {
              const val = e.target.value
              if (debounceRef.current) clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => { setSearch(val); setPage(1) }, 300)
            }}
            placeholder="이름, 수험번호, 연락처 검색..."
            className="w-full px-4 py-2.5 border border-gray-200 text-sm mb-4 focus:outline-none focus:border-blue-900" />

          <div className="bg-white border border-gray-200 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {tenant.studentListHeaders.map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">로딩 중...</td></tr>
                ) : loadError ? (
                  <tr><td colSpan={7} className="text-center py-10 text-red-400">데이터를 불러오지 못했습니다. <button onClick={load} className="underline">다시 시도</button></td></tr>
                ) : students.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">학생이 없습니다.</td></tr>
                ) : students.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    {tenant.studentListFields.map(f => (
                      <td key={f} className={`px-4 py-3 ${f === 'name' ? 'font-medium' : 'text-gray-600'}`}>{getStudentFieldValue(s, f)}</td>
                    ))}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-3 items-center">
                        <button onClick={() => startEdit(s)} className="text-xs text-blue-600 hover:underline">수정</button>
                        {confirmDeleteStudentId === s.id ? (
                          <>
                            <button onClick={() => handleDelete(s.id)} className="text-xs text-red-600 font-semibold hover:underline">확인</button>
                            <button onClick={() => setConfirmDeleteStudentId(null)} className="text-xs text-gray-400 hover:underline">취소</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteStudentId(s.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1 mt-4 flex-wrap">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="w-8 h-8 text-sm bg-white text-gray-600 border border-gray-200 disabled:opacity-30">‹</button>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '...'
                  ? <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
                  : <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 text-sm border ${p === page ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                      style={p === page ? { background: 'var(--theme)' } : {}}>{p}</button>
              )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="w-8 h-8 text-sm bg-white text-gray-600 border border-gray-200 disabled:opacity-30">›</button>
            </div>
          )}
        </>
      )}

      {/* ── 수령 현황 탭 ── */}
      {tab === 'receipt' && (
        <>
          {/* 자료 필터 버튼 */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setFilterMatId(null)}
              className="px-4 py-2 text-sm font-medium border transition-colors"
              style={filterMatId === null
                ? { background: 'var(--theme)', color: '#fff', borderColor: 'var(--theme)' }
                : { background: '#fff', color: '#374151', borderColor: '#d1d5db' }}
            >
              전체 현황
            </button>
            {rcMaterials.map(m => (
              <button
                key={m.id}
                onClick={() => setFilterMatId(m.id)}
                className="px-4 py-2 text-sm font-medium border transition-colors"
                style={filterMatId === m.id
                  ? { background: 'var(--theme)', color: '#fff', borderColor: 'var(--theme)' }
                  : { background: '#fff', color: '#374151', borderColor: '#d1d5db' }}
              >
                {m.name} 미수령
              </button>
            ))}
          </div>

          {/* 배부 결과 메시지 */}
          {distMsg && (
            <div className={`mb-4 px-4 py-2.5 text-sm font-medium ${distMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {distMsg.text}
            </div>
          )}

          {/* ── 전체 매트릭스 뷰 ── */}
          {filterMatId === null && (
            <>
              <input
                value={rcSearchInput}
                onChange={e => {
                  const val = e.target.value
                  setRcSearchInput(val)
                  if (rcDebounceRef.current) clearTimeout(rcDebounceRef.current)
                  rcDebounceRef.current = setTimeout(() => { setRcSearch(val); setRcPage(1) }, 300)
                }}
                placeholder="이름, 수험번호, 연락처 검색..."
                className="w-full px-4 py-2.5 border border-gray-200 text-sm mb-4 focus:outline-none focus:border-blue-900"
              />
              <div className="bg-white border border-gray-200 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">이름</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">수험번호</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{tenant.labels.series}</th>
                      {rcMaterials.map(m => (
                        <th key={m.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[80px]">
                          {m.name}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">수령수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rcLoading ? (
                      <tr><td colSpan={4 + rcMaterials.length} className="text-center py-10 text-gray-400">로딩 중...</td></tr>
                    ) : rcStudents.length === 0 ? (
                      <tr><td colSpan={4 + rcMaterials.length} className="text-center py-10 text-gray-400">학생이 없습니다.</td></tr>
                    ) : rcStudents.map(s => {
                      const receivedSet = new Set(s.received_ids)
                      const receivedCount = rcMaterials.filter(m => receivedSet.has(m.id)).length
                      const allReceived = receivedCount === rcMaterials.length
                      return (
                        <tr key={s.id} className={`border-b border-gray-100 ${allReceived ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 font-medium">{s.name}</td>
                          <td className="px-4 py-2.5 text-gray-600">{s.exam_number ?? '-'}</td>
                          <td className="px-4 py-2.5 text-gray-600">{s.series ?? '-'}</td>
                          {rcMaterials.map(m => {
                            const key = `${s.id}-${m.id}`
                            const isDist = distributing.has(key)
                            return (
                              <td key={m.id} className="px-3 py-2.5 text-center">
                                {receivedSet.has(m.id) ? (
                                  <div className="inline-flex items-center gap-1">
                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-green-600 text-white text-xs font-bold">✓</span>
                                    {confirmUndoKey === `${s.id}-${m.id}` ? (
                                      <>
                                        <button onClick={() => undo(s.id, m.id, s.name)} disabled={returning.has(`${s.id}-${m.id}`)}
                                          className="text-[10px] text-red-600 font-bold hover:underline disabled:opacity-40">
                                          {returning.has(`${s.id}-${m.id}`) ? '…' : '반납'}
                                        </button>
                                        <button onClick={() => setConfirmUndoKey(null)} className="text-[10px] text-gray-400 hover:underline">취소</button>
                                      </>
                                    ) : (
                                      <button onClick={() => undo(s.id, m.id, s.name)} title="반납"
                                        className="w-5 h-5 flex items-center justify-center bg-red-100 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold border border-red-300 transition-colors">
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => distribute(s.id, m.id, s.name)}
                                    disabled={isDist}
                                    title={`${s.name}에게 ${m.name} 배부`}
                                    className="inline-flex items-center justify-center w-6 h-6 border border-dashed border-gray-300 text-gray-400 text-xs hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                                  >
                                    {isDist ? '…' : '-'}
                                  </button>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs font-bold ${allReceived ? 'text-green-700' : receivedCount > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                              {receivedCount}/{rcMaterials.length}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                <span>총 {rcTotal}명 중 {rcStudents.filter(s => s.received_ids.length === rcMaterials.length).length}명 전체 수령 완료</span>
              </div>
              {rcTotalPages > 1 && (
                <div className="flex justify-center items-center gap-1 mt-3 flex-wrap">
                  <button onClick={() => setRcPage(p => Math.max(1, p - 1))} disabled={rcPage === 1}
                    className="w-8 h-8 text-sm bg-white text-gray-600 border border-gray-200 disabled:opacity-30">‹</button>
                  {getPageNumbers(rcPage, rcTotalPages).map((p, i) =>
                    p === '...'
                      ? <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
                      : <button key={p} onClick={() => setRcPage(p)}
                          className={`w-8 h-8 text-sm border ${p === rcPage ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                          style={p === rcPage ? { background: 'var(--theme)' } : {}}>{p}</button>
                  )}
                  <button onClick={() => setRcPage(p => Math.min(rcTotalPages, p + 1))} disabled={rcPage === rcTotalPages}
                    className="w-8 h-8 text-sm bg-white text-gray-600 border border-gray-200 disabled:opacity-30">›</button>
                </div>
              )}
            </>
          )}

          {/* ── 자료별 미수령 배부 뷰 ── */}
          {filterMatId !== null && (() => {
            const q = filteredSearch.trim().toLowerCase()
            const display = q ? filteredStudents.filter(s =>
              s.name.toLowerCase().includes(q) ||
              (s.exam_number ?? '').toLowerCase().includes(q) ||
              s.phone.includes(q)
            ) : filteredStudents
            const displayIds = display.map(s => s.id)
            const allChecked = displayIds.length > 0 && displayIds.every(id => selectedForBulk.has(id))
            const someChecked = displayIds.some(id => selectedForBulk.has(id))

            function toggleAll() {
              if (allChecked) {
                setSelectedForBulk(prev => { const s = new Set(prev); displayIds.forEach(id => s.delete(id)); return s })
              } else {
                setSelectedForBulk(prev => new Set([...prev, ...displayIds]))
              }
            }
            function toggleOne(id: string) {
              setSelectedForBulk(prev => {
                const s = new Set(prev)
                if (s.has(id)) {
                  s.delete(id)
                } else {
                  s.add(id)
                }
                return s
              })
            }

            return (
              <>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <input
                    value={filteredSearch}
                    onChange={e => setFilteredSearch(e.target.value)}
                    placeholder="이름, 수험번호, 핸드폰번호로 검색..."
                    className="flex-1 min-w-0 px-4 py-2.5 border border-gray-200 text-sm focus:outline-none focus:border-blue-900"
                  />
                  {selectedForBulk.size > 0 && (
                    <button
                      onClick={bulkDistribute}
                      disabled={bulkDistributing}
                      className="px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap disabled:opacity-50"
                      style={{ background: 'var(--theme)' }}
                    >
                      {bulkDistributing ? '처리 중...' : `선택 ${selectedForBulk.size}명 일괄 배부`}
                    </button>
                  )}
                </div>
                <div className="bg-white border border-gray-200 overflow-auto">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {rcMaterials.find(m => m.id === filterMatId)?.name} 미수령
                    </span>
                    <span className="text-sm text-gray-500">
                      {filteredLoading ? '조회 중...' : (
                        filteredSearch.trim() ? `${display.length} / ${filteredStudents.length}명` : `${filteredStudents.length}명`
                      )}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-8">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                            onChange={toggleAll}
                            className="cursor-pointer"
                          />
                        </th>
                        {tenant.unreceivedHeaders.map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLoading ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-400">로딩 중...</td></tr>
                      ) : filteredStudents.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-green-600 font-medium">전원 수령 완료!</td></tr>
                      ) : display.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-400">검색 결과가 없습니다.</td></tr>
                      ) : display.map(s => {
                        const key = `${s.id}-${filterMatId}`
                        const checked = selectedForBulk.has(s.id)
                        return (
                          <tr key={s.id} className={`border-b border-gray-50 hover:bg-gray-50 ${checked ? 'bg-blue-50/60' : ''}`}>
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={checked} onChange={() => toggleOne(s.id)} className="cursor-pointer" />
                            </td>
                            <td className="px-4 py-3 font-medium">{s.name}</td>
                            <td className="px-4 py-3 text-gray-600">{s.exam_number ?? '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{s.series ?? '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{s.region ?? '-'}</td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => distribute(s.id, filterMatId, s.name)}
                                disabled={distributing.has(key)}
                                className="px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-opacity"
                                style={{ background: 'var(--theme)' }}
                              >
                                {distributing.has(key) ? '처리 중...' : '배부'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </>
      )}

      {/* 엑셀 붙여넣기 모달 */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulk(false)}>
          <div className="bg-white p-6 w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">엑셀 붙여넣기 대량 등록</h2>
            <p className="text-xs text-gray-500 mb-3">
              엑셀에서 데이터 행을 선택 후 복사(Ctrl+C)하여 아래에 붙여넣기(Ctrl+V)하세요.<br />
              컬럼 순서: <strong>{tenant.bulkPasteGuide}</strong>
            </p>
            <textarea
              className="w-full h-32 px-3 py-2 border border-gray-200 text-sm font-mono focus:outline-none focus:border-blue-900 resize-none"
              placeholder="여기에 엑셀 데이터를 붙여넣으세요..."
              value={pasteText}
              onChange={e => handlePasteChange(e.target.value)}
            />

            {preview.length > 0 && (
              <div className="mt-3 flex-1 overflow-auto">
                <p className="text-xs text-gray-500 mb-1">미리보기 ({preview.length}명)</p>
                <table className="w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {tenant.bulkPastePreviewHeaders.map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1">{r.phone}</td>
                        <td className="px-2 py-1">{r.series || '-'}</td>
                        <td className="px-2 py-1">{r.exam_number || '-'}</td>
                        <td className="px-2 py-1">{r.gender || '-'}</td>
                        <td className="px-2 py-1">{r.region || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bulkMsg && (
              <p className={`mt-2 text-sm ${bulkMsg.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>{bulkMsg}</p>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowBulk(false)} className="flex-1 py-2.5 border border-gray-300 text-sm text-gray-600">닫기</button>
              <button
                onClick={handleBulkImport}
                disabled={bulkLoading || preview.length === 0}
                className="flex-1 py-2.5 text-sm text-white font-medium disabled:opacity-50"
                style={{ background: 'var(--theme)' }}
              >
                {bulkLoading ? '등록 중...' : `${preview.length}명 등록`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white p-6 w-full max-w-md border border-gray-200" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editId ? '학생 수정' : '학생 추가'}</h2>
            <div className="flex flex-col gap-3">
              {(tenant.editFormFields as [keyof typeof form, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 text-sm focus:outline-none focus:border-blue-900" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} disabled={saving} className="flex-1 py-2.5 border border-gray-300 text-sm text-gray-600 disabled:opacity-50">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm text-white font-medium disabled:opacity-60" style={{ background: 'var(--theme)' }}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
