"use client";

import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfigurationChanges } from "@/components/settings/ConfigurationChanges";
import type { AcademyConfiguration } from "@/lib/academy-template";
import type { getAcademyTemplateLibrary, previewAcademyTemplate } from "@/lib/services/academy-template.service";
import { toast } from "@/lib/sonner";

type Preview = Awaited<ReturnType<typeof previewAcademyTemplate>>;
type Library = Awaited<ReturnType<typeof getAcademyTemplateLibrary>> & { today: string };
type Result = { status: "APPLIED" | "PENDING" } | null;
/** Existing settings forms remain the only editors. This shares template preview/date/history. */
export function useConfigurationReview(divisionSlug: string): {
  review: (name: string, edit: (current: AcademyConfiguration) => AcademyConfiguration) => Promise<Result>;
  dialog: ReactNode;
} {
  const [draft, setDraft] = useState<{ name: string; payload: AcademyConfiguration; library: Library } | null>(null);
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resolve = useRef<((result: Result) => void) | null>(null);
  const endpoint = `/api/${divisionSlug}/settings/templates`;
  function finish(result: Result) { setDraft(null); setPreview(null); resolve.current?.(result); resolve.current = null; }
  async function post(action: string, value: unknown) {
    const response = await fetch(endpoint, {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action,value})});
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "설정 변경에 실패했습니다."); return body;
  }
  async function review(name: string, edit: (current: AcademyConfiguration) => AcademyConfiguration) {
    if (resolve.current) throw new Error("이전 변경 확인을 마쳐 주세요.");
    const response = await fetch(endpoint,{cache:"no-store"});
    const library = await response.json() as Library;
    if (!response.ok) throw new Error((library as unknown as {error:string}).error);
    setDraft({name,payload:edit(structuredClone(library.current)),library});
    setDate(library.pending?.effectiveFrom ?? library.earliestCalculationDate ?? library.today); setError(""); setPreview(null);
    return new Promise<Result>(done => {resolve.current=done;});
  }
  async function submit(apply: boolean) {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const value={name:draft.name,payload:draft.payload,effectiveFrom:date,mergePending:true};
      if (!apply) setPreview(await post("preview",value));
      else if (preview) {
        const result=await post("apply",{...value,revision:preview.revision});
        if (result.status==="PENDING") toast.success(`${date}부터 적용하도록 예약했습니다. 현재 설정은 유지됩니다.`);
        finish(result);
      }
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return {review,dialog:<Modal open={!!draft} title="설정 변경 확인" onClose={()=>{if(!busy)finish(null);}} footer={<>
    <button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={()=>finish(null)}>취소</button>
    <button type="button" className="admin-button admin-button-primary" disabled={busy || (!!preview && !preview.changes.length)} onClick={()=>void submit(!!preview)}>{preview ? (date<=(draft?.library.today ?? "") ? "변경 적용" : "적용 예약") : "변경 미리보기"}</button>
  </>}><div className="space-y-4">
    <label className="admin-field"><span>적용일</span><input type="date" value={date} disabled={busy} onChange={e=>{setDate(e.target.value);setPreview(null);}}/></label>
    {draft?.library.pending && <p className="admin-help">{draft.library.pending.effectiveFrom} 예약에 이번 변경을 함께 반영합니다. 미리보기에서 전체 변경을 확인해 주세요.</p>}
    {error && <p role="alert" className="admin-notice">{error}</p>}
    {preview && draft && <ConfigurationChanges changes={preview.changes} before={draft.library.current} after={preview.after}/>}
  </div></Modal>};
}
