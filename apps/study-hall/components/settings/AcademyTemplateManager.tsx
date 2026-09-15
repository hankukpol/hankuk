"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CONFIGURATION_GROUPS, CONFIGURATION_LABELS as labels } from "@/lib/academy-template-labels";
import type { AcademyConfiguration } from "@/lib/academy-template";
import type { getAcademyTemplateLibrary, previewAcademyTemplate } from "@/lib/services/academy-template.service";
import { ChangeValue, ConfigurationChanges } from "@/components/settings/ConfigurationChanges";
import { toast } from "@/lib/sonner";
type Library = Awaited<ReturnType<typeof getAcademyTemplateLibrary>> & { common: AcademyConfiguration; blank: AcademyConfiguration; today: string };
type Preview = Awaited<ReturnType<typeof previewAcademyTemplate>>;
export function AcademyTemplateManager({ divisionSlug }: { divisionSlug: string }) {
  const [library, setLibrary] = useState<Library | null>(null), [draft, setDraft] = useState<AcademyConfiguration | null>(null);
  const [name,setName] = useState("우리 학원 운영 설정"), [date,setDate] = useState(""), [selected,setSelected] = useState("current");
  const [preview,setPreview] = useState<Preview | null>(null);
  const [history,setHistory] = useState<{before:AcademyConfiguration;after:AcademyConfiguration}|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const endpoint = "/api/" + divisionSlug + "/settings/templates";
  async function load() {
    const res = await fetch(endpoint, { cache:"no-store" }), body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "템플릿을 불러오지 못했습니다.");
    setLibrary(body); return body as Library;
  }
  useEffect(() => { let active = true; fetch(endpoint,{cache:"no-store"}).then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error); if (active) { setLibrary(body); setDraft(body.current); setDate(body.earliestCalculationDate ?? body.today); } }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [endpoint]);
  async function send(action: string, value?: unknown, id?: string) {
    const res = await fetch(endpoint,{ method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({action,value,id}) }), body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "요청을 처리하지 못했습니다."); return body;
  }
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  function choose(id: string) {
    if (!library) return;
    const saved = library.templates.find(t => t.id === id);
    setSelected(id); setDraft(structuredClone(id === "current" ? library.current : id === "common" ? library.common : id === "blank" ? library.blank : saved!.payload));
    setName(saved?.name ?? (id === "current" ? "우리 학원 운영 설정" : id === "common" ? "공통 운영 템플릿" : "새 운영 템플릿")); setPreview(null);
  }
  if (!library || !draft) return <div className="admin-notice" role="status">{error || "학원 설정을 불러오는 중입니다."}</div>;
  const statusLabels: Record<string,string> = { PENDING:"적용 예약", APPLIED:"적용 완료", REVIEW:"재검토 필요", CANCELLED:"예약 취소" };
  return <div className="admin-flat-page">
    <section className="admin-section"><div className="space-y-4"><div className="grid min-w-0 gap-4 md:grid-cols-2">
      <label className="admin-field"><span>불러올 설정</span><select value={selected} disabled={busy} onChange={e => choose(e.target.value)}><option value="current">현재 학원 설정</option><option value="common">공통 운영 템플릿</option><option value="blank">빈 템플릿으로 시작</option>{library.templates.map(t => <option key={t.id} value={t.id}>{t.name} · {t.createdAt.slice(0,10)}</option>)}</select></label>
      <label className="admin-field"><span>템플릿 이름</span><input value={name} maxLength={100} disabled={busy} onChange={e => { setName(e.target.value); setPreview(null); }}/></label>
    </div><div className="flex flex-wrap gap-2">
      <button className="admin-button admin-button-secondary" disabled={busy} onClick={() => run(async () => { await send("save",{name,payload:draft}); await load(); toast.success("우리 학원 템플릿으로 저장했습니다."); })}>템플릿 사본 저장</button>
      <button className="admin-button admin-button-secondary" disabled={busy} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({name,payload:draft},null,2)],{type:"application/json"})); const a = document.createElement("a"); a.href = url; a.download = "academy-template.json"; a.click(); URL.revokeObjectURL(url); }}>파일로 내보내기</button>
      <label className="admin-button admin-button-secondary">파일 가져오기<input className="sr-only" type="file" accept=".json,application/json" disabled={busy} onChange={e => { const file=e.target.files?.[0]; if (!file) return; run(async () => { if (file.size>1500000) throw new Error("파일은 1.5MB 이내로 선택해 주세요."); const body=JSON.parse(await file.text()); const saved=await send("save",body); await load(); setDraft(body.payload); setName(body.name); setSelected(saved?.id??"current"); setPreview(null); toast.success("파일을 우리 학원 템플릿으로 가져왔습니다."); }); }}/></label>
    </div><p className="admin-help">사본을 불러온 뒤 변경 내용을 확인해 적용합니다. 원본 템플릿의 변경은 이 지점에 자동 반영되지 않습니다.</p></div></section>
    <section className="admin-section"><h2 className="admin-section-title">불러온 설정 확인</h2>
      <p className="admin-help">항목 수정은 기존 지점별 설정 메뉴에서 합니다. 수정한 현재 설정을 사본으로 저장하면 자체 템플릿이 됩니다.</p>
      <Link className="admin-button admin-button-secondary" href={`/${divisionSlug}/admin/settings`}>지점 설정 편집</Link>
      {CONFIGURATION_GROUPS.map(key => <details key={key} className="border-b py-2"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{labels[key]}{Array.isArray(draft[key]) ? ` · ${draft[key].length}개` : ""}</summary><ChangeValue value={draft[key]} config={draft}/></details>)}
    </section>
    <section className="admin-section"><div className="space-y-4"><div className="grid min-w-0 gap-4 md:grid-cols-2">
      <label className="admin-field"><span>적용일</span><input type="date" min={library.today} value={date} disabled={busy} onChange={e=>{setDate(e.target.value);setPreview(null);}}/></label>
      <div className="flex items-end"><button className="admin-button admin-button-primary" disabled={busy} onClick={()=>run(async()=>{setPreview(await send("preview",{name,payload:draft,effectiveFrom:date}));})}>변경 미리보기</button></div>
    </div>{error && <p className="admin-notice admin-notice-danger" role="alert">{error}</p>}
    {preview && <div className="admin-flat-page"><h2 className="admin-section-title">{date} 적용 · 변경 {preview.changes.length}건</h2>
      <ConfigurationChanges changes={preview.changes} before={library.current} after={preview.after}/>
      <p className="admin-help">출결·성적·상벌점·납부 내역과 학생별 약정 금액은 그대로 보존합니다. 제외한 기존 항목은 이력을 위해 비활성 상태로 보관합니다.</p>
      <button className="admin-button admin-button-primary" disabled={busy || !preview.changes.length} onClick={()=>run(async()=>{const applied=await send("apply",{name,payload:draft,effectiveFrom:date,revision:preview.revision}); const next=await load(); setPreview(null); if(applied.status==="APPLIED"){setDraft(next.current);setSelected("current");} toast.success(applied.status==="APPLIED"?"학원 설정을 적용했습니다.":"설정 적용을 예약했습니다.");})}>{date===library.today?"미리본 변경 적용":"해당 날짜로 적용 예약"}</button>
    </div>}</div></section>
    <section className="admin-section"><h2 className="admin-section-title">적용 이력·예약</h2>{!library.applications.length?<p className="admin-help">적용 이력이 없습니다.</p>:<div className="admin-table-frame"><table className="admin-table"><thead><tr><th>적용일</th><th>템플릿</th><th>상태</th><th>요청자</th><th>관리</th></tr></thead><tbody>{library.applications.map(row=><tr key={row.id}><td>{row.effectiveFrom}</td><td>{row.templateName}</td><td>{statusLabels[row.status]}{row.error&&<p className="admin-help">{row.error}</p>}</td><td>{row.requestedByName}</td><td><button className="admin-button admin-button-secondary" disabled={busy} onClick={()=>run(async()=>{setHistory(await send("history",undefined,row.id));})}>변경 내역</button>{["PENDING","REVIEW"].includes(row.status)&&<button className="admin-button admin-button-secondary" disabled={busy} onClick={()=>run(async()=>{await send("cancel",undefined,row.id);await load();})}>예약 취소</button>}</td></tr>)}</tbody></table></div>}</section>
    {history && <section className="admin-section"><div className="admin-workspace-toolbar"><h2 className="admin-section-title">적용 당시 설정</h2><button className="admin-button admin-button-secondary" onClick={()=>setHistory(null)}>내역 닫기</button></div>{CONFIGURATION_GROUPS.map(key=><details key={key} className="py-2"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{labels[key]}</summary><div className="grid min-w-0 gap-4 md:grid-cols-2"><section><h3>변경 전</h3><ChangeValue value={history.before[key]} config={history.before}/></section><section><h3>변경 후</h3><ChangeValue value={history.after[key]} config={history.after}/></section></div></details>)}</section>}
  </div>;
}
