"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/lib/sonner";
import type { correctAcademyApplicationDate } from "@/lib/services/academy-application-date.service";
type Preview = Awaited<ReturnType<typeof correctAcademyApplicationDate>>;
type Audit = {id:string;changedAt:string;changedByName:string;changes:{field:string;before:unknown;after:unknown}[]};
export function ApplicationDateCorrection({divisionSlug, application, onSaved}:{divisionSlug:string;application:{id:string;effectiveFrom:string;templateName:string};onSaved:()=>Promise<unknown>}) {
  const [open,setOpen]=useState(false),[date,setDate]=useState(application.effectiveFrom),[reason,setReason]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null),[audit,setAudit]=useState<Audit[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function post(action:string,value?:unknown) {
    const res=await fetch(`/api/${divisionSlug}/settings/templates`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,value})});
    const body=await res.json();if(!res.ok)throw new Error(body.error??"정정하지 못했습니다.");return body;
  }
  async function submit() {
    if(busy)return;setBusy(true);setError("");
    try {
      const result=await post(preview?"date-apply":"date-preview",{id:application.id,effectiveFrom:date,reason,...(preview?{revision:preview.revision}:{})});
      if(preview){await onSaved();setOpen(false);toast.success("적용일을 정정했습니다. 기존 출결·점수는 보존됩니다.");}
      else setPreview(result);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <><button type="button" className="admin-button admin-button-secondary" onClick={()=>{
    setDate(application.effectiveFrom);setReason("");setPreview(null);setError("");setAudit([]);setOpen(true);
    void post("date-history").then(setAudit).catch(e=>setError(e.message));
  }}>적용일 정정</button><Modal open={open} title="적용일 정정" onClose={()=>{if(!busy)setOpen(false);}} footer={<>
    <button className="admin-button admin-button-secondary" disabled={busy} onClick={()=>setOpen(false)}>취소</button>
    <button className="admin-button admin-button-primary" disabled={busy||!date||!reason.trim()||date===application.effectiveFrom} onClick={()=>void submit()}>{preview?"정정 적용":"정정 미리보기"}</button>
  </>}><div className="space-y-4"><p>{application.templateName} · 기존 적용일 {application.effectiveFrom}</p>
    <label className="admin-field"><span>정정 적용일</span><input type="date" value={date} disabled={busy} onChange={e=>{setDate(e.target.value);setPreview(null);}}/></label>
    <label className="admin-field"><span>정정 사유</span><textarea value={reason} maxLength={500} disabled={busy} onChange={e=>{setReason(e.target.value);setPreview(null);}}/></label>
    <p className="admin-help">설정 내용은 그대로 두고 적용일만 정정합니다. 기존 출결·상벌점·수납·좌석 배정은 변경하지 않습니다. 이미 채점한 시험의 출석은 별도 재동기화가 필요합니다.</p>
    {preview&&<div className="admin-table-frame"><table><thead><tr><th>기존 적용일</th><th>정정 적용일</th><th>판정 기준이 달라지는 기간</th></tr></thead><tbody><tr><td>{preview.before}</td><td>{preview.after}</td><td>{preview.affectedFrom} ~ {preview.affectedUntil}</td></tr></tbody></table></div>}
    {error&&<p role="alert" className="admin-notice">{error}</p>}
    {audit.filter(a=>a.changes.some(c=>c.field===`application:${application.id}:effectiveFrom`)).map(a=><p key={a.id} className="admin-help">{a.changedAt.slice(0,10)} · {a.changedByName} · {String(a.changes[0].before)} → {String(a.changes[0].after)} · {String(a.changes[1]?.after??"")}</p>)}
  </div></Modal></>;
}
