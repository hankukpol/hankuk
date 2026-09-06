'use client'

import { useRef, useState } from 'react'
import { AdminDrawerPanel } from '@/components/admin/AdminDrawer'
import { AdminPortal } from '@/components/admin/AdminPortal'
import { buildMaterialSeriesNames, suggestNextMaterialSeries } from '@/lib/distribution/material-series'
import { getUserErrorMessage } from '@/lib/user-error-message'
import type { CourseSubject, Material } from '@/types/database'

type Props = {
  courseId: number
  source: Material | null
  subjects: CourseSubject[]
  onClose: () => void
  onCreated: (materials: Material[], warning?: string) => void
}

const fieldClass = 'admin-material-control'

export function MaterialSeriesModal({ courseId, source, subjects, onClose, onCreated }: Props) {
  const [form, setForm] = useState(() => suggestNextMaterialSeries(source?.name))
  const [description, setDescription] = useState('')
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  let names: string[] = []
  let validationError = ''
  try {
    names = buildMaterialSeriesNames(form.pattern, form.start, form.end)
  } catch (reason) {
    validationError = getUserErrorMessage(reason)
  }
  const sourceSubject = source?.subject_id == null
    ? '전체 배부 (좌석 무관)'
    : `${subjects.find((subject) => subject.id === source.subject_id)?.name ?? '지정 과목'} 좌석 배정자만`

  async function handleCreate() {
    if (inFlight.current) return
    if (validationError) { setError(validationError); return }
    inFlight.current = true
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/materials/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          sourceMaterialId: source?.id,
          namePattern: form.pattern,
          startRound: form.start,
          endRound: form.end,
          ...(source ? {} : { description, subjectId }),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? '자료를 생성하지 못했습니다.')
      if (!Array.isArray(payload?.materials) || payload.materials.length !== names.length) {
        throw new Error('저장 결과를 확인하지 못했습니다. 창을 닫고 목록을 새로고침해 확인해 주세요.')
      }
      onCreated(payload.materials as Material[], payload.warning)
    } catch (reason) {
      setError(`${getUserErrorMessage(reason)} 저장 여부가 불확실하면 창을 닫고 목록을 새로고침한 뒤 다시 시도해 주세요.`)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <AdminPortal><AdminDrawerPanel
      title={source ? '지난 자료로 다음 회차 만들기' : '배부자료 여러 회차 만들기'}
      description="새 회차는 비활성 상태로 생성됩니다. 기존 수령 기록은 복사하지 않습니다."
      closeDisabled={submitting} onClose={onClose}
      onSubmit={event => { event.preventDefault(); void handleCreate() }}
      footer={<>
        <button type="button" className="admin-button" disabled={submitting} onClick={onClose}>취소</button>
        <button type="submit" className="admin-button admin-button-primary" disabled={submitting || Boolean(validationError)}>
          {submitting ? '생성 중...' : validationError ? '회차 입력 확인' : `${names.length}개 회차 생성`}
        </button>
      </>}
    >
      <fieldset disabled={submitting} className="admin-material-fields">
        {source ? (
          <div className="grid gap-2">
            <p className="admin-material-name">원본: {source.name}</p>
            <p className="admin-material-help">배부 대상: {sourceSubject}</p>
          </div>
        ) : null}
        <label className="admin-material-field">
          <span className="admin-material-label">이름 규칙</span>
          <input className={fieldClass} maxLength={110} value={form.pattern}
            onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))} />
          <span className="admin-material-help">예: 경찰학 {'{회차}'}회차 프린트</span>
        </label>
        <div className="admin-material-field-pair">
          <label className="admin-material-field">
            <span className="admin-material-label">시작 회차</span>
            <input className={fieldClass} type="number" min={1} max={999} value={form.start || ''}
              onChange={(event) => setForm((current) => ({ ...current, start: Number(event.target.value) }))} />
          </label>
          <label className="admin-material-field">
            <span className="admin-material-label">마지막 회차</span>
            <input className={fieldClass} type="number" min={1} max={999} value={form.end || ''}
              onChange={(event) => setForm((current) => ({ ...current, end: Number(event.target.value) }))} />
          </label>
        </div>
        {!source ? (
          <>
            <label className="admin-material-field">
              <span className="admin-material-label">공통 설명</span>
              <textarea className={fieldClass} rows={2} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="admin-material-field">
              <span className="admin-material-label">배부 대상 과목</span>
              <select className={fieldClass} value={subjectId ?? ''} onChange={(event) => setSubjectId(event.target.value ? Number(event.target.value) : null)}>
                <option value="">전체 배부 (좌석 무관)</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} 좌석 배정자만</option>)}
              </select>
            </label>
          </>
        ) : null}
        <div className="grid min-w-0 gap-2" aria-live="polite">
          <p className="admin-material-label">생성 미리보기 ({names.length}개, 최대 52개)</p>
          {validationError ? <p className="admin-material-notice text-red-600">{validationError}</p> : (
            <ul className="admin-material-preview" tabIndex={0} aria-label="생성될 자료 이름">
              {names.map((name) => <li key={name}>{name}</li>)}
            </ul>
          )}
        </div>
        {error ? <p role="alert" className="admin-material-notice text-red-600">{error}</p> : null}
      </fieldset>
    </AdminDrawerPanel></AdminPortal>
  )
}
