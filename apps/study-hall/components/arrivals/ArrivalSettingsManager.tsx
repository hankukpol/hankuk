"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type ArrivalSettingsResult } from "@/lib/arrivals";
import { getKstTodayYmd, formatKstDateTime } from "@/lib/date-utils";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { ArrivalConfigSummary } from "./ArrivalConfigSummary";
import { ArrivalSettingsEditor } from "./ArrivalSettingsEditor";
import { ArrivalDeviceManager } from "./ArrivalDeviceManager";
import { useArrivalQuery } from "./arrival-client";

export function ArrivalSettingsManager({ divisionSlug }: { divisionSlug: string }) {
  const query = useArrivalQuery<ArrivalSettingsResult>(`/api/${divisionSlug}/arrival-settings`);
  const [settings, setSettings] = useState<ArrivalSettingsResult | null>(null);
  const [tab, setTab] = useState<"settings" | "devices" | "history">("settings");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (query.data) setSettings(query.data); }, [query.data]);
  const today = getKstTodayYmd();
  const scheduled = settings?.versions.filter(version => version.effectiveDate > today) ?? [];
  function acceptSettings(result: ArrivalSettingsResult) { query.accept(result); setSettings(result); }

  return <div className="space-y-4">
    <div className="admin-workspace-toolbar"><Link className="admin-text-action" href={`/${divisionSlug}/admin/settings/rules`}>운영 규칙으로</Link><button type="button" className="admin-text-action" disabled={query.loading || editing} onClick={() => void query.reload()}>설정 새로고침</button></div>
    <AdminTabs items={[{ id: "settings", label: "현재 설정·예약" }, { id: "devices", label: "공용 기기" }, { id: "history", label: "변경 이력" }]} activeId={tab} onChange={setTab} variant="secondary" idPrefix="arrival-settings" label="등원 설정 업무" />
    <ArrivalFeedback error={query.error} loading={!settings && query.loading} onRetry={() => void query.reload()} loginHref="/login" />
    {notice && <p className="admin-notice admin-notice-success" role="status">{notice}</p>}
    {settings && <>
      <AdminTabPanel id="settings" activeId={tab} idPrefix="arrival-settings" className="space-y-4">
        <div className="admin-workspace-toolbar"><h2 className="admin-section-title">현재 유효한 설정</h2><button type="button" className="admin-button admin-button-primary" disabled={query.loading || !!query.error} onClick={() => setEditing(true)}>설정 변경</button></div>
        <ArrivalConfigSummary config={settings.current} />
        <p className="admin-help">현재 학원에만 적용합니다. 등원 기록은 출결·상벌점·학습시간 계산에 반영하지 않습니다.</p>
        <section className="space-y-3"><h2 className="admin-section-title">적용 예약</h2>{scheduled.length ? <div className="admin-table-frame"><table><thead><tr><th scope="col">적용일</th><th scope="col">사용</th><th scope="col">수험번호</th><th scope="col">팝업</th><th scope="col">기기</th></tr></thead><tbody>{[...scheduled].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).map(version => <tr key={version.id}><td>{version.effectiveDate}</td><td>{version.enabled ? "사용" : "중지"}</td><td>{version.numberLength}자리</td><td>{version.popupMs / 1000}초</td><td>{version.deviceDays}일</td></tr>)}</tbody></table></div> : <p className="admin-empty-state">예약된 등원 설정이 없습니다.</p>}</section>
      </AdminTabPanel>
      <AdminTabPanel id="devices" activeId={tab} idPrefix="arrival-settings"><ArrivalDeviceManager divisionSlug={divisionSlug} devices={settings.devices} onSaved={acceptSettings} /></AdminTabPanel>
      <AdminTabPanel id="history" activeId={tab} idPrefix="arrival-settings" className="space-y-3">
        <h2 className="admin-section-title">설정 변경 이력</h2>
        {settings.versions.length ? <div className="admin-panel">{[...settings.versions].reverse().map(version => <div className="admin-panel-row space-y-3" key={version.id}>
          <div className="admin-workspace-toolbar"><h3 className="admin-section-title">적용일 {version.effectiveDate}</h3><span className="admin-help">{version.effectiveDate > today ? "예약" : "적용일 경과"}</span></div>
          <p className="admin-help break-keep">저장: {formatKstDateTime(version.savedAt)} / 담당자: {version.savedByName}</p>
          <dl className="admin-portal-details"><div><dt className="admin-label">사용 상태</dt><dd className="mt-2">{version.enabled ? "사용" : "사용 안 함"}</dd></div><div><dt className="admin-label">수험번호</dt><dd className="mt-2">{version.numberLength}자리</dd></div><div><dt className="admin-label">팝업 표시</dt><dd className="mt-2">{version.popupMs / 1000}초</dd></div><div><dt className="admin-label">기기 유효기간</dt><dd className="mt-2">{version.deviceDays}일</dd></div></dl>
        </div>)}</div> : <p className="admin-empty-state">저장된 등원 설정 이력이 없습니다.</p>}
      </AdminTabPanel>
      {editing && <ArrivalSettingsEditor divisionSlug={divisionSlug} settings={settings} onClose={() => setEditing(false)} onReload={query.reload} onSaved={result => { acceptSettings(result); setNotice("등원 설정을 저장했습니다. 적용 예약과 이력에서 확인할 수 있습니다."); }} />}
    </>}
  </div>;
}
