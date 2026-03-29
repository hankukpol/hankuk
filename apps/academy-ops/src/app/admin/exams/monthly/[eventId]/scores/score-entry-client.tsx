"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { DivisionGroup, RegistrationWithScore } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScoreRow = {
  registrationId: string;
  examNumber: string | null;
  name: string;
  seatNumber: string | null;
  savedScore: number | null;
  savedRank: number | null;
  inputScore: string; // controlled input string
};

type Stats = {
  count: number;
  avg: number;
  max: number;
  min: number;
  passCount: number; // 60점 이상
  passRate: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeRanks(rows: ScoreRow[]): Map<string, number> {
  const ranked = rows
    .filter((r) => r.inputScore !== "" && !Number.isNaN(Number(r.inputScore)))
    .map((r) => ({ id: r.registrationId, score: Number(r.inputScore) }))
    .sort((a, b) => b.score - a.score);

  const rankMap = new Map<string, number>();
  ranked.forEach((r, i) => {
    // Dense rank: same score → same rank
    if (i > 0 && ranked[i - 1].score === r.score) {
      rankMap.set(r.id, rankMap.get(ranked[i - 1].id)!);
    } else {
      rankMap.set(r.id, i + 1);
    }
  });
  return rankMap;
}

function computeStats(rows: ScoreRow[]): Stats {
  const scores = rows
    .filter((r) => r.inputScore !== "" && !Number.isNaN(Number(r.inputScore)))
    .map((r) => Number(r.inputScore));

  if (scores.length === 0) {
    return { count: 0, avg: 0, max: 0, min: 0, passCount: 0, passRate: 0 };
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  const passCount = scores.filter((s) => s >= 60).length;
  return {
    count: scores.length,
    avg: Math.round((sum / scores.length) * 10) / 10,
    max: Math.max(...scores),
    min: Math.min(...scores),
    passCount,
    passRate: Math.round((passCount / scores.length) * 1000) / 10,
  };
}

function initRows(registrations: RegistrationWithScore[]): ScoreRow[] {
  return registrations.map((r) => ({
    registrationId: r.id,
    examNumber: r.examNumber,
    name: r.student?.name ?? r.externalName ?? "-",
    seatNumber: r.seatNumber,
    savedScore: r.score?.score ?? null,
    savedRank: r.score?.rank ?? null,
    inputScore: r.score?.score != null ? String(r.score.score) : "",
  }));
}

// ─── Division Tab ─────────────────────────────────────────────────────────────

function DivisionScoreTable({
  rows,
  onScoreChange,
  isSaved,
}: {
  rows: ScoreRow[];
  onScoreChange: (registrationId: string, value: string) => void;
  isSaved: boolean;
}) {
  const rankMap = computeRanks(rows);
  const stats = computeStats(rows);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead>
            <tr className="bg-mist/60">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                순위
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                학번
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                이름
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                좌석
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate">
                점수 입력
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((row) => {
              const rank = rankMap.get(row.registrationId);
              const scoreNum =
                row.inputScore !== "" && !Number.isNaN(Number(row.inputScore))
                  ? Number(row.inputScore)
                  : null;
              const isPass = scoreNum !== null && scoreNum >= 60;
              return (
                <tr key={row.registrationId} className="transition hover:bg-mist/30">
                  <td className="px-4 py-3 tabular-nums">
                    {rank != null ? (
                      <span
                        className={`inline-flex w-8 items-center justify-center rounded-full text-xs font-bold ${
                          rank === 1
                            ? "bg-amber-100 text-amber-700"
                            : rank <= 3
                              ? "bg-slate/10 text-slate"
                              : "text-slate"
                        }`}
                      >
                        {rank}
                      </span>
                    ) : (
                      <span className="text-ink/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.examNumber ? (
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-mono text-xs font-semibold text-forest hover:underline"
                      >
                        {row.examNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate">외부</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 tabular-nums text-xs text-slate">
                    {row.seatNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {scoreNum !== null && (
                        <span
                          className={`text-xs font-semibold ${isPass ? "text-forest" : "text-red-600"}`}
                        >
                          {isPass ? "합격" : "불합격"}
                        </span>
                      )}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={row.inputScore}
                        onChange={(e) => onScoreChange(row.registrationId, e.target.value)}
                        placeholder="점수"
                        className={`w-24 rounded-xl border px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none ${
                          isSaved && row.inputScore !== "" && String(row.savedScore) === row.inputScore
                            ? "border-forest/30 bg-forest/5"
                            : "border-ink/20 bg-white focus:border-ember"
                        }`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "입력 인원", value: `${stats.count}명` },
            { label: "평균", value: `${stats.avg}점` },
            { label: "최고점", value: `${stats.max}점` },
            { label: "최저점", value: `${stats.min}점` },
            { label: "합격률", value: `${stats.passRate}% (${stats.passCount}명)` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[16px] border border-ink/10 bg-white px-4 py-3"
            >
              <p className="text-xs text-slate">{s.label}</p>
              <p className="mt-1 text-base font-bold text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function ScoreEntryClient({
  eventId,
  divisionGroups,
}: {
  eventId: string;
  divisionGroups: DivisionGroup[];
}) {
  const [activeTab, setActiveTab] = useState<string>(
    divisionGroups[0]?.division ?? "",
  );
  const [rowsMap, setRowsMap] = useState<Map<string, ScoreRow[]>>(() => {
    const m = new Map<string, ScoreRow[]>();
    for (const g of divisionGroups) {
      m.set(g.division, initRows(g.registrations));
    }
    return m;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedDivision, setSavedDivision] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleScoreChange = useCallback(
    (division: string, registrationId: string, value: string) => {
      setRowsMap((prev) => {
        const next = new Map(prev);
        const rows = (next.get(division) ?? []).map((r) =>
          r.registrationId === registrationId ? { ...r, inputScore: value } : r,
        );
        next.set(division, rows);
        return next;
      });
      setSaveResult(null);
      setSaveError(null);
    },
    [],
  );

  const handleSave = async (division: string) => {
    const rows = rowsMap.get(division) ?? [];
    const rankMap = computeRanks(rows);

    const scores = rows
      .filter((r) => r.inputScore !== "" && !Number.isNaN(Number(r.inputScore)))
      .map((r) => ({
        registrationId: r.registrationId,
        score: Number(r.inputScore),
        rank: rankMap.get(r.registrationId) ?? null,
      }));

    if (scores.length === 0) {
      setSaveError("입력된 점수가 없습니다.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveResult(null);

    try {
      const res = await fetch(`/api/exams/monthly/${eventId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");

      setSaveResult(json.data);
      setSavedDivision(division);

      // Update saved state in rows
      setRowsMap((prev) => {
        const next = new Map(prev);
        const updatedRows = (next.get(division) ?? []).map((r) => ({
          ...r,
          savedScore:
            r.inputScore !== "" && !Number.isNaN(Number(r.inputScore))
              ? Number(r.inputScore)
              : r.savedScore,
          savedRank: rankMap.get(r.registrationId) ?? r.savedRank,
        }));
        next.set(division, updatedRows);
        return next;
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCsvImport = (division: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") return;

      const lines = text.split(/\r?\n/).filter(Boolean);
      // Skip header line if it contains non-numeric first column
      const dataLines = lines.filter((line) => {
        const [col1] = line.split(",");
        return col1 && !Number.isNaN(Number(col1.trim()));
      });

      const importMap = new Map<string, number>();
      for (const line of dataLines) {
        const cols = line.split(",").map((c) => c.trim());
        const examNumber = cols[0];
        const score = Number(cols[1]);
        if (examNumber && !Number.isNaN(score)) {
          importMap.set(examNumber, score);
        }
      }

      setRowsMap((prev) => {
        const next = new Map(prev);
        const updatedRows = (next.get(division) ?? []).map((r) => {
          if (r.examNumber && importMap.has(r.examNumber)) {
            return { ...r, inputScore: String(importMap.get(r.examNumber)) };
          }
          return r;
        });
        next.set(division, updatedRows);
        return next;
      });
    };
    reader.readAsText(file);
  };

  const activeRows = rowsMap.get(activeTab) ?? [];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-1">
        {divisionGroups.map((g) => {
          const rows = rowsMap.get(g.division) ?? [];
          const filled = rows.filter(
            (r) => r.inputScore !== "" && !Number.isNaN(Number(r.inputScore)),
          ).length;
          return (
            <button
              key={g.division}
              type="button"
              onClick={() => {
                setActiveTab(g.division);
                setSaveResult(null);
                setSaveError(null);
              }}
              className={`rounded-t-xl px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === g.division
                  ? "border-b-2 border-ember text-ember"
                  : "text-slate hover:text-ink"
              }`}
            >
              {g.label}
              <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs">
                {filled}/{rows.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* CSV Import */}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/30 hover:text-forest">
          CSV 가져오기
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleCsvImport(activeTab, file);
                e.target.value = "";
              }
            }}
          />
        </label>
        <span className="text-xs text-slate">CSV 형식: 학번, 점수 (헤더 없이)</span>

        <div className="ml-auto flex items-center gap-3">
          {saveResult && savedDivision === activeTab && (
            <span className="text-sm font-semibold text-forest">
              {saveResult.saved}건 저장 완료
            </span>
          )}
          {saveError && (
            <span className="text-sm font-semibold text-red-600">{saveError}</span>
          )}
          <button
            type="button"
            onClick={() => handleSave(activeTab)}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                저장 중…
              </>
            ) : (
              "일괄 저장"
            )}
          </button>
        </div>
      </div>

      {/* Score Table for Active Division */}
      {divisionGroups
        .filter((g) => g.division === activeTab)
        .map((g) => (
          <DivisionScoreTable
            key={g.division}
            rows={activeRows}
            onScoreChange={(rid, val) => handleScoreChange(g.division, rid, val)}
            isSaved={savedDivision === g.division}
          />
        ))}
    </div>
  );
}
