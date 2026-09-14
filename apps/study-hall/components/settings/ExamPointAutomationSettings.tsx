"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { toast } from "@/lib/sonner";
import { EXAM_POINT_RULE_FIELDS, examPointAutomationSchema, type ExamPointAutomation, type ExamPointRuleField } from "@/lib/exam-point-automation";

type Rule = { id: string; name: string; points: number; isActive: boolean };
export function ExamPointAutomationSettings({divisionSlug}: {divisionSlug: string}) {
  const [form, setForm] = useState<ExamPointAutomation | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const url = `/api/${divisionSlug}/settings/exam-points`;
  useEffect(()=>{
    const abort = new AbortController();
    setForm(null); setError("");
    void fetch(url, {cache:"no-store",signal:abort.signal}).then(async response=>{
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "설정을 불러오지 못했습니다.");
      setForm(body.config); setRules(body.rules);
    }).catch(cause=>{ if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "설정을 불러오지 못했습니다."); });
    return ()=>abort.abort();
  }, [url,revision]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = examPointAutomationSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(url, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data)});
      const body = await response.json();
      if(!response.ok) throw new Error(body.error ?? "설정을 저장하지 못했습니다.");
      setForm(body.config); toast.success("자동 상벌점 설정을 저장했습니다.");
    } catch(cause) { setError(cause instanceof Error ? cause.message : "설정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  const update = <K extends keyof ExamPointAutomation>(key: K, value: ExamPointAutomation[K]) => setForm(current=>current ? {...current,[key]:value} : current);
  return <section className="admin-section" id="exam-point-settings" aria-labelledby="exam-point-settings-title">
    <h2 className="admin-section-title" id="exam-point-settings-title">성적·월말 자동 상벌점</h2>
    {error && <p className="admin-notice mt-4" role="alert">{error}</p>}
    {!form ? <div className="mt-4">{error ? <button type="button" className="admin-button admin-button-secondary" onClick={()=>setRevision(value=>value+1)}>다시 불러오기</button> : <p role="status" className="admin-help">설정을 불러오는 중입니다.</p>}</div> : <form onSubmit={save} className="mt-4 space-y-4">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={e=>update("enabled",e.target.checked)}/>자동 상벌점 사용</label>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="block min-w-0"><span className="admin-label mb-2 block">정기·월말 자동 부여 적용일</span><input className="w-full min-w-0" type="date" value={form.effectiveFrom ?? ""} required={form.enabled} onChange={e=>update("effectiveFrom",e.target.value || null)}/></label>
          <label className="block min-w-0"><span className="admin-label mb-2 block">아침모의고사 시작일</span><input className="w-full min-w-0" type="date" value={form.morningStartDate ?? ""} onChange={e=>update("morningStartDate",e.target.value || null)}/><span className="admin-help mt-2 block">시작일을 지정하면 해당 날짜부터 계산합니다. 미지정 시 아침모의고사 자동 부여는 중지됩니다.</span></label>
        </div>
        <fieldset className="min-w-0"><legend className="admin-label mb-2">아침모의고사 요일</legend><div className="flex flex-wrap gap-x-4">{["월","화","수","목","금"].map((label,offset)=>{ const index=offset+1; return <label key={label} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.morningWeekdays.includes(index)} onChange={e=>update("morningWeekdays",e.target.checked ? [...form.morningWeekdays,index].sort() : form.morningWeekdays.filter(day=>day!==index))}/>{label}</label>; })}</div></fieldset>
        <details className="admin-disclosure"><summary>아침모의고사 휴강일 ({form.morningExcludedDates.length}일)</summary><div className="space-y-4 p-4">{form.morningExcludedDates.map((day,index)=><div key={index} className="flex min-w-0 gap-2"><input type="date" aria-label={`휴강일 ${index+1}`} className="min-w-0 flex-1" value={day} required onChange={e=>update("morningExcludedDates",form.morningExcludedDates.map((value,i)=>i===index ? e.target.value : value))}/><button type="button" className="admin-button admin-button-secondary" aria-label={`휴강일 ${index+1} 삭제`} onClick={()=>update("morningExcludedDates",form.morningExcludedDates.filter((_,i)=>i!==index))}>삭제</button></div>)}<button className="admin-button admin-button-secondary" type="button" onClick={()=>update("morningExcludedDates",[...form.morningExcludedDates,""])}>휴강일 추가</button></div></details>
        <details className="admin-disclosure"><summary>자동 부여 규칙</summary><div className="grid min-w-0 gap-4 p-4 md:grid-cols-2">{(Object.entries(EXAM_POINT_RULE_FIELDS) as [ExamPointRuleField,string][]).map(([key,label])=><label className="block min-w-0" key={key}><span className="admin-label mb-2 block">{label}</span><select className="w-full min-w-0" value={form[key] ?? ""} onChange={e=>update(key,e.target.value || null)}><option value="">부여 안 함</option>{rules.filter(rule=>(key.includes("Absence") ? rule.points<0 : rule.points>0)).map(rule=><option key={rule.id} value={rule.id} disabled={!rule.isActive}>{rule.name} ({rule.points>0?"+":""}{rule.points}점){rule.isActive?"":" · 비활성"}</option>)}</select></label>)}</div></details>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.settleUnusedLeaveAutomatically} onChange={e=>update("settleUnusedLeaveAutomatically",e.target.checked)}/>휴일권 미사용 상점 자동 월 마감</label>
        <p className="admin-help">변경한 설정은 이번 달과 지난달 성적에 반영됩니다.</p><button className="admin-button admin-button-primary" type="submit"><Save className="h-4 w-4"/>{saving ? "저장 중…" : "자동 상벌점 저장"}</button>
      </fieldset>
    </form>}
  </section>;
}
