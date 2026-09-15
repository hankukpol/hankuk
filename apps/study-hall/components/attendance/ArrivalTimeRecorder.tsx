"use client";
import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { hasPendingCheckChanges } from "@/lib/check-navigation";
import { toast } from "@/lib/sonner";
export function ArrivalTimeRecorder({ divisionSlug, date, students, periods, initialPeriodId }: { divisionSlug:string; date:string; students:{id:string;name:string;studentNumber:string}[]; periods:{id:string;name:string;isActive:boolean}[]; initialPeriodId?:string }) {
  const [open,setOpen]=useState(false),[studentId,setStudentId]=useState(""),[periodId,setPeriodId]=useState(initialPeriodId??""),[time,setTime]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save() {
    if(busy)return;setBusy(true);setError("");
    try {
      const res=await fetch("/api/"+divisionSlug+"/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,periodId,records:[{studentId,status:"PRESENT",arrivalTime:time}]})}), body=await res.json();
      if(!res.ok)throw new Error(body.error??"도착 시각을 저장하지 못했습니다.");
      window.location.reload();
    } catch(err){setError((err as Error).message);setBusy(false);}
  }
  return <><button type="button" className="admin-text-action" onClick={()=>{if(hasPendingCheckChanges()){toast.error("입력 중인 출결을 먼저 저장해 주세요.");return;}setPeriodId(initialPeriodId??periods.find(p=>p.isActive)?.id??"");setError("");setOpen(true);}}>도착 시각 기록</button>
    <SlideOver open={open} title="도착 시각 기록" description={date+" · 학원의 지각 분 기준으로 출석·지각을 판정합니다."} onClose={()=>{if(!busy)setOpen(false);}} footer={<button type="submit" form="attendance-arrival-form" className="admin-button admin-button-primary" disabled={busy}>판정·저장</button>}>
      <form id="attendance-arrival-form" className="admin-form-grid" onSubmit={e=>{e.preventDefault();void save();}}>
        <label className="admin-field"><span>학생</span><select required value={studentId} disabled={busy} onChange={e=>setStudentId(e.target.value)}><option value="">학생 선택</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.studentNumber}</option>)}</select></label>
        <label className="admin-field"><span>교시</span><select required value={periodId} disabled={busy} onChange={e=>setPeriodId(e.target.value)}><option value="">교시 선택</option>{periods.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="admin-field"><span>실제 도착 시각</span><input type="time" required value={time} disabled={busy} onChange={e=>setTime(e.target.value)}/></label>
        {error&&<p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
      </form>
    </SlideOver></>;
}
