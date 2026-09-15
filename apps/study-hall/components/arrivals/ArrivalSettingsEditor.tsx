"use client";

import { useRef, useState } from "react";
import { type ArrivalConfig, type ArrivalSettingsResult, type ArrivalSettingsPreview, arrivalConfigSchema } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { ARRIVAL_CONFIG_FIELDS } from "./ArrivalConfigSummary";
import { ArrivalRequestError, arrivalRequest } from "./arrival-client";

export function ArrivalSettingsEditor({ divisionSlug, settings, onClose, onSaved, onReload }: {
  divisionSlug: string; settings: ArrivalSettingsResult; onClose: () => void;
  onSaved: (result: ArrivalSettingsResult) => void; onReload: () => Promise<ArrivalSettingsResult | null>;
}) {
  const [config, setConfig] = useState<ArrivalConfig>(() => ({ enabled: settings.current.enabled, numberLength: settings.current.numberLength, popupMs: settings.current.popupMs, deviceDays: settings.current.deviceDays, effectiveDate: getKstTodayYmd() }));
  const [revision, setRevision] = useState(settings.revision);
  const [preview, setPreview] = useState<ArrivalSettingsPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "reload" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  const endpoint = `/api/${divisionSlug}/arrival-settings`;
  const conflict = revision !== settings.revision;
  const requestKey = JSON.stringify({ expectedRevision: revision, config });
  const canSave = !!preview && preview.revision === revision && previewKey === requestKey && !conflict;

  function update(changes: Partial<ArrivalConfig>) { setConfig(current => ({ ...current, ...changes })); setPreview(null); setPreviewKey(""); setError(null); setDirty(true); }
  function close() { if (!lock.current) { if (dirty) setDiscard(true); else onClose(); } }
  async function review() {
    if (lock.current) return;
    const parsed = arrivalConfigSchema.safeParse(config);
    if (!parsed.success) { setError(new Error(parsed.error.issues[0].message)); return; }
    if (config.effectiveDate < getKstTodayYmd()) { setError(new Error("적용일은 오늘 또는 이후로 선택해 주세요.")); return; }
    if (conflict) { setError(new Error("다른 관리자가 설정을 변경했습니다. 최신 설정을 확인한 뒤 다시 미리보기해 주세요.")); return; }
    lock.current = true; setBusy("preview"); setError(null); setPreview(null);
    try {
      const result = await arrivalRequest<ArrivalSettingsPreview>(`${endpoint}/preview`, { method: "POST", body: requestKey });
      setPreview(result); setPreviewKey(requestKey);
    } catch (cause) { setError(cause); if (cause instanceof ArrivalRequestError && cause.status === 409) await onReload(); }
    finally { lock.current = false; setBusy(null); }
  }
  async function save() {
    if (!canSave || lock.current) return;
    lock.current = true; setBusy("save"); setError(null);
    try {
      const result = await arrivalRequest<ArrivalSettingsResult>(endpoint, { method: "PUT", body: requestKey });
      onSaved(result); onClose();
    } catch (cause) {
      setError(cause);
      if (cause instanceof ArrivalRequestError && cause.status === 409) { setPreview(null); await onReload(); }
    } finally { lock.current = false; setBusy(null); }
  }
  async function rebase() {
    if (lock.current) return;
    lock.current = true; setBusy("reload"); setPreview(null);
    try { const latest = await onReload(); if (latest) { setRevision(latest.revision); setError(null); } else setError(new Error("최신 설정 조회에 실패했습니다. 작성 내용은 유지했습니다.")); }
    finally { lock.current = false; setBusy(null); }
  }

  return <>
    <SlideOver open title="등원 설정 변경" description="적용일과 변경 전후를 확인하고 저장합니다. 미래 날짜는 예약으로 남습니다." onClose={close} footer={<>
      <button type="submit" form="arrival-settings-form" className="admin-button" disabled={!!busy || conflict}>{busy === "preview" ? "미리보기 중" : "변경 미리보기"}</button>
      <button type="button" className="admin-button admin-button-primary" disabled={!!busy || !canSave} onClick={() => void save()}>{busy === "save" ? "저장 중" : config.effectiveDate > getKstTodayYmd() ? "적용 예약 저장" : "설정 저장"}</button>
    </>}>
      <form id="arrival-settings-form" className="space-y-4" onSubmit={event => { event.preventDefault(); void review(); }}>
        <fieldset disabled={!!busy} className="admin-panel">
          <div className="admin-form-row"><label className="admin-form-row-label" htmlFor="arrival-enabled">등원 체크 사용</label><div className="admin-form-row-control"><label className="flex min-h-11 items-center gap-3"><input id="arrival-enabled" type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} />{config.enabled ? "사용" : "사용 안 함"}</label></div></div>
          <div className="admin-form-row"><label className="admin-form-row-label" htmlFor="arrival-effective-date">적용일</label><div className="admin-form-row-control"><input id="arrival-effective-date" type="date" min={getKstTodayYmd()} required value={config.effectiveDate} onChange={event => update({ effectiveDate: event.target.value })} aria-describedby="arrival-date-help" /><p id="arrival-date-help" className="admin-help mt-2">예약일까지 현재 유효한 설정을 사용하며 기존 기록은 보존합니다.</p></div></div>
          <div className="admin-form-row"><label className="admin-form-row-label" htmlFor="arrival-number-length">수험번호 자릿수</label><div className="admin-form-row-control"><input id="arrival-number-length" type="number" min={1} max={20} step={1} required value={Number.isFinite(config.numberLength) ? config.numberLength : ""} onChange={event => update({ numberLength: event.target.valueAsNumber })} /></div></div>
          <div className="admin-form-row"><label className="admin-form-row-label" htmlFor="arrival-popup-ms">완료 팝업 (밀리초)</label><div className="admin-form-row-control"><input id="arrival-popup-ms" type="number" min={500} max={5000} step={1} required value={Number.isFinite(config.popupMs) ? config.popupMs : ""} onChange={event => update({ popupMs: event.target.valueAsNumber })} aria-describedby="arrival-popup-help" /><p id="arrival-popup-help" className="admin-help mt-2">1,000밀리초는 1초입니다.</p></div></div>
          <div className="admin-form-row"><label className="admin-form-row-label" htmlFor="arrival-device-days">기기 유효기간 (일)</label><div className="admin-form-row-control"><input id="arrival-device-days" type="number" min={1} max={365} step={1} required value={Number.isFinite(config.deviceDays) ? config.deviceDays : ""} onChange={event => update({ deviceDays: event.target.valueAsNumber })} /></div></div>
        </fieldset>
        <ArrivalFeedback error={error} />
        {conflict && <div className="admin-notice admin-notice-warning" role="alert"><p>서버 설정이 바뀌었습니다. 초안은 유지했습니다. 최신 설정을 불러오고 변경 전후를 다시 확인해 주세요.</p><button type="button" className="admin-text-action" disabled={!!busy} onClick={() => void rebase()}>최신 설정으로 다시 검토</button></div>}
        {preview && <section className="space-y-3" aria-label="등원 설정 변경 미리보기">
          <h3 className="admin-section-title">변경 미리보기</h3>
          <div className="admin-table-frame"><table><thead><tr><th scope="col">항목</th><th scope="col">변경 전</th><th scope="col">변경 후</th></tr></thead><tbody>{ARRIVAL_CONFIG_FIELDS.map(field => <tr key={field.key}><th scope="row">{field.label}</th><td>{field.display(preview.before)}</td><td>{field.display(preview.after)}{preview.before[field.key] !== preview.after[field.key] && <span className="block text-admin-accent">변경</span>}</td></tr>)}</tbody></table></div>
          <p className="admin-help">대상 {preview.eligibleCount}명 / 번호 일치 {preview.matchingCount}명 / 번호 불일치 {preview.mismatchedCount}명</p>
          {preview.mismatchedCount > 0 && <p className="admin-notice admin-notice-warning">번호 자릿수가 맞지 않는 학생 {preview.mismatchedCount}명은 입력 전 수험번호 확인이 필요합니다.</p>}
          <p className="admin-help">{preview.after.effectiveDate}부터 {preview.after.enabled ? "등원 체크를 사용합니다." : "등원 체크를 사용하지 않습니다."} 기존 등원·출결·상벌점 기록은 유지됩니다.</p>
        </section>}
      </form>
    </SlideOver>
    <ConfirmDialog open={discard} title="설정 초안을 버리고 닫을까요?" description="미리보기한 내용도 저장 전에는 적용되지 않습니다." confirmLabel="초안 버리고 닫기" onConfirm={onClose} onCancel={() => setDiscard(false)} />
  </>;
}
