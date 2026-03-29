"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CohortFunnelRow = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  targetExamYear: number | null;
  startDate: string;
  endDate: string;
  maxCapacity: number | null;
  isActive: boolean;
  counts: {
    enrolled: number;
    active: number;
    suspended: number;
    completed: number;
    cancelled: number;
    withdrawn: number;
  };
  retentionRate: number | null;
  completionRate: number | null;
};

export type FunnelKpis = {
  totalCohorts: number;
  avgRetentionRate: number | null;
  avgCompletionRate: number | null;
};

export type FunnelClientProps = {
  rows: CohortFunnelRow[];
  kpis: FunnelKpis;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "커스텀",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
      <p className={["mt-2 text-2xl font-bold", accent ?? "text-ink"].join(" ")}>{value}</p>
      <p className="mt-1 text-xs text-slate">{sub}</p>
    </div>
  );
}

// ─── Funnel Bar Row ───────────────────────────────────────────────────────────

function FunnelBars({ row }: { row: CohortFunnelRow }) {
  const total = row.counts.enrolled;
  if (total === 0) {
    return <span className="text-xs text-slate">등록 없음</span>;
  }

  const bars: { label: string; count: number; color: string; textColor: string }[] = [
    { label: "등록", count: total, color: "bg-ink/10", textColor: "text-ink" },
    { label: "수강 중", count: row.counts.active, color: "bg-forest", textColor: "text-white" },
    { label: "수료", count: row.counts.completed, color: "bg-green-500", textColor: "text-white" },
    { label: "휴원", count: row.counts.suspended, color: "bg-amber-400", textColor: "text-white" },
    { label: "취소", count: row.counts.cancelled, color: "bg-red-400", textColor: "text-white" },
  ];

  return (
    <div className="space-y-1.5">
      {bars.map((bar) => {
        const width = pct(bar.count, total);
        return (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right text-xs text-slate">{bar.label}</span>
            <div className="flex-1 h-5 rounded-full bg-ink/5 overflow-hidden">
              <div
                className={["h-full rounded-full transition-all duration-500", bar.color].join(" ")}
                style={{ width: `${Math.max(width, width > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-mono text-slate">
              {bar.count} <span className="text-slate/60">({width}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sort Types ───────────────────────────────────────────────────────────────

type SortKey = "name" | "enrolled" | "active" | "completed" | "retentionRate" | "completionRate";
type SortDir = "asc" | "desc";

// ─── Main Component ───────────────────────────────────────────────────────────

export function FunnelClient({ rows, kpis }: FunnelClientProps) {
  const [view, setView] = useState<"funnel" | "table">("funnel");
  const [sortKey, setSortKey] = useState<SortKey>("enrolled");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const filtered = rows.filter((r) => {
    if (filterActive === "active") return r.isActive;
    if (filterActive === "inactive") return !r.isActive;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA: number | string = 0;
    let valB: number | string = 0;
    switch (sortKey) {
      case "name":
        valA = a.cohortName;
        valB = b.cohortName;
        break;
      case "enrolled":
        valA = a.counts.enrolled;
        valB = b.counts.enrolled;
        break;
      case "active":
        valA = a.counts.active;
        valB = b.counts.active;
        break;
      case "completed":
        valA = a.counts.completed;
        valB = b.counts.completed;
        break;
      case "retentionRate":
        valA = a.retentionRate ?? -1;
        valB = b.retentionRate ?? -1;
        break;
      case "completionRate":
        valA = a.completionRate ?? -1;
        valB = b.completionRate ?? -1;
        break;
    }
    if (typeof valA === "string" && typeof valB === "string") {
      return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortDir === "asc"
      ? (valA as number) - (valB as number)
      : (valB as number) - (valA as number);
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-slate/40">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="space-y-8">
      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="총 기수"
          value={`${kpis.totalCohorts}개`}
          sub="조회된 전체 기수"
        />
        <KpiCard
          label="평균 유지율"
          value={kpis.avgRetentionRate !== null ? `${kpis.avgRetentionRate}%` : "—"}
          sub="수료 / (수료+취소+자퇴)"
          accent={
            kpis.avgRetentionRate !== null && kpis.avgRetentionRate >= 70
              ? "text-forest"
              : kpis.avgRetentionRate !== null && kpis.avgRetentionRate < 50
                ? "text-red-600"
                : undefined
          }
        />
        <KpiCard
          label="평균 수료율"
          value={kpis.avgCompletionRate !== null ? `${kpis.avgCompletionRate}%` : "—"}
          sub="수료 / 전체 등록"
          accent={
            kpis.avgCompletionRate !== null && kpis.avgCompletionRate >= 60
              ? "text-forest"
              : undefined
          }
        />
      </div>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-full border border-ink/10 bg-white p-1">
          {(["funnel", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                view === v
                  ? "bg-ink text-white"
                  : "text-slate hover:text-ink",
              ].join(" ")}
            >
              {v === "funnel" ? "퍼널 뷰" : "테이블 뷰"}
            </button>
          ))}
        </div>

        {/* Active filter */}
        <div className="flex rounded-full border border-ink/10 bg-white p-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterActive(f)}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                filterActive === f
                  ? "bg-ember text-white"
                  : "text-slate hover:text-ink",
              ].join(" ")}
            >
              {f === "all" ? "전체" : f === "active" ? "진행 중" : "종료"}
            </button>
          ))}
        </div>

        <span className="ml-auto text-sm text-slate">{sorted.length}개 기수</span>
      </div>

      {/* ── Funnel View ─────────────────────────────────────────────────────── */}
      {view === "funnel" && (
        <div className="space-y-4">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-ink/10 py-20 text-center">
              <p className="text-lg font-medium text-ink">기수 데이터가 없습니다</p>
              <p className="mt-2 text-sm text-slate">조회 기간을 변경해 보세요.</p>
            </div>
          ) : (
            sorted.map((row) => (
              <div
                key={row.cohortId}
                className="rounded-[20px] border border-ink/10 bg-white p-6 shadow-sm"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink">{row.cohortName}</h3>
                      <span className="inline-flex rounded-full border border-ink/10 px-2 py-0.5 text-xs text-slate">
                        {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory}
                      </span>
                      {row.isActive ? (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          진행 중
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
                          종료
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate">
                      {toDateStr(row.startDate)} ~ {toDateStr(row.endDate)}
                      {row.maxCapacity ? ` · 정원 ${row.maxCapacity}명` : ""}
                    </p>
                  </div>

                  {/* Rates */}
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-xs text-slate">유지율</p>
                      <p
                        className={[
                          "text-lg font-bold",
                          row.retentionRate !== null && row.retentionRate >= 70
                            ? "text-forest"
                            : row.retentionRate !== null && row.retentionRate < 50
                              ? "text-red-600"
                              : "text-ink",
                        ].join(" ")}
                      >
                        {row.retentionRate !== null ? `${row.retentionRate}%` : "—"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate">수료율</p>
                      <p className="text-lg font-bold text-ink">
                        {row.completionRate !== null ? `${row.completionRate}%` : "—"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate">총 등록</p>
                      <p className="text-lg font-bold text-ink">{row.counts.enrolled}명</p>
                    </div>
                  </div>
                </div>

                {/* Funnel bars */}
                <div className="mt-5">
                  <FunnelBars row={row} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Table View ──────────────────────────────────────────────────────── */}
      {view === "table" && (
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg font-medium text-ink">기수 데이터가 없습니다</p>
              <p className="mt-2 text-sm text-slate">조회 기간을 변경해 보세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("name")}
                    >
                      기수명 <SortIcon col="name" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                      기간
                    </th>
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("enrolled")}
                    >
                      등록 <SortIcon col="enrolled" />
                    </th>
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("active")}
                    >
                      수강 중 <SortIcon col="active" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                      휴원
                    </th>
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("completed")}
                    >
                      수료 <SortIcon col="completed" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                      취소/자퇴
                    </th>
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("retentionRate")}
                    >
                      유지율 <SortIcon col="retentionRate" />
                    </th>
                    <th
                      className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate hover:text-ink"
                      onClick={() => handleSort("completionRate")}
                    >
                      수료율 <SortIcon col="completionRate" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sorted.map((row) => (
                    <tr key={row.cohortId} className="transition-colors hover:bg-mist/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{row.cohortName}</span>
                          {row.isActive && (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs text-forest">
                              진행 중
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate">
                          {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {toDateStr(row.startDate)} ~<br />
                        {toDateStr(row.endDate)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-ink">
                        {row.counts.enrolled}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-forest">
                          {row.counts.active}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-700">
                          {row.counts.suspended}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-green-700">
                          {row.counts.completed}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-red-700">
                          {row.counts.cancelled + row.counts.withdrawn}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {row.retentionRate !== null ? (
                          <span
                            className={[
                              "font-mono text-sm font-semibold",
                              row.retentionRate >= 70 ? "text-forest" : row.retentionRate < 50 ? "text-red-600" : "text-amber-700",
                            ].join(" ")}
                          >
                            {row.retentionRate}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {row.completionRate !== null ? (
                          <span className="font-mono text-sm font-semibold text-ink">
                            {row.completionRate}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
