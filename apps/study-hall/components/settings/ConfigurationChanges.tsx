import { CONFIGURATION_LABELS as labels } from "@/lib/academy-template-labels";
import type { AcademyConfiguration } from "@/lib/academy-template";
type Change = { section: string; name: string; before: unknown; after: unknown };
function changedFields(value: unknown, other: unknown): unknown {
 if (!value || !other || typeof value !== "object" || typeof other !== "object" || Array.isArray(value) || Array.isArray(other)) return value;
 return Object.fromEntries(Object.entries(value).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify((other as Record<string,unknown>)[k])).map(([k,v])=>[k,changedFields(v,(other as Record<string,unknown>)[k])]));
}
/** Long configuration objects need their own readable panel, not a narrow table cell. */
export function ConfigurationChanges({changes,before,after}:{changes:Change[];before:AcademyConfiguration;after:AcademyConfiguration}) {
 const clean=(v:unknown)=>{
  if(v && typeof v==="object" && "subjects" in v){const {subjects:_subjects,...rest}=v;void _subjects;return rest;}
  return v;
 };
 const rows=changes.map(c=>({...c,section:c.section.startsWith("과목:")?"과목":c.section,name:(labels[c.name]??c.name).replace(/^REGULAR\//,"정기 / ").replace(/^MORNING\//,"아침 / "),before:c.section==="시험 종류"?clean(c.before):c.before,after:c.section==="시험 종류"?clean(c.after):c.after})).filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.after));
 const simple=rows.filter(c=>(c.before===null||typeof c.before!=="object")&&(c.after===null||typeof c.after!=="object"));
 const complex=rows.filter(c=>!simple.includes(c));
 return <div className="space-y-4">
  {!!simple.length && <div className="admin-table-frame"><table className="admin-table"><thead><tr><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>{simple.map((c,i)=><tr key={i}><th>{c.section} · {labels[c.name]??c.name}</th><td><ChangeValue value={c.before} config={before}/></td><td><ChangeValue value={c.after} config={after}/></td></tr>)}</tbody></table></div>}
  {complex.map((c,i)=><section key={i} className="admin-panel"><header className="admin-panel-header">{c.section} · {labels[c.name]??c.name}</header><div className="admin-panel-row grid min-w-0 gap-4 md:grid-cols-2"><section className="min-w-0"><h3 className="admin-section-title">변경 전</h3><ChangeValue value={changedFields(c.before,c.after)} config={before}/></section><section className="min-w-0"><h3 className="admin-section-title">변경 후</h3><ChangeValue value={changedFields(c.after,c.before)} config={after}/></section></div></section>)}
 </div>;
}
export function ChangeValue({value,config}:{value:unknown;config:AcademyConfiguration}) {
  if(value==null)return <>없음</>;
  if(typeof value==="boolean")return <>{value?"사용":"미사용"}</>;
  if(Array.isArray(value))return <>{value.map((v,i)=><div key={i}><ChangeValue value={v} config={config}/></div>)}</>;
  if(typeof value==="object")return <dl className="min-w-0 whitespace-normal break-words">{Object.entries(value).filter(([k])=>!["id","source"].includes(k)).map(([k,v])=><div key={k}><dt className="admin-help">{labels[k]??k}</dt><dd><ChangeValue value={v} config={config}/></dd></div>)}</dl>;
  const text=String(value); const named=[...config.periods,...config.pointRules,...config.rooms].find(r=>r.id===text);
  const values:Record<string,string>={threshold:"설정한 지각 분 기준",after_start:"교시 시작 후 지각",REGULAR:"정기 모의고사",MORNING:"아침 모의고사",WRITTEN:"필기",PHYSICAL:"체력",INTERVIEW:"면접",RESULT:"결과 발표",OTHER:"기타"};
  return <>{named?.name??values[text]??(text||"없음")}</>;
}
