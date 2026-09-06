'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAdminMemoDate, type EnrollmentAdminMemo } from '@/lib/enrollment-admin-memo'
import { getTenantType, withTenantPrefix } from '@/lib/tenant'
import type { Enrollment } from '@/types/database'

type MemoMap = Record<number,EnrollmentAdminMemo|null>
type State = { key:string; status:'loading'|'ready'|'error'; memos:MemoMap }

export function useEnrollmentAdminMemos(rows:Enrollment[]) {
  const courseId=rows[0]?.course_id
  const ids=rows.map(row=>row.id).sort((a,b)=>a-b).join(',')
  const key=`${courseId}:${ids}`
  const [state,setState]=useState<State>({key:'',status:'loading',memos:{}})
  const edits=useRef<MemoMap>({})
  useEffect(()=>{
    const controller=new AbortController()
    edits.current={}
    setState({key,status:ids?'loading':'ready',memos:{}})
    if(!ids || !courseId)return ()=>controller.abort()
    void (async()=>{
      try {
        const response=await fetch(withTenantPrefix(`/api/courses/${courseId}/admin-memos?ids=${ids}`,getTenantType()),{cache:'no-store',signal:controller.signal})
        const data=await response.json()
        if(!response.ok || !Array.isArray(data.memos))throw new Error('Memo list unavailable')
        if(controller.signal.aborted)return
        const memos=Object.fromEntries(data.memos.map((memo:EnrollmentAdminMemo)=>[memo.enrollment_id,memo]))
        setState({key,status:'ready',memos:{...memos,...edits.current}})
      } catch {
        if(!controller.signal.aborted)setState(current=>({...current,key,status:'error'}))
      }
    })()
    return ()=>controller.abort()
  },[key,courseId,ids])
  const update=useCallback((id:number,memo:EnrollmentAdminMemo|null)=>{
    edits.current[id]=memo
    setState(current=>current.key===key?{...current,memos:{...current.memos,[id]:memo}}:current)
  },[key])
  return {state:state.key===key?state:{key,status:'loading' as const,memos:{} as MemoMap},update}
}

export function StudentMemoCell({enrollment,memo,status,onOpen}:{enrollment:Enrollment;memo:EnrollmentAdminMemo|null|undefined;status:State['status'];onOpen:()=>void}) {
  const known=memo!==undefined
  const loading=!known&&status==='loading'
  const failed=!known&&status==='error'
  return <button type="button" className="admin-memo-preview" disabled={loading}
    aria-label={`${enrollment.name} 메모 ${memo?'수정 및 삭제':'추가'}`} onClick={onOpen}>
    {memo ? <><span className="admin-memo-preview-text">{memo.body}</span>
      <time dateTime={memo.updated_at}>{memo.revision===1?'작성':'수정'} {formatAdminMemoDate(memo.updated_at)}</time></>
      : <span className="admin-memo-preview-empty">{loading?'불러오는 중…':failed?'메모 확인 · 다시 불러오기':'+ 메모 추가'}</span>}
  </button>
}
