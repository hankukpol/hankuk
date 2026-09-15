import { type ArrivalHistory, type ArrivalRecord, ARRIVAL_SOURCE_LABELS, formatArrivalTime } from "@/lib/arrivals";
import { formatKstDateTime } from "@/lib/date-utils";

const ACTION_LABELS: Record<ArrivalHistory["action"], string> = { CHECK_IN: "등원 입력", RECHECK: "취소 후 재입력", ADD: "누락 추가", CORRECT: "시각 정정", CANCEL: "기록 취소" };
function recordState(record: ArrivalRecord | null) {
  return !record ? "기록 없음" : `${formatArrivalTime(record.effectiveAt, true)}${record.cancelledAt ? " (취소)" : ""}`;
}

export function ArrivalHistoryList({ record, history }: { record: ArrivalRecord | null; history: ArrivalHistory[] }) {
  const entries = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = entries[0];
  return <div className="space-y-4">
    {record ? <dl className="admin-portal-details">
      <div><dt className="admin-label">유효 등원 시각</dt><dd className="mt-2 tabular-nums">{formatArrivalTime(record.effectiveAt, true)}{record.cancelledAt && <span className="ml-2 text-admin-danger">취소됨</span>}</dd></div>
      <div><dt className="admin-label">최초 기기 접수 시각</dt><dd className="mt-2 tabular-nums">{record.firstReceivedAt ? formatKstDateTime(record.firstReceivedAt) + `:${formatArrivalTime(record.firstReceivedAt, true).slice(-2)}` : "기기 접수 기록 없음"}</dd></div>
      <div><dt className="admin-label">출처 / 기기</dt><dd className="mt-2 break-keep">{ARRIVAL_SOURCE_LABELS[record.source]}{record.deviceName ? ` / ${record.deviceName}` : ""}</dd></div>
      <div><dt className="admin-label">최근 처리 담당자</dt><dd className="mt-2 break-keep">{latest?.actorName || "기록 없음"}</dd></div>
      <div className="col-span-2"><dt className="admin-label">최근 처리 사유</dt><dd className="mt-2 break-keep whitespace-pre-wrap">{latest?.reason || "수험번호 직접 입력"}</dd></div>
    </dl> : <p className="admin-empty-state">선택한 날짜에 등원 기록이 없습니다.</p>}
    <section>
      <h3 className="admin-section-title">변경 이력</h3>
      {entries.length ? <ol className="mt-3 divide-y divide-admin-line-soft">{entries.map(entry => <li key={entry.id} className="space-y-2 py-3">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{ACTION_LABELS[entry.action]}</span><time className="admin-help tabular-nums" dateTime={entry.createdAt}>{formatKstDateTime(entry.createdAt)}</time></div>
        <p className="tabular-nums">{recordState(entry.before)} → {recordState(entry.after)}</p>
        <p className="admin-help break-keep">담당자: {entry.actorName} / 출처: {ARRIVAL_SOURCE_LABELS[entry.after.source]}</p>
        <p className="break-keep whitespace-pre-wrap">{entry.reason || "수험번호 직접 입력"}</p>
      </li>)}</ol> : <p className="admin-help mt-2">변경 이력이 없습니다.</p>}
    </section>
  </div>;
}
