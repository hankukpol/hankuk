"use client";

import { useRef, useState } from "react";
import type { ScoreRow } from "./page";

type Props = {
  eventId: string;
  eventTitle: string;
  initialRows: ScoreRow[];
  divisionLabel: Record<string, string>;
};

type EditableRow = ScoreRow & {
  draftScore: string;
  draftNote: string;
  dirty: boolean;
};

function parseScore(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || num < 0 || num > 100) return null;
  return num;
}

export function ScoreEntry({ eventId, eventTitle, initialRows, divisionLabel }: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initialRows.map((r) => ({
      ...r,
      draftScore: r.score !== null ? String(r.score) : "",
      draftNote: r.note ?? "",
      dirty: false,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group rows by division
  const divisions = Array.from(new Set(rows.map((r) => r.division)));

  function handleScoreChange(registrationId: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.registrationId === registrationId
          ? { ...r, draftScore: value, dirty: true }
          : r,
      ),
    );
  }

  function handleNoteChange(registrationId: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.registrationId === registrationId
          ? { ...r, draftNote: value, dirty: true }
          : r,
      ),
    );
  }

  async function handleSave() {
    const toSave = rows.filter((r) => {
      const s = parseScore(r.draftScore);
      return r.dirty && s !== null;
    });

    if (toSave.length === 0) {
      setError("저장할 성적 데이터가 없습니다. 점수를 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/exams/external/${eventId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scores: toSave.map((r) => ({
            registrationId: r.registrationId,
            score: parseScore(r.draftScore)!,
            note: r.draftNote.trim() || undefined,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");

      setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      // Reload to get updated ranks
      const scoresRes = await fetch(`/api/exams/external/${eventId}/scores`);
      const scoresJson = await scoresRes.json();
      if (scoresRes.ok && Array.isArray(scoresJson.data)) {
        type ApiRow = {
          registrationId: string;
          examNumber: string | null;
          externalName: string | null;
          externalPhone: string | null;
          division: string;
          seatNumber: string | null;
          student: { examNumber: string; name: string; mobile: string | null } | null;
          score: { id: string; score: number; rank: number | null; note: string | null } | null;
        };
        setRows((prev) =>
          prev.map((r) => {
            const updated = (scoresJson.data as ApiRow[]).find(
              (d) => d.registrationId === r.registrationId,
            );
            if (!updated) return r;
            return {
              ...r,
              score: updated.score?.score ?? null,
              rank: updated.score?.rank ?? null,
              note: updated.score?.note ?? null,
              draftScore: updated.score?.score !== undefined ? String(updated.score.score) : r.draftScore,
              draftNote: updated.score?.note ?? r.draftNote,
              dirty: false,
            };
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // CSV import
  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") return;

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setError("CSV 파일이 비어있거나 헤더만 있습니다.");
        return;
      }

      // Expected columns: registrationId or examNumber, score, note(optional)
      // Detect header
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const regIdIdx = header.indexOf("registrationid");
      const examNumIdx = header.indexOf("학번");
      const scoreIdx = header.findIndex((h) => h === "score" || h === "점수");
      const noteIdx = header.findIndex((h) => h === "note" || h === "비고");

      if (scoreIdx === -1) {
        setError("CSV에 'score' 또는 '점수' 열이 필요합니다.");
        return;
      }

      let importCount = 0;
      setRows((prev) => {
        const updated = [...prev];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim());
          const scoreVal = cols[scoreIdx];

          let rowIdx = -1;
          if (regIdIdx !== -1 && cols[regIdIdx]) {
            rowIdx = updated.findIndex((r) => r.registrationId === cols[regIdIdx]);
          } else if (examNumIdx !== -1 && cols[examNumIdx]) {
            rowIdx = updated.findIndex((r) => r.examNumber === cols[examNumIdx]);
          }

          if (rowIdx === -1) continue;
          if (!scoreVal) continue;

          updated[rowIdx] = {
            ...updated[rowIdx],
            draftScore: scoreVal,
            draftNote: noteIdx !== -1 ? (cols[noteIdx] ?? updated[rowIdx].draftNote) : updated[rowIdx].draftNote,
            dirty: true,
          };
          importCount++;
        }
        return updated;
      });

      if (importCount === 0) {
        setError("일치하는 데이터를 찾지 못했습니다. CSV 형식을 확인하세요.");
      } else {
        setError(null);
        setSavedAt(null);
      }
    };
    reader.readAsText(file, "utf-8");

    // Reset input so same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCsvExport() {
    const header = ["registrationId", "학번", "이름", "구분", "좌석", "점수", "순위", "비고"];
    const csvRows = rows.map((r) => {
      const name = r.studentName ?? r.externalName ?? "-";
      const id = r.examNumber ?? "-";
      return [
        r.registrationId,
        id,
        name,
        divisionLabel[r.division] ?? r.division,
        r.seatNumber ?? "",
        r.score !== null ? String(r.score) : "",
        r.rank !== null ? String(r.rank) : "",
        r.note ?? "",
      ].join(",");
    });
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${eventTitle}_성적_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dirtyCount = rows.filter((r) => r.dirty && parseScore(r.draftScore) !== null).length;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            CSV 가져오기
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleCsvImport}
            />
          </label>
          <button
            type="button"
            onClick={handleCsvExport}
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV 내보내기
          </button>
        </div>

        <div className="flex items-center gap-4">
          {savedAt && !saving && (
            <p className="text-xs text-forest">{savedAt} 저장 완료</p>
          )}
          {dirtyCount > 0 && (
            <p className="text-xs text-amber-600">{dirtyCount}건 미저장</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                저장 중...
              </>
            ) : (
              "저장"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CSV format hint */}
      <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-5 py-3 text-xs text-slate">
        <strong className="text-ink">CSV 가져오기 형식:</strong>{" "}
        헤더 행 필수. 열: <code>registrationId</code> 또는 <code>학번</code>,{" "}
        <code>score</code> 또는 <code>점수</code>, <code>note</code> 또는{" "}
        <code>비고</code>(선택). 순위는 저장 시 자동 계산됩니다.
      </div>

      {/* Score tables by division */}
      {rows.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white py-16 text-center text-sm text-slate shadow-sm">
          등록된 응시자가 없습니다.
        </div>
      ) : (
        divisions.map((division) => {
          const divRows = rows.filter((r) => r.division === division);
          const divScored = divRows.filter((r) => parseScore(r.draftScore) !== null).length;

          return (
            <div key={division} className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                    {divisionLabel[division] ?? division}
                  </span>
                  <span className="text-sm text-slate">
                    {divRows.length}명 접수 · 성적 입력 {divScored}명
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist text-left">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                        좌석
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                        학번
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                        이름
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                        점수 (0–100)
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                        순위
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                        비고
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {divRows.map((row) => {
                      const name = row.studentName ?? row.externalName ?? "-";
                      const examId = row.examNumber ?? null;
                      const parsedScore = parseScore(row.draftScore);
                      const isInvalidScore =
                        row.draftScore !== "" &&
                        row.draftScore !== "-" &&
                        parsedScore === null;

                      return (
                        <tr
                          key={row.registrationId}
                          className={`transition-colors hover:bg-mist/60 ${
                            row.dirty ? "bg-amber-50/30" : ""
                          }`}
                        >
                          <td className="px-5 py-2 font-mono text-xs text-slate">
                            {row.seatNumber ?? "-"}
                          </td>
                          <td className="px-5 py-2">
                            {examId ? (
                              <a
                                href={`/admin/students/${examId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-forest hover:underline"
                              >
                                {examId}
                              </a>
                            ) : (
                              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">
                                외부
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2 font-medium text-ink">{name}</td>
                          <td className="px-5 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={row.draftScore}
                              onChange={(e) =>
                                handleScoreChange(row.registrationId, e.target.value)
                              }
                              placeholder="-"
                              className={`w-24 rounded-xl border px-3 py-1.5 text-sm font-mono transition focus:outline-none focus:ring-2 focus:ring-[#C55A11]/30 ${
                                isInvalidScore
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : "border-ink/15 bg-white"
                              }`}
                            />
                          </td>
                          <td className="px-5 py-2 text-right font-mono text-sm text-slate">
                            {row.rank !== null ? (
                              <span className="font-semibold text-ink">{row.rank}위</span>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td className="px-5 py-2">
                            <input
                              type="text"
                              value={row.draftNote}
                              onChange={(e) =>
                                handleNoteChange(row.registrationId, e.target.value)
                              }
                              placeholder="메모"
                              className="w-32 rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-[#C55A11]/30"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
