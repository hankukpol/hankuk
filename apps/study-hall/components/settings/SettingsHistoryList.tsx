"use client";

import type { SettingsChangeEntry, SettingsHistoryItem } from "@/lib/services/settings-history.service";

type SettingsHistoryListProps = {
  history: SettingsHistoryItem[];
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "없음";
  }

  if (typeof value === "boolean") {
    return value ? "사용" : "사용 안 함";
  }

  const text = String(value);
  // 문자 템플릿처럼 긴 값은 이력 목록에서 잘라 보여준다.
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function formatChangedAt(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChangeRow({ change }: { change: SettingsChangeEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-slate-900">{change.label}</span>
      <span className="text-slate-500 line-through">{formatValue(change.before)}</span>
      <span className="text-slate-400">→</span>
      <span className="font-semibold text-slate-900">{formatValue(change.after)}</span>
    </li>
  );
}

/**
 * 규칙 페이지 하단의 최근 변경 이력.
 * "누가 언제 지각 기준을 20분에서 30분으로 바꿨는지"를 남긴다.
 */
export function SettingsHistoryList({ history }: SettingsHistoryListProps) {
  return (
    <section className="admin-section">
      <h2 className="admin-section-title">최근 변경 이력</h2>
      <p className="admin-help mt-2">
        운영 규칙을 저장할 때마다 바뀐 항목만 기록됩니다. 최근 {history.length || 0}건.
      </p>

      {history.length ? (
        <ol className="mt-5 space-y-4">
          {history.map((entry) => (
            <li key={entry.id} className="admin-record-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{entry.changedByName}</p>
                <p className="admin-help tabular-nums">{formatChangedAt(entry.changedAt)}</p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {entry.changes.map((change) => (
                  <ChangeRow key={`${entry.id}:${change.field}`} change={change} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <div className="admin-empty-state mt-5">
          <p className="font-semibold">아직 기록된 변경 이력이 없습니다.</p>
          <p className="admin-help mt-2">이 화면에서 규칙을 저장하면 그때부터 이력이 쌓입니다.</p>
        </div>
      )}
    </section>
  );
}
