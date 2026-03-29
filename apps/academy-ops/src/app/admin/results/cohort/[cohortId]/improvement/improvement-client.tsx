"use client";

import { useState } from "react";
import Link from "next/link";

export type ImprovementRow = {
  rank: number;
  examNumber: string;
  name: string;
  earlyAvg: number | null;
  recentAvg: number | null;
  delta: number | null;
  attendanceRate: number | null;
  sessionCount: number;
};

type SortKey = "delta_desc" | "delta_asc" | "name";

interface Props {
  rows: ImprovementRow[];
  cohortId: string;
}

function deltaBg(delta: number | null): string {
  if (delta === null) return "border-ink/10 bg-ink/5 text-slate";
  if (delta >= 5) return "border-green-300 bg-green-100 text-green-800";
  if (delta >= 1) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (delta > -1) return "border-ink/10 bg-ink/5 text-slate";
  if (delta > -5) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function deltaArrow(delta: number | null): string {
  if (delta === null) return "—";
  if (delta > 0) return "▲";
  if (delta < 0) return "▼";
  return "■";
}

export function ImprovementClient({ rows, cohortId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("delta_desc");

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "delta_desc") {
      const da = a.delta ?? -Infinity;
      const db = b.delta ?? -Infinity;
      return db - da;
    }
    if (sortKey === "delta_asc") {
      const da = a.delta ?? Infinity;
      const db = b.delta ?? Infinity;
      return da - db;
    }
    return a.name.localeCompare(b.name, "ko");
  });

  // Re-rank based on sort order
  const ranked = sorted.map((row, i) => ({ ...row, displayRank: i + 1 }));

  const improved = rows.filter((r) => (r.delta ?? 0) > 0).length;
  const declined = rows.filter((r) => (r.delta ?? 0) < 0).length;
  const avgDelta =
    rows.filter((r) => r.delta !== null).length > 0
      ? Math.round(
          (rows
            .filter((r) => r.delta !== null)
            .reduce((a, b) => a + (b.delta ?? 0), 0) /
            rows.filter((r) => r.delta !== null).length) *
            10,
        ) / 10
      : null;

  return (
    <div className="mt-8 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 수강생</p>
          <p className="mt-3 text-3xl font-bold text-ink">{rows.length}</p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">향상 학생</p>
          <p className="mt-3 text-3xl font-bold text-forest">{improved}</p>
          <p className="mt-1 text-xs text-slate">delta &gt; 0</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">퇴보 학생</p>
          <p className="mt-3 text-3xl font-bold text-ember">{declined}</p>
          <p className="mt-1 text-xs text-slate">delta &lt; 0</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">평균 향상도</p>
          {avgDelta !== null ? (
            <p
              className={`mt-3 text-3xl font-bold ${
                avgDelta >= 0 ? "text-forest" : "text-ember"
              }`}
            >
              {avgDelta > 0 ? "+" : ""}
              {avgDelta}점
            </p>
          ) : (
            <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
          )}
          <p className="mt-1 text-xs text-slate">초반 vs 최근 4회</p>
        </div>
      </div>

      {/* Sort Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">정렬:</span>
        {(
          [
            { key: "delta_desc", label: "향상도 높은순" },
            { key: "delta_asc", label: "향상도 낮은순" },
            { key: "name", label: "이름순" },
          ] as { key: SortKey; label: string }[]
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              sortKey === opt.key
                ? "border-forest/30 bg-forest text-white"
                : "border-ink/10 bg-white text-slate hover:border-forest/30 hover:text-forest"
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* Export hint */}
        <div className="ml-auto">
          <Link
            href={`/admin/export?cohortId=${cohortId}&type=improvement`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            엑셀로 내보내기
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        {ranked.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            이 기수에 성적 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">학번</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">이름</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">
                    초반 평균
                    <span className="ml-1 text-[10px] font-normal text-ink/40">(1~4회)</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">
                    최근 평균
                    <span className="ml-1 text-[10px] font-normal text-ink/40">(최근 4회)</span>
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">향상도</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">출석률</th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {ranked.map((row) => {
                  const statusBadge =
                    row.delta !== null
                      ? row.delta >= 5
                        ? { label: "급성장", cls: "border-green-300 bg-green-100 text-green-800" }
                        : row.delta >= 1
                          ? { label: "향상", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" }
                          : row.delta > -1
                            ? { label: "유지", cls: "border-ink/10 bg-ink/5 text-slate" }
                            : row.delta > -5
                              ? { label: "하락", cls: "border-amber-200 bg-amber-50 text-amber-700" }
                              : { label: "급하락", cls: "border-red-200 bg-red-50 text-red-700" }
                      : null;

                  return (
                    <tr key={row.examNumber} className="transition hover:bg-mist/60">
                      <td className="px-4 py-3 font-mono text-sm text-slate">
                        {row.displayRank}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-mono text-forest hover:underline"
                        >
                          {row.examNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate">
                        {row.earlyAvg !== null ? `${row.earlyAvg}점` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.recentAvg !== null ? `${row.recentAvg}점` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.delta !== null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${deltaBg(row.delta)}`}
                          >
                            {deltaArrow(row.delta)}{" "}
                            {Math.abs(row.delta).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-ink/25 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                        {row.attendanceRate !== null
                          ? `${row.attendanceRate}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {statusBadge ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}
                          >
                            {statusBadge.label}
                          </span>
                        ) : (
                          <span className="text-ink/25 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
