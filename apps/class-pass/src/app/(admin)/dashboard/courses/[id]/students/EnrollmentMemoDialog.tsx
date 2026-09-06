'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AdminDrawerSurface } from '@/components/admin/AdminDrawer'
import { AdminPortal } from '@/components/admin/AdminPortal'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
import { ADMIN_MEMO_MAX_LENGTH, formatAdminMemoDate, type EnrollmentAdminMemo } from '@/lib/enrollment-admin-memo'
import { getUserErrorMessage } from '@/lib/user-error-message'
import { getTenantType, withTenantPrefix } from '@/lib/tenant'
import type { Enrollment } from '@/types/database'

type Props = {
  enrollment: Pick<Enrollment,'id'|'course_id'|'name'|'exam_number'>
  courseName: string
  onClose: () => void
  onChange?: (id:number,memo:EnrollmentAdminMemo|null) => void
}

/** Mounted with enrollment.id as its key: one draft and request lifecycle per enrollment. */
export function EnrollmentMemoDialog({enrollment,courseName,onClose,onChange}: Props) {
  const titleId = useId()
  const fieldId = useId()
  const [memo,setMemo] = useState<EnrollmentAdminMemo|null>(null)
  const [draft,setDraft] = useState('')
  const [loading,setLoading] = useState(true)
  const [loaded,setLoaded] = useState(false)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [conflict,setConflict] = useState(false)
  const [reload,setReload] = useState(0)
  const [discard,setDiscard] = useState<'close'|'reload'|null>(null)
  const [confirmDelete,setConfirmDelete] = useState(false)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  const dirty = loaded && draft !== (memo?.body ?? '')
  const endpoint = withTenantPrefix(`/api/enrollments/${enrollment.id}/admin-memo?courseId=${enrollment.course_id}`,getTenantType())

  function requestClose() {
    if(savingRef.current) return
    setConfirmDelete(false)
    if(dirty) setDiscard('close')
    else onClose()
  }

  useEffect(()=>{
    mounted.current=true
    return ()=>{mounted.current=false}
  },[])
  useEffect(()=>{
    const controller=new AbortController()
    setLoading(true);setLoaded(false);setError('');setMessage('');setConflict(false)
    void (async()=>{
      try {
        const response=await fetch(endpoint,{cache:'no-store',signal:controller.signal})
        const data=await response.json()
        if(!response.ok) throw new Error(data.error || '메모를 불러오지 못했습니다.')
        if(controller.signal.aborted) return
        setMemo(data.memo);setDraft(data.memo?.body??'');setLoaded(true)
        onChange?.(enrollment.id,data.memo)
      } catch(reason) {
        if(!controller.signal.aborted) setError(getUserErrorMessage(reason,'메모를 불러오지 못했습니다. 다시 시도해 주세요.'))
      } finally {if(!controller.signal.aborted)setLoading(false)}
    })()
    return ()=>controller.abort()
  },[endpoint,reload,enrollment.id,onChange])

  async function save(event:FormEvent) {
    event.preventDefault()
    if(savingRef.current || !loaded || conflict || confirmDelete || !dirty || !draft.trim()) return
    savingRef.current=true;setSaving(true);setError('');setMessage('');setDiscard(null)
    try {
      const response=await fetch(endpoint,{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({courseId:enrollment.course_id,body:draft,expectedRevision:memo?.revision??null,expectedCreatedAt:memo?.created_at??null}),
      })
      const data=await response.json()
      if(!mounted.current)return
      if(response.status===409)setConflict(true)
      if(!response.ok || !data.memo)throw new Error(data.error || '메모를 저장하지 못했습니다.')
      setMemo(data.memo);setDraft(data.memo.body);setMessage('메모를 저장했습니다.')
      onChange?.(enrollment.id,data.memo)
    } catch(reason) {
      if(mounted.current)setError(getUserErrorMessage(reason,'메모를 저장하지 못했습니다. 입력 내용은 유지됩니다.'))
    } finally {
      savingRef.current=false
      if(mounted.current)setSaving(false)
    }
  }

  async function remove() {
    if(savingRef.current || !memo || conflict)return
    savingRef.current=true;setSaving(true);setError('');setMessage('')
    try {
      const response=await fetch(endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({courseId:enrollment.course_id,expectedRevision:memo.revision,expectedCreatedAt:memo.created_at})})
      const data=await response.json()
      if(!mounted.current)return
      if(response.status===409)setConflict(true)
      if(!response.ok)throw new Error(data.error || '메모를 삭제하지 못했습니다.')
      setMemo(null);setDraft('');setConfirmDelete(false);setMessage('메모를 삭제했습니다.')
      onChange?.(enrollment.id,null)
    } catch(reason) {
      if(mounted.current){setConfirmDelete(false);setError(getUserErrorMessage(reason,'메모를 삭제하지 못했습니다. 다시 시도해 주세요.'))}
    } finally {
      savingRef.current=false
      if(mounted.current)setSaving(false)
    }
  }

  return <><AdminPortal><AdminDrawerSurface labelledBy={titleId} priority={50}
    onClose={requestClose} closeDisabled={saving} onSubmit={save}>
      <header className="admin-dialog-header">
        <div><h2 id={titleId} className="admin-dialog-title">학생 메모</h2>
          <p className="admin-memo-student">{enrollment.name} ({enrollment.exam_number || '수험번호 없음'})</p>
          <p className="admin-memo-course">{courseName}</p></div>
        <AdminDialogClose disabled={saving} onClick={requestClose} />
      </header>
      <div className="admin-dialog-body admin-memo-body" aria-busy={loading||saving}>
        <p className="admin-memo-help">이 강좌에서만 사용하는 관리자 전용 메모입니다. 학생에게는 표시되지 않습니다.</p>
        {loading ? <p role="status">메모를 불러오는 중...</p> : <>
          {loaded ? <>
            <div className="admin-memo-field">
            <label htmlFor={fieldId}>메모 내용</label>
            <textarea id={fieldId} aria-describedby={`${fieldId}-meta`} value={draft} maxLength={ADMIN_MEMO_MAX_LENGTH} disabled={saving||confirmDelete}
              onChange={event=>{setDraft(event.target.value);setMessage('')}} placeholder="상담 내용, 안내 사항 등을 기록하세요." />
            </div>
            <div id={`${fieldId}-meta`} className="admin-memo-meta">
              <span>{memo ? <>최초 작성 <time dateTime={memo.created_at}>{formatAdminMemoDate(memo.created_at)}</time><br />
                최근 수정 <time dateTime={memo.updated_at}>{formatAdminMemoDate(memo.updated_at)}</time></> : '아직 저장된 메모가 없습니다.'}</span>
              <span>{draft.length.toLocaleString('ko-KR')} / 2,000자</span>
            </div>
          </> : null}
          {error ? <div className="admin-memo-error" role="alert"><p>{error}</p>
            {!loaded || conflict ? <button type="button" className="admin-button" onClick={()=>dirty?setDiscard('reload'):setReload(n=>n+1)}>
              {conflict?'최신 메모 불러오기':'다시 불러오기'}</button> : null}</div> : null}
          {message ? <p role="status" className="admin-memo-success">{message}</p> : null}
        </>}
      </div>
      <footer className="admin-dialog-footer admin-memo-footer">
        {memo ? <button type="button" className="admin-button admin-memo-delete" disabled={saving||loading||conflict||confirmDelete} onClick={()=>{setDiscard(null);setMessage('');setConfirmDelete(true)}}>메모 삭제</button> : null}
        <div className="admin-memo-footer-actions">
        <button type="button" className="admin-button" disabled={saving} onClick={requestClose}>취소</button>
        <button type="submit" className="admin-button admin-button-primary" disabled={loading||saving||!loaded||!dirty||!draft.trim()||conflict||confirmDelete}>
          {saving?'저장 중...':'메모 저장'}</button>
        </div>
      </footer>
  </AdminDrawerSurface></AdminPortal>
  <ConfirmationModal open={discard !== null} title="저장하지 않은 내용이 있습니다"
    description={discard === 'close' ? '내용을 버리고 닫을까요?' : '내용을 버리고 최신 메모를 불러올까요?'}
    cancelLabel="계속 작성" confirmLabel={discard === 'close' ? '버리고 닫기' : '버리고 불러오기'}
    onClose={() => setDiscard(null)} onConfirm={() => {
      const intent = discard
      setDiscard(null)
      if (intent === 'close') onClose()
      else setReload(n => n + 1)
    }} />
  <ConfirmationModal open={confirmDelete} title="학생 메모를 삭제할까요?"
    description={`${courseName} · ${enrollment.name} 학생의 저장된 메모와 현재 입력 내용이 지워집니다. 수강 정보는 삭제되지 않습니다.`}
    cancelLabel="삭제 취소" confirmLabel="메모 삭제 확인" pendingLabel="삭제 중..." tone="danger" submitting={saving}
    onClose={() => { if (!savingRef.current) setConfirmDelete(false) }} onConfirm={() => void remove()} />
  </>
}
