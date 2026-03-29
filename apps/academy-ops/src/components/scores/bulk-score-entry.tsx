"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getScoreSubjectLabel, type ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";
import { AttendType, ExamType, Subject } from "@prisma/client";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type SessionOption = {
  id: number;
  examType: ExamType;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  isLocked: boolean;
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  sessions: SessionOption[];
};

type StudentOption = {
  examNumber: string;
  name: string;
  examType: ExamType;
  className: string | null;
};

type BulkScoreEntryProps = {
  periods: PeriodOption[];
  students: StudentOption[];
  subjectLabelMap: ScoreSubjectLabelMap;
};

// Per-row draft score state
type ScoreDraft = {
  rawScore: string; // "" = absent/not entered
  attendType: AttendType;
  dirty: boolean; // has the user touched this row?
};

type SaveState =
  | { type: "idle" }
  | { type: "pending" }
  | { type: "success"; saved: number; failed: number }
  | { type: "error"; message: string };

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildDraftKey(examNumber: string) {
  return examNumber;
}

function defaultDraft(): ScoreDraft {
  return { rawScore: "", attendType: AttendType.NORMAL, dirty: false };
}

// Validate raw score: null if empty (absent), or 0–100
function validateScore(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, message: "점수는 0–100 사이 숫자 또는 빈값이어야 합니다." };
  }
  return { ok: true, value: Math.round(n * 10) / 10 };
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function BulkScoreEntry({ periods, students, subjectLabelMap }: BulkScoreEntryProps) {
  // ── Step 1: Period + session selection ──
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(
    () => periods.find((p) => p.isActive)?.id ?? periods[0]?.id ?? null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // ── Step 2: Class (className) filter ──
  const [selectedClass, setSelectedClass] = useState<string>("__ALL__");

  // ── Score drafts: keyed by examNumber ──
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({});

  // ── Save state ──
  const [saveState, setSaveState] = useState<SaveState>({ type: "idle" });
  const [isPending, startTransition] = useTransition();

  // Derived: selected period
  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  // Derived: available sessions for selected period
  const availableSessions = selectedPeriod?.sessions ?? [];

  // Derived: selected session
  const selectedSession = useMemo(
    () => availableSessions.find((s) => s.id === selectedSessionId) ?? null,
    [availableSessions, selectedSessionId],
  );

  // Derived: students filtered to session's exam type
  const studentsForSession = useMemo(() => {
    if (!selectedSession) return [];
    return students.filter((s) => s.examType === selectedSession.examType);
  }, [students, selectedSession]);

  // Derived: unique class names for students in session's exam type
  const classNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of studentsForSession) {
      names.add(s.className ?? "반 미지정");
    }
    return Array.from(names).sort();
  }, [studentsForSession]);

  // Derived: students shown in table (filtered by class)
  const tableStudents = useMemo(() => {
    if (selectedClass === "__ALL__") return studentsForSession;
    const targetClass = selectedClass === "__UNASSIGNED__" ? null : selectedClass;
    return studentsForSession.filter((s) =>
      targetClass === null ? s.className === null : s.className === targetClass,
    );
  }, [studentsForSession, selectedClass]);

  // Derived: number of dirty rows
  const dirtyCount = useMemo(() => {
    return Object.values(drafts).filter((d) => d.dirty).length;
  }, [drafts]);

  // ── Handlers ──

  const handlePeriodChange = useCallback((periodId: number) => {
    setSelectedPeriodId(periodId);
    setSelectedSessionId(null);
    setSelectedClass("__ALL__");
    setDrafts({});
    setSaveState({ type: "idle" });
  }, []);

  const handleSessionChange = useCallback((sessionId: number) => {
    setSelectedSessionId(sessionId);
    setSelectedClass("__ALL__");
    setDrafts({});
    setSaveState({ type: "idle" });
  }, []);

  const handleScoreChange = useCallback((examNumber: string, rawScore: string) => {
    setDrafts((prev) => {
      const existing = prev[buildDraftKey(examNumber)] ?? defaultDraft();
      return {
        ...prev,
        [buildDraftKey(examNumber)]: { ...existing, rawScore, dirty: true },
      };
    });
    setSaveState((prev) => (prev.type === "success" || prev.type === "error" ? { type: "idle" } : prev));
  }, []);

  const handleAttendTypeChange = useCallback((examNumber: string, attendType: AttendType) => {
    setDrafts((prev) => {
      const existing = prev[buildDraftKey(examNumber)] ?? defaultDraft();
      return {
        ...prev,
        [buildDraftKey(examNumber)]: { ...existing, attendType, dirty: true },
      };
    });
    setSaveState((prev) => (prev.type === "success" || prev.type === "error" ? { type: "idle" } : prev));
  }, []);

  // Bulk apply attend type to all dirty or all visible rows
  const handleSetAllAttendType = useCallback(
    (attendType: AttendType) => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const s of tableStudents) {
          const existing = next[buildDraftKey(s.examNumber)] ?? defaultDraft();
          next[buildDraftKey(s.examNumber)] = { ...existing, attendType, dirty: true };
        }
        return next;
      });
    },
    [tableStudents],
  );

  // Clear all drafts for current session/view
  const handleClearAll = useCallback(() => {
    setDrafts({});
    setSaveState({ type: "idle" });
  }, []);

  // Save handler
  const handleSave = useCallback(() => {
    if (!selectedSessionId) return;

    // Validate all dirty rows
    const rows: Array<{
      examNumber: string;
      rawScore: number | null;
      attendType: AttendType;
    }> = [];

    for (const student of tableStudents) {
      const draft = drafts[buildDraftKey(student.examNumber)];
      if (!draft?.dirty) continue;

      const validation = validateScore(draft.rawScore);
      if (!validation.ok) {
        setSaveState({ type: "error", message: `[${student.examNumber}] ${student.name}: ${validation.message}` });
        return;
      }

      rows.push({
        examNumber: student.examNumber,
        rawScore: validation.value,
        attendType: draft.attendType,
      });
    }

    if (rows.length === 0) {
      setSaveState({ type: "error", message: "변경된 점수가 없습니다." });
      return;
    }

    startTransition(async () => {
      setSaveState({ type: "pending" });

      let savedCount = 0;
      let failedCount = 0;

      // Send each row to the paste-based bulk API
      // The bulk endpoint accepts a text format: "학번\t이름\t점수"
      // Build the text payload from dirty rows
      const textLines = rows.map((row) => {
        const student = students.find((s) => s.examNumber === row.examNumber);
        const scorePart = row.rawScore === null ? "" : String(row.rawScore);
        return `${row.examNumber}\t${student?.name ?? ""}\t${scorePart}\t${row.attendType}`;
      });

      const text = textLines.join("\n");

      try {
        const response = await fetch("/api/scores/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "execute",
            sessionId: selectedSessionId,
            text,
          }),
          cache: "no-store",
        });

        const json = (await response.json()) as {
          main?: { success: number; created: number; updated: number; skipped: number };
          error?: string;
        };

        if (!response.ok) {
          setSaveState({
            type: "error",
            message: json.error ?? "저장에 실패했습니다.",
          });
          return;
        }

        savedCount = (json.main?.success ?? 0);
        failedCount = rows.length - savedCount;

        // Mark successfully saved rows as clean
        setDrafts((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            const key = buildDraftKey(row.examNumber);
            if (next[key]) {
              next[key] = { ...next[key], dirty: false };
            }
          }
          return next;
        });

        setSaveState({ type: "success", saved: savedCount, failed: failedCount });
      } catch {
        setSaveState({ type: "error", message: "네트워크 오류가 발생했습니다." });
      }
    });
  }, [selectedSessionId, tableStudents, drafts, students]);

  // ── Render ──

  return (
    <div className="space-y-8">
      {/* ── Step 1: Period ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
        <h2 className="text-sm font-semibold text-slate uppercase tracking-widest mb-4">
          1단계 — 기간 선택
        </h2>
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <button
              key={period.id}
              type="button"
              onClick={() => handlePeriodChange(period.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedPeriodId === period.id
                  ? "bg-forest text-white"
                  : "border border-ink/10 text-ink hover:border-forest/40 hover:text-forest"
              }`}
            >
              {period.name}
              {period.isActive ? (
                <span className="ml-1.5 text-xs opacity-75">활성</span>
              ) : null}
            </button>
          ))}
          {periods.length === 0 ? (
            <p className="text-sm text-slate">
              등록된 시험 기간이 없습니다.{" "}
              <Link href="/admin/periods" className="text-ember underline">
                기간 등록
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Step 2: Session (round) ── */}
      {selectedPeriod ? (
        <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <h2 className="text-sm font-semibold text-slate uppercase tracking-widest mb-4">
            2단계 — 회차 선택
          </h2>
          {availableSessions.length > 0 ? (
            <div className="overflow-hidden rounded-[20px] border border-ink/10">
              <div className="max-h-72 overflow-y-auto divide-y divide-ink/10">
                {availableSessions.map((session) => {
                  const isDisabled = session.isCancelled || session.isLocked;
                  const isSelected = selectedSessionId === session.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSessionChange(session.id)}
                      className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-forest text-white"
                          : isDisabled
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-mist"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">
                          {EXAM_TYPE_LABEL[session.examType]}
                        </span>
                        <span className="opacity-60">·</span>
                        {getScoreSubjectLabel(session.subject, session.displaySubjectName, subjectLabelMap)}
                        <span className="opacity-60">·</span>
                        {session.week}주차
                      </span>
                      <span className="text-xs opacity-70">
                        {formatDate(session.examDate)}
                        {session.isCancelled ? " (취소)" : ""}
                        {session.isLocked ? " (잠금)" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate">
              이 기간에 시험 회차가 없습니다.{" "}
              <Link href="/admin/periods" className="text-ember underline">
                회차 추가
              </Link>
            </p>
          )}
        </section>
      ) : null}

      {/* ── Step 3: Class filter + score table ── */}
      {selectedSession ? (
        <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          {/* Section header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
            <div>
              <p className="text-sm font-semibold">
                {EXAM_TYPE_LABEL[selectedSession.examType]}{" "}
                <span className="text-slate">·</span>{" "}
                {getScoreSubjectLabel(
                  selectedSession.subject,
                  selectedSession.displaySubjectName,
                  subjectLabelMap,
                )}{" "}
                <span className="text-slate">·</span>{" "}
                {selectedSession.week}주차{" "}
                <span className="text-slate text-xs ml-1">
                  ({formatDate(selectedSession.examDate)})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate">
                {dirtyCount > 0 ? (
                  <span className="font-semibold text-ember">{dirtyCount}명 변경됨</span>
                ) : (
                  "변경 없음"
                )}
                {" — "}
                {tableStudents.length}명 표시 중
              </p>
            </div>

            {/* Class filter pills */}
            {classNames.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedClass("__ALL__")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedClass === "__ALL__"
                      ? "bg-ink text-white"
                      : "border border-ink/10 hover:border-ink/30"
                  }`}
                >
                  전체
                </button>
                {classNames.map((cn) => (
                  <button
                    key={cn}
                    type="button"
                    onClick={() =>
                      setSelectedClass(cn === "반 미지정" ? "__UNASSIGNED__" : cn)
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      selectedClass ===
                      (cn === "반 미지정" ? "__UNASSIGNED__" : cn)
                        ? "bg-ink text-white"
                        : "border border-ink/10 hover:border-ink/30"
                    }`}
                  >
                    {cn}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Toolbar: bulk attend type set + clear */}
          <div className="flex flex-wrap items-center gap-3 border-b border-ink/10 bg-mist px-6 py-3">
            <span className="text-xs font-semibold text-slate">전체 적용:</span>
            {(Object.keys(ATTEND_TYPE_LABEL) as AttendType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSetAllAttendType(type)}
                className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold hover:border-ember/30 hover:text-ember transition"
              >
                {ATTEND_TYPE_LABEL[type]}
              </button>
            ))}
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate hover:border-red-300 hover:text-red-600 transition"
              >
                초기화
              </button>
            </div>
          </div>

          {/* Score table */}
          {tableStudents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-ink/10">
                <thead className="text-left text-xs">
                  <tr>
                    <th className="sticky top-0 z-10 px-5 py-3 font-semibold text-slate bg-mist/95 backdrop-blur-sm">학번</th>
                    <th className="sticky top-0 z-10 px-4 py-3 font-semibold text-slate bg-mist/95 backdrop-blur-sm">이름</th>
                    <th className="sticky top-0 z-10 px-4 py-3 font-semibold text-slate bg-mist/95 backdrop-blur-sm">반</th>
                    <th className="sticky top-0 z-10 px-4 py-3 font-semibold text-slate bg-mist/95 backdrop-blur-sm">
                      {getScoreSubjectLabel(
                        selectedSession.subject,
                        selectedSession.displaySubjectName,
                        subjectLabelMap,
                      )}{" "}
                      <span className="font-normal text-slate/70">(0–100, 빈값=미응시)</span>
                    </th>
                    <th className="sticky top-0 z-10 px-4 py-3 font-semibold text-slate bg-mist/95 backdrop-blur-sm">응시유형</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {tableStudents.map((student) => {
                    const draft = drafts[buildDraftKey(student.examNumber)] ?? defaultDraft();
                    const isDirty = draft.dirty;
                    const scoreValidation =
                      isDirty && draft.rawScore !== ""
                        ? validateScore(draft.rawScore)
                        : null;
                    const hasError =
                      scoreValidation !== null && !scoreValidation.ok;

                    return (
                      <tr
                        key={student.examNumber}
                        className={`transition ${
                          isDirty ? "bg-ember/5" : "hover:bg-mist/60"
                        }`}
                      >
                        {/* 학번 */}
                        <td className="px-5 py-2">
                          <Link
                            href={`/admin/students/${student.examNumber}`}
                            className="font-mono text-xs text-forest hover:underline"
                          >
                            {student.examNumber}
                          </Link>
                        </td>

                        {/* 이름 */}
                        <td className="px-4 py-2 font-semibold">
                          <Link
                            href={`/admin/students/${student.examNumber}`}
                            className="hover:text-ember transition"
                          >
                            {student.name}
                          </Link>
                        </td>

                        {/* 반 */}
                        <td className="px-4 py-2 text-xs text-slate">
                          {student.className ?? <span className="opacity-40">—</span>}
                        </td>

                        {/* 점수 입력 */}
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={draft.rawScore}
                            onChange={(e) =>
                              handleScoreChange(student.examNumber, e.target.value)
                            }
                            placeholder="미응시"
                            data-score-input="true"
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                                e.preventDefault();
                                const inputs = Array.from(
                                  document.querySelectorAll<HTMLInputElement>(
                                    '[data-score-input="true"]',
                                  ),
                                );
                                const idx = inputs.indexOf(e.currentTarget as HTMLInputElement);
                                if (idx >= 0 && idx < inputs.length - 1) {
                                  inputs[idx + 1].focus();
                                  inputs[idx + 1].select();
                                }
                              } else if (e.key === "Tab" && e.shiftKey) {
                                e.preventDefault();
                                const inputs = Array.from(
                                  document.querySelectorAll<HTMLInputElement>(
                                    '[data-score-input="true"]',
                                  ),
                                );
                                const idx = inputs.indexOf(e.currentTarget as HTMLInputElement);
                                if (idx > 0) {
                                  inputs[idx - 1].focus();
                                  inputs[idx - 1].select();
                                }
                              }
                            }}
                            className={`w-24 rounded-xl border px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-forest/30 transition ${
                              hasError
                                ? "border-red-400 bg-red-50 text-red-700"
                                : isDirty
                                ? "border-ember/40 bg-ember/5"
                                : "border-ink/15 bg-white"
                            }`}
                          />
                          {hasError ? (
                            <p className="mt-0.5 text-xs text-red-600">
                              {(scoreValidation as { ok: false; message: string }).message}
                            </p>
                          ) : null}
                        </td>

                        {/* 응시유형 */}
                        <td className="px-4 py-2">
                          <select
                            value={draft.attendType}
                            onChange={(e) =>
                              handleAttendTypeChange(
                                student.examNumber,
                                e.target.value as AttendType,
                              )
                            }
                            className={`rounded-xl border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-forest/30 transition ${
                              isDirty
                                ? "border-ember/40 bg-ember/5"
                                : "border-ink/15 bg-white"
                            }`}
                          >
                            {(Object.entries(ATTEND_TYPE_LABEL) as [AttendType, string][]).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-slate">
              이 회차에 해당하는 수강생이 없습니다.
              {selectedSession
                ? ` (${EXAM_TYPE_LABEL[selectedSession.examType]} 수강생 없음)`
                : ""}
            </div>
          )}

          {/* Save bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 bg-mist/60 px-6 py-4">
            {/* Status messages */}
            <div className="flex-1 min-w-0">
              {saveState.type === "error" ? (
                <p className="text-sm text-red-600">{saveState.message}</p>
              ) : saveState.type === "success" ? (
                <p className="text-sm text-forest font-semibold">
                  {saveState.saved}명 저장 완료
                  {saveState.failed > 0 ? (
                    <span className="ml-2 font-normal text-ember">
                      ({saveState.failed}명 실패)
                    </span>
                  ) : null}
                </p>
              ) : dirtyCount > 0 ? (
                <p className="text-sm text-slate">
                  <span className="font-semibold text-ink">{dirtyCount}명</span>의 점수가 저장되지
                  않았습니다.
                </p>
              ) : (
                <p className="text-sm text-slate/60">저장 대기 중인 변경 없음</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
              >
                초기화
              </button>
              <button
                type="button"
                disabled={isPending || dirtyCount === 0}
                onClick={handleSave}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition ${
                  isPending || dirtyCount === 0
                    ? "cursor-not-allowed bg-ink/30"
                    : "bg-ember hover:bg-ember/90"
                }`}
              >
                {isPending ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    저장 중...
                  </>
                ) : (
                  `${dirtyCount}명 저장`
                )}
              </button>
            </div>
          </div>
        </section>
      ) : selectedPeriodId ? null : null}

      {/* Hint when session not yet selected */}
      {selectedPeriod && !selectedSession ? (
        <div className="rounded-[20px] border border-ink/10 bg-mist px-6 py-8 text-center text-sm text-slate">
          위에서 회차를 선택하면 학생 목록과 점수 입력 표가 나타납니다.
        </div>
      ) : null}
    </div>
  );
}
