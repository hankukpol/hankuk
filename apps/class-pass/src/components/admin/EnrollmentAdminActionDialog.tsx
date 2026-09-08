'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmationModal } from './confirmation-modal'
import type { EnrollmentAdminAction, EnrollmentAdminPreview } from '@/lib/enrollments/admin-action'

const labels: Record<EnrollmentAdminAction, string> = {
  resume: '수강 재개', archive: '명단 숨김', restore: '명단 복원', purge: '오등록 완전 삭제',
}

export function EnrollmentAdminActionDialog({ enrollmentId, action, onClose }: {
  enrollmentId: number; action: EnrollmentAdminAction; onClose: () => void
}) {
  const [preview, setPreview] = useState<EnrollmentAdminPreview | null>(null)
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState(false)
  const inFlight = useRef(false)
  const request = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/enrollments/${enrollmentId}/admin-action`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || '정보를 불러오지 못했습니다.')
        if (!cancelled) setPreview(body.preview)
      }).catch(() => { if (!cancelled) setError('정보를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.') })
    return () => { cancelled = true }
  }, [enrollmentId])

  async function submit() {
    if (!preview || inFlight.current || saved) return
    inFlight.current = true
    setBusy(true); setError('')
    request.current ??= { action, reason: reason.trim(), confirmText, mistakenPaymentConfirmed: confirmed,
      revision: preview.revision, requestId: crypto.randomUUID() }
    try {
      const response = await fetch(`/api/enrollments/${enrollmentId}/admin-action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.current),
      })
      const body = await response.json()
      if (!response.ok) {
        if (response.status < 500) { request.current = null; setUncertain(false) }
        else setUncertain(true)
        setError(body.error || '작업 결과를 확인하지 못했습니다.'); return
      }
      if (body.result?.success !== true || body.result?.action !== action || body.result?.enrollmentId !== enrollmentId) {
        throw new Error('Unexpected result')
      }
      setSaved(true)
      window.location.reload()
    } catch {
      setUncertain(true)
      setError('결과를 확인하지 못했습니다. 입력을 바꾸지 말고 같은 요청으로 다시 확인해 주세요.')
    } finally { inFlight.current = false; setBusy(false) }
  }

  const purge = action === 'purge'
  const allowed = preview && (action !== 'resume' || (!preview.archived && ['cancelled', 'refunded'].includes(preview.status)))
    && (!purge || preview.canPurge)
  return <ConfirmationModal open title={`${labels[action]}를 진행할까요?`}
    description={preview ? `${preview.examNumber} ${preview.name}\n${preview.courseName}` : '최신 기록을 확인하고 있습니다.'}
    confirmLabel={saved ? '저장 완료' : uncertain ? '같은 요청 다시 확인' : labels[action]}
    tone={purge || action === 'archive' ? 'danger' : 'default'} submitting={busy}
    confirmDisabled={saved || !allowed || !reason.trim() || (purge && (!confirmed || confirmText.trim() !== `${preview?.examNumber} ${preview?.name}`.trim()))}
    onClose={onClose} onConfirm={() => { void submit() }} panelClassName="max-w-lg">
    <div className="space-y-4">
      <p className={`admin-notice ${purge ? 'admin-notice-danger' : 'admin-notice-warning'}`}>
        {action === 'resume' ? '기존 결제·취소·종료 이력을 보존하고 수강을 재개합니다. 결제는 생성되지 않으며 재개 후 수납 추가로 기록하세요.'
          : action === 'archive' ? '현재 강좌 명단에서 숨깁니다. 수강중이면 수강도 종료됩니다. 결제·출결 기록은 남고 숨긴 명단에서 복원할 수 있습니다.'
            : action === 'restore' ? '명단에 다시 표시합니다. 수강 상태는 바뀌지 않습니다. 수강이 필요하면 복원 후 수강 재개를 선택하세요.'
              : '현재 강좌의 잘못된 등록과 결제 기록만 영구 삭제합니다. 다른 강좌와 학생 기본정보는 유지합니다. 환불이나 실제 카드 취소를 실행하는 기능이 아닙니다. 삭제 사유·처리자·금액 합계는 감사 기록으로 남습니다.'}
      </p>
      {purge && preview && <>
        <p>연결 결제 {preview.paymentCount}건 · 입력 금액 합계 {preview.paymentAmount.toLocaleString()}원</p>
        {!preview.canPurge && <p role="alert" className="admin-notice admin-notice-danger">이용·환불·정산 또는 연결 이력이 있어 완전 삭제할 수 없습니다. 명단 숨김을 이용하세요.</p>}
        <label className="admin-material-field"><span className="admin-material-label">삭제 확인: {preview.examNumber} {preview.name}</span>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={busy || uncertain || saved} autoComplete="off" />
        </label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy || uncertain || saved} />
          실제 이용·수납이 아닌 잘못 입력한 기록이며, 다른 학생에게 옮길 결제 기록이 아님을 확인했습니다.</label>
      </>}
      <label className="admin-material-field"><span className="admin-material-label">처리 사유 (필수)</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} disabled={busy || uncertain || saved} />
      </label>
      {error && <p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
      {saved && <p role="status">저장됐습니다. 화면이 갱신되지 않으면 새로고침해 주세요.</p>}
    </div>
  </ConfirmationModal>
}
