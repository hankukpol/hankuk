"use client";

import { useRef, useState } from "react";
import { type ArrivalCorrection, type ArrivalMonthResult, arrivalCorrectionSchema, formatArrivalTime } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ArrivalCalendar } from "./ArrivalCalendar";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { ArrivalHistoryList } from "./ArrivalHistoryList";
import { ArrivalRequestError, arrivalRequest, useArrivalQuery } from "./arrival-client";

export type ArrivalSelection = { studentId: string; name: string; studentNumber: string; date: string };

export function ArrivalStudentDetail({ divisionSlug, selection, onClose, onSaved }: {
  divisionSlug: string; selection: ArrivalSelection; onClose: () => void; onSaved: () => void;
}) {
  const [month, setMonth] = useState(selection.date.slice(0, 7));
  const [date, setDate] = useState(selection.date);
  const query = useArrivalQuery<ArrivalMonthResult>(`/api/${divisionSlug}/arrivals?studentId=${encodeURIComponent(selection.studentId)}&month=${month}`, 5000);
  const [drafts, setDrafts] = useState<Record<string, ArrivalCorrection>>({});
  const draft = drafts[date];
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const saveLock = useRef(false);
  const record = query.data?.records.find(item => item.date === date) ?? null;
  const history = query.data?.history?.filter(item => item.after.date === date) ?? [];
  const today = query.data?.today ?? getKstTodayYmd();
  const currentVersion = record?.version ?? 0;
  const conflict = !!draft && !!query.data && draft.expectedVersion !== currentVersion;
  const formId = "arrival-correction-form";

  function begin(action: ArrivalCorrection["action"]) {
    if (!query.data || query.error || saveLock.current) return;
    setDrafts(current => ({ ...current, [date]: {
      action, studentId: selection.studentId, date, expectedVersion: currentVersion,
      time: record ? formatArrivalTime(record.effectiveAt, true) : "", reason: "",
    } }));
    setError(null); setNotice("");
  }
  function update(changes: Partial<ArrivalCorrection>) {
    setDrafts(current => ({ ...current, [date]: { ...current[date], ...changes } }));
    setError(null);
  }
  function clearDraft() { setDrafts(current => { const next = { ...current }; delete next[date]; return next; }); setError(null); }
  function requestClose() {
    if (saveLock.current) return;
    if (Object.keys(drafts).length) setConfirmDiscard(true); else onClose();
  }

  function validate() {
    if (!draft) return null;
    const input = { ...draft, ...(draft.action === "CANCEL" ? { time: undefined } : {}) };
    const parsed = arrivalCorrectionSchema.safeParse(input);
    if (!parsed.success) { setError(new Error(parsed.error.issues[0].message)); return null; }
    if (draft.date > today || (draft.action !== "CANCEL" && new Date(`${draft.date}T${draft.time}+09:00`).getTime() > Date.now())) {
      setError(new Error("미래 날짜나 시각에는 기록할 수 없습니다.")); return null;
    }
    if (conflict) { setError(new Error("다른 처리로 기록이 바뀌었습니다. 최신 기록을 확인한 뒤 다시 검토해 주세요.")); return null; }
    return parsed.data;
  }
  async function save() {
    if (saveLock.current) return;
    const input = validate();
    if (!input) { setConfirmCancel(false); return; }
    saveLock.current = true; setSaving(true); setError(null);
    try {
      await arrivalRequest<{ ok: true }>(`/api/${divisionSlug}/arrivals`, { method: "POST", body: JSON.stringify(input) });
      clearDraft(); setConfirmCancel(false); setNotice(input.action === "CANCEL" ? "등원 기록을 취소했습니다. 변경 이력은 보존됩니다." : "등원 기록을 저장했습니다.");
      onSaved();
      await query.reload();
    } catch (cause) {
      setError(cause); setConfirmCancel(false);
      if (cause instanceof ArrivalRequestError && cause.status === 409) await query.reload();
    } finally { saveLock.current = false; setSaving(false); }
  }

  return <>
    <SlideOver open title={`${selection.name} 등원 기록`} description={`수험번호 ${selection.studentNumber}`} onClose={requestClose} footer={draft ? <>
      <button type="button" className="admin-button" disabled={saving} onClick={clearDraft}>편집 취소</button>
      <button type="submit" form={formId} className={`admin-button ${draft.action === "CANCEL" ? "admin-button-danger" : "admin-button-primary"}`} disabled={saving || conflict || !query.data || !!query.error}>{saving ? "저장 중" : draft.action === "CANCEL" ? "기록 취소 확인" : "기록 저장"}</button>
    </> : undefined}>
      <div className="space-y-5">
        <ArrivalFeedback error={query.error} loading={!query.data && query.loading} onRetry={() => void query.reload()} loginHref="/login" />
        <ArrivalCalendar month={month} today={today} records={query.data?.records ?? []} selectedDate={date} disabled={saving} unavailable={!query.data} onMonthChange={next => { setMonth(next); setDate(`${next}-01`); setError(null); setNotice(""); }} onSelectDate={next => { setDate(next); setError(null); setNotice(""); }} />
        <div className="admin-workspace-toolbar"><h3 className="admin-section-title">{date}</h3><button type="button" className="admin-text-action" disabled={saving || query.loading} onClick={() => void query.reload()}>상세 새로고침</button></div>
        {notice && <p className="admin-notice admin-notice-success" role="status">{notice}</p>}
        {query.data && <ArrivalHistoryList record={record} history={history} />}
        {query.data && !draft && date <= today && <div className="flex flex-wrap gap-3">
          <button type="button" className="admin-button admin-button-primary" disabled={!!query.error} onClick={() => begin(record && !record.cancelledAt ? "CORRECT" : "ADD")}>{record?.cancelledAt ? "취소 기록 다시 추가" : record ? "시각 정정" : "누락 기록 추가"}</button>
          {record && !record.cancelledAt && <button type="button" className="admin-text-action text-admin-danger" disabled={!!query.error} onClick={() => begin("CANCEL")}>등원 기록 취소</button>}
        </div>}
        {draft && <form id={formId} className="space-y-4" onSubmit={event => { event.preventDefault(); if (!validate()) return; if (draft.action === "CANCEL") setConfirmCancel(true); else void save(); }}>
          <h3 className="admin-section-title">{draft.action === "CANCEL" ? "기록 취소" : draft.action === "ADD" ? "누락 기록 추가" : "등원 시각 정정"}</h3>
          <p className="admin-help">대상: {selection.name} / {draft.date}. 작성 중인 시각과 사유는 자동 갱신 시에도 유지됩니다.</p>
          {conflict && <div className="admin-notice admin-notice-warning" role="alert"><p>기록이 변경되었습니다. 위의 최신 기록과 이력을 확인해 주세요. 작성한 내용은 유지했습니다.</p><button type="button" className="admin-text-action" disabled={saving} onClick={() => update({ expectedVersion: currentVersion, action: draft.action === "CANCEL" && record && !record.cancelledAt ? "CANCEL" : record && !record.cancelledAt ? "CORRECT" : "ADD" })}>최신 기록으로 다시 검토</button></div>}
          <fieldset disabled={saving} className="space-y-4">
            {draft.action !== "CANCEL" && <label className="block"><span className="admin-label mb-2 block">등원 시각 (한국 시간)</span><input type="time" step="1" required value={draft.time ?? ""} onChange={event => update({ time: event.target.value })} className="w-full" /></label>}
            <label className="block"><span className="admin-label mb-2 block">처리 사유 (필수)</span><textarea required maxLength={500} value={draft.reason} onChange={event => update({ reason: event.target.value })} className="w-full" /></label>
          </fieldset>
          <ArrivalFeedback error={error} />
        </form>}
      </div>
    </SlideOver>
    <ConfirmDialog open={confirmCancel} title="등원 기록을 취소할까요?" description={`${selection.name} / ${date}. 사유: ${draft?.reason ?? ""}. 원본과 변경 이력은 보존됩니다.`} variant="danger" confirmLabel="기록 취소" isLoading={saving} onConfirm={() => void save()} onCancel={() => setConfirmCancel(false)} />
    <ConfirmDialog open={confirmDiscard} title="작성 중인 내용을 버리고 닫을까요?" description="저장하지 않은 정정 시각과 사유는 사라집니다." confirmLabel="내용 버리고 닫기" onConfirm={onClose} onCancel={() => setConfirmDiscard(false)} />
  </>;
}
