"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { type ArrivalDeviceSummary, type ArrivalSettingsResult } from "@/lib/arrivals";
import { formatKstDateTime } from "@/lib/date-utils";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { arrivalRequest } from "./arrival-client";

export function ArrivalDeviceManager({ divisionSlug, devices, onSaved }: {
  divisionSlug: string; devices: ArrivalDeviceSummary[]; onSaved: (result: ArrivalSettingsResult) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [remove, setRemove] = useState<ArrivalDeviceSummary | null>(null);
  const [revoke, setRevoke] = useState<ArrivalDeviceSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function submit(device?: ArrivalDeviceSummary, deleting = false) {
    if (lock.current) return;
    if (!device && (!code.trim() || !name.trim())) { setError(new Error("등록코드와 기기 이름을 입력해 주세요.")); return; }
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try {
      const result = await arrivalRequest<ArrivalSettingsResult>(`/api/${divisionSlug}/arrival-settings/devices`, { method: device ? "DELETE" : "POST", body: JSON.stringify(device ? { deviceId: device.id, ...(deleting ? { action: "delete" } : {}) } : { code: code.trim(), name: name.trim() }) });
      onSaved(result);
      if (device) { setRevoke(null); setRemove(null); setNotice(deleting ? `${device.name}을 목록에서 삭제했습니다.` : `${device.name}의 승인을 해제했습니다.`); }
      else { setApproving(false); setCode(""); setName(""); setNotice("공용 기기를 승인했습니다. 해당 기기에서 승인 상태를 확인합니다."); }
    } catch (cause) { setError(cause); if (device) { setRevoke(null); setRemove(null); } }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="admin-workspace-toolbar"><div><h2 className="admin-section-title">공용 기기 관리</h2><p className="admin-help mt-2">등록은 등원 기능의 사용 여부와 별개입니다. 승인한 기기만 등원을 입력할 수 있습니다.</p></div><button type="button" className="admin-button admin-button-primary" disabled={busy} onClick={() => { setApproving(true); setError(null); }}>기기 승인</button></div>
    <p className="admin-help">공용 기기에서 <Link className="admin-text-action" href={`/${divisionSlug}/check-in`} target="_blank" rel="noopener noreferrer">등원 체크 화면 열기</Link>로 접속해 등록코드를 받으세요. 관리자 로그인은 별도 기기에서 진행합니다.</p>
    {notice && <p className="admin-notice admin-notice-success" role="status">{notice}</p>}
    {!approving && <ArrivalFeedback error={error} />}
    {devices.length ? <div className="admin-panel">{devices.map(device => {
      const expired = new Date(device.expiresAt).getTime() <= Date.now();
      return <div key={device.id} className="admin-panel-row space-y-3">
        <div className="admin-workspace-toolbar"><h3 className="admin-section-title break-keep">{device.name}</h3><span className={device.revokedAt || expired ? "text-admin-text-muted" : "text-admin-success"}>{device.revokedAt ? "승인 해제" : expired ? "기간 만료" : "승인됨"}</span></div>
        <dl className="admin-portal-details"><div><dt className="admin-label">승인 담당자</dt><dd className="mt-2 break-keep">{device.registeredByName}</dd></div><div><dt className="admin-label">승인 시각</dt><dd className="mt-2 tabular-nums">{formatKstDateTime(device.createdAt)}</dd></div><div><dt className="admin-label">만료 시각</dt><dd className="mt-2 tabular-nums">{formatKstDateTime(device.expiresAt)}</dd></div>{device.revokedAt && <div><dt className="admin-label">해제 시각</dt><dd className="mt-2 tabular-nums">{formatKstDateTime(device.revokedAt)}</dd></div>}</dl>
        {device.revokedAt && <button type="button" className="admin-text-action text-admin-danger" disabled={busy} onClick={() => setRemove(device)}>삭제</button>}
        {!device.revokedAt && <button type="button" className="admin-text-action text-admin-danger" disabled={busy} onClick={() => setRevoke(device)}>승인 해제</button>}
      </div>;
    })}</div> : <p className="admin-empty-state">등록된 공용 기기가 없습니다. 등록코드를 받아 첫 기기를 승인해 주세요.</p>}
    <SlideOver open={approving} title="공용 기기 승인" description="공용 기기에 표시된 등록코드와 알아보기 쉬운 기기 이름을 입력합니다." onClose={() => { if (!lock.current) setApproving(false); }} footer={<button className="admin-button admin-button-primary" form="arrival-device-form" type="submit" disabled={busy}>{busy ? "승인 중" : "기기 승인"}</button>}>
      <form id="arrival-device-form" className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={busy} className="space-y-4"><label className="block"><span className="admin-label mb-2 block">등록코드</span><input className="w-full tabular-nums" type="text" autoComplete="off" value={code} maxLength={32} required onChange={event => setCode(event.target.value)} /></label><label className="block"><span className="admin-label mb-2 block">기기 이름</span><input className="w-full" type="text" value={name} maxLength={80} required placeholder="예: 안내데스크 태블릿" onChange={event => setName(event.target.value)} /></label></fieldset>
        <ArrivalFeedback error={error} />
      </form>
    </SlideOver>
    <ConfirmDialog open={!!remove} title="승인 해제된 기기를 삭제할까요?" description={`${remove?.name ?? ""}을 목록에서 삭제합니다. 기존 등원 기록과 기기 승인·해제 이력은 보존됩니다.`} confirmLabel="삭제" variant="danger" isLoading={busy} onConfirm={() => { if (remove) void submit(remove, true); }} onCancel={() => setRemove(null)} />
    <ConfirmDialog open={!!revoke} title="기기 승인을 해제할까요?" description={`${revoke?.name ?? ""}에서 등원을 입력할 수 없게 됩니다. 기존 기록은 보존됩니다.`} confirmLabel="승인 해제" variant="danger" isLoading={busy} onConfirm={() => { if (revoke) void submit(revoke); }} onCancel={() => setRevoke(null)} />
  </div>;
}
