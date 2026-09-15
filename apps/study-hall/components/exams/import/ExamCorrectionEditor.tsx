"use client";
import { useEffect, useRef, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import type { CorrectionBundle, CorrectionAudit, CorrectionInput } from "@/lib/exam-correction";
type Data={bundle:CorrectionBundle;revision:string;history:CorrectionAudit[]};
type Props={divisionSlug:string;sessionId:string;onClose:()=>void;onSaved:()=>void};
export function ExamCorrectionEditor({divisionSlug,sessionId,onClose,onSaved}:Props) {
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState("");
  const [studentId,setStudentId]=useState(""),[target,setTarget]=useState(""),[reason,setReason]=useState(""),[rows,setRows]=useState<CorrectionInput["responses"]>([]),[review,setReview]=useState(false),[query,setQuery]=useState("");
  const lock=useRef(false);
  const url=`/api/${encodeURIComponent(divisionSlug)}/exam-imports/${encodeURIComponent(sessionId)}/corrections`;
  useEffect(()=>{const controller=new AbortController();void fetch(url,{cache:"no-store",signal:controller.signal}).then(async r=>{const value=await r.json();if(!r.ok) throw new Error(value.error);setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[url]);
  function select(id:string) {
    setStudentId(id);setTarget(id);setReason("");setReview(false);setError("");setSaved("");
    setRows(data?.bundle.responses.filter(r=>r.studentId===id).map(({subjectId,itemNo,answer,isCorrect})=>({subjectId,itemNo,answer,isCorrect}))??[]);
  }
  const original=data?.bundle.participants.find(p=>p.studentId===studentId);
  const targetName=data?.bundle.students.find(s=>s.id===target),currentName=data?.bundle.students.find(s=>s.id===studentId);
  const total=Math.round(rows.reduce((sum,row)=>sum+(row.isCorrect ? data?.bundle.items.find(i=>i.subjectId===row.subjectId && i.itemNo===row.itemNo)?.points??0:0),0)*1e6)/1e6;
  const changedRows=rows.filter(row=>{const old=data?.bundle.responses.find(r=>r.studentId===studentId && r.subjectId===row.subjectId && r.itemNo===row.itemNo);return old?.answer!==row.answer || old?.isCorrect!==row.isCorrect;});
  const changed=studentId!==target || changedRows.length>0;
  async function save() {
    if(!data || lock.current)return;lock.current=true;setBusy(true);setError("");
    try {
      const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:data.revision,studentId,targetStudentId:target,reason,responses:rows})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      const refreshed=await fetch(url,{cache:"no-store"});if(!refreshed.ok)throw new Error("저장 후 조회하지 못했습니다. 닫고 다시 열어 이력을 확인해 주세요.");
      setData(await refreshed.json());setStudentId("");setReview(false);setRows([]);setReason("");setSaved(`정정 완료 · 자동 상벌점 추가 ${value.grantedCount}건, 취소 ${value.revokedCount}건`);onSaved();
    }catch(e){setError(e instanceof Error?e.message:"정정 결과를 확인하지 못했습니다.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <SlideOver open title="성적 정정" onClose={()=>{if(!busy)onClose();}} footer={<><button type="button" className="admin-button" disabled={busy} onClick={onClose}>닫기</button>{studentId && <button type="button" className="admin-button admin-button-primary" disabled={busy || !changed || reason.trim().length<2 || !target} onClick={()=>review?void save():setReview(true)}>{busy?"저장 중":review?"정정 확정":"변경 확인"}</button>}</>}>
    <div className="admin-flat-page">
      {error && <p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
      {saved && <p role="status" className="admin-notice admin-notice-success">{saved}</p>}
      {!data ? <p role="status">성적을 불러오는 중입니다.</p> : <>
        <p>{data.bundle.session.examDate} · {data.bundle.session.topic??"시험 성적"}</p>
        <label className="admin-field">학생 검색<input className="admin-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="이름 또는 수험번호" disabled={busy}/></label>
        <label className="admin-field">정정할 성적<select className="admin-select" value={studentId} disabled={busy} onChange={e=>select(e.target.value)}><option value="">학생 선택</option>{data.bundle.students.filter(s=>data.bundle.participants.some(p=>p.studentId===s.id) && (s.id===studentId || `${s.name} ${s.studentNumber}`.includes(query))).map(s=><option key={s.id} value={s.id}>{s.name} · {s.studentNumber}</option>)}</select></label>
        {original && <fieldset disabled={busy} className="space-y-4 min-w-0">
          <label className="admin-field">실제 응시 학생<select className="admin-select" value={target} onChange={e=>{setTarget(e.target.value);setReview(false);}}>{data.bundle.students.map(s=><option key={s.id} value={s.id} disabled={s.id!==studentId && data.bundle.participants.some(p=>p.studentId===s.id)}>{s.name} · {s.studentNumber}{s.id!==studentId && data.bundle.participants.some(p=>p.studentId===s.id)?" (성적 있음)":""}</option>)}</select></label>
          <div className="admin-table-frame"><table className="w-full table-fixed"><colgroup><col className="w-2/5"/><col className="w-1/4"/><col/></colgroup><thead><tr><th scope="col">과목·문항</th><th scope="col">답안</th><th scope="col">채점</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.subjectId}:${row.itemNo}`}><th scope="row">{data.bundle.subjects.find(s=>s.id===row.subjectId)?.name??"과목"} {row.itemNo}번</th><td><input className="admin-input" aria-label={`${row.itemNo}번 답안`} value={row.answer??""} maxLength={20} onChange={e=>{setRows(rows.map((r,i)=>i===index?{...r,answer:e.target.value||null}:r));setReview(false);}}/></td><td><select className="admin-select" aria-label={`${row.itemNo}번 채점`} value={row.isCorrect?"correct":"wrong"} onChange={e=>{setRows(rows.map((r,i)=>i===index?{...r,isCorrect:e.target.value==="correct"}:r));setReview(false);}}><option value="correct">정답</option><option value="wrong">오답</option></select></td></tr>)}</tbody></table></div>
          <p>총점 {original.totalScore} → {total}</p>
          <label className="admin-field">정정 사유<textarea className="admin-textarea" value={reason} maxLength={1000} onChange={e=>{setReason(e.target.value);setReview(false);}} placeholder="예: 수험번호 오마킹, 5번 판독 오류"/></label>
          {review && <section className="admin-notice"><h3 className="admin-section-title">변경 확인</h3><p>{currentName?.name} ({currentName?.studentNumber}) → {targetName?.name} ({targetName?.studentNumber})</p><p>총점 {original.totalScore} → {total} · 문항 {changedRows.length}개 변경</p><p>{reason}</p><p className="admin-help">성적 분석과 자동 상벌점을 다시 계산합니다. 총점이 바뀌면 기존 외부 석차는 표시하지 않습니다. 외부 평균·정답률은 원본 채점표 기준입니다.</p></section>}
        </fieldset>}
        <section className="admin-section"><h3 className="admin-section-title">정정 이력</h3>{data.history.length===0?<p className="admin-help">정정 이력이 없습니다.</p>:data.history.map(h=><details key={h.id} className="admin-section"><summary>{h.after.studentName} · {new Date(h.createdAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} · {h.actorName}</summary><p>{h.reason}</p><p>{h.before.studentName} ({h.before.studentNumber}) → {h.after.studentName} ({h.after.studentNumber})</p><p>총점 {h.before.totalScore} → {h.after.totalScore}</p><div className="admin-table-frame"><table><thead><tr><th scope="col">과목·문항</th><th scope="col">변경 전</th><th scope="col">변경 후</th></tr></thead><tbody>{h.after.responses.filter(r=>{const b=h.before.responses.find(x=>x.subjectId===r.subjectId && x.itemNo===r.itemNo);return b?.answer!==r.answer || b?.isCorrect!==r.isCorrect;}).map(r=>{const b=h.before.responses.find(x=>x.subjectId===r.subjectId && x.itemNo===r.itemNo);return <tr key={`${r.subjectId}:${r.itemNo}`}><th scope="row">{data.bundle.subjects.find(s=>s.id===r.subjectId)?.name} {r.itemNo}번</th><td>{b?.answer??"무응답"} · {b?.isCorrect?"정답":"오답"}</td><td>{r.answer??"무응답"} · {r.isCorrect?"정답":"오답"}</td></tr>;})}</tbody></table></div></details>)}</section>
      </>}
    </div>
  </SlideOver>;
}
