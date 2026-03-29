"use client";

import { useCallback, useMemo, useState } from "react";
import { AttendType, Subject } from "@prisma/client";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { getScoreSubjectLabel, type ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";

type SessionOption = {
  id: number;
  examType: string;
  week: number;
  subject: string;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  isLocked: boolean;
  periodName: string;
};

type StudentRow = {
  examNumber: string;
  name: string;
};

type ScoreEntry = {
  score: string;
  absent: boolean;
};

type SubmitResult = {
  ok: boolean;
  message: string;
};

type Props = {
  sessions: SessionOption[];
  students: StudentRow[];
  subjectLabelMap: ScoreSubjectLabelMap;
};

function formatDate(iso: string) {
  const date = new Date(iso);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}(${weekday})`;
}

function createEmptyEntries(students: StudentRow[]) {
  return Object.fromEntries(
    students.map((student) => [student.examNumber, { score: "", absent: false }]),
  ) as Record<string, ScoreEntry>;
}

export function QuickEntryForm({ sessions, students, subjectLabelMap }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    sessions.length > 0 ? sessions[0].id : null,
  );
  const [entries, setEntries] = useState<Record<string, ScoreEntry>>(() => createEmptyEntries(students));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  const stats = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    let scoredCount = 0;
    let totalScore = 0;

    for (const entry of Object.values(entries)) {
      if (entry.absent) {
        absentCount += 1;
        continue;
      }

      presentCount += 1;
      const value = Number(entry.score);
      if (!Number.isNaN(value) && entry.score.trim() !== "") {
        totalScore += value;
        scoredCount += 1;
      }
    }

    return {
      presentCount,
      absentCount,
      average: scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : null,
    };
  }, [entries]);

  const handleSessionChange = useCallback((value: string) => {
    const nextSessionId = Number(value);
    setSelectedSessionId(Number.isNaN(nextSessionId) ? null : nextSessionId);
    setResult(null);
  }, []);

  const handleScoreChange = useCallback((examNumber: string, value: string) => {
    setEntries((prev) => ({
      ...prev,
      [examNumber]: { ...prev[examNumber], score: value },
    }));
  }, []);

  const handleAbsentChange = useCallback((examNumber: string, checked: boolean) => {
    setEntries((prev) => ({
      ...prev,
      [examNumber]: {
        ...prev[examNumber],
        absent: checked,
        score: checked ? "" : prev[examNumber].score,
      },
    }));
  }, []);

  const handleMarkAllAbsent = useCallback(() => {
    setEntries((prev) =>
      Object.fromEntries(
        Object.keys(prev).map((examNumber) => [examNumber, { score: "", absent: true }]),
      ) as Record<string, ScoreEntry>,
    );
    setResult(null);
  }, []);

  const handleReset = useCallback(() => {
    setEntries(createEmptyEntries(students));
    setResult(null);
  }, [students]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSession) {
      setResult({ ok: false, message: "회차를 먼저 선택해 주세요." });
      return;
    }

    if (selectedSession.isLocked) {
      setResult({ ok: false, message: "잠금된 회차입니다. 이 화면에서는 수정할 수 없습니다." });
      return;
    }

    const lines: string[] = [];
    for (const student of students) {
      const entry = entries[student.examNumber];
      if (!entry) {
        continue;
      }

      if (entry.absent) {
        lines.push(`${student.examNumber}\t${student.name}\t결석`);
        continue;
      }

      const trimmedScore = entry.score.trim();
      if (trimmedScore === "") {
        continue;
      }

      lines.push(`${student.examNumber}\t${student.name}\t${trimmedScore}`);
    }

    if (lines.length === 0) {
      setResult({ ok: false, message: "입력된 점수가 없습니다." });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/scores/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          sessionId: selectedSession.id,
          text: lines.join("\n"),
          attendType: AttendType.NORMAL,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        inserted?: number;
        updated?: number;
        skipped?: number;
      };

      if (!response.ok || payload.error) {
        setResult({ ok: false, message: payload.error ?? "성적 저장에 실패했습니다." });
        return;
      }

      const inserted = payload.inserted ?? 0;
      const updated = payload.updated ?? 0;
      const skipped = payload.skipped ?? 0;
      setResult({
        ok: true,
        message: `처리 완료: 신규 ${inserted}건, 수정 ${updated}건${skipped > 0 ? `, 건너뜀 ${skipped}건` : ""}`,
      });
    } catch {
      setResult({ ok: false, message: "네트워크 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  }, [entries, selectedSession, students]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-base font-semibold text-ink">회차 선택</h2>
        <div className="mt-4">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate">등록된 회차가 없습니다.</p>
          ) : (
            <select
              value={selectedSessionId ?? ""}
              onChange={(event) => handleSessionChange(event.target.value)}
              className="w-full max-w-xl rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            >
              {sessions.map((session) => (
                <option
                  key={session.id}
                  value={session.id}
                  disabled={session.isCancelled || session.isLocked}
                >
                  [{session.periodName}] {session.week}주차 {formatDate(session.examDate)} {EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL]} {getScoreSubjectLabel(session.subject as Subject, session.displaySubjectName, subjectLabelMap)}{session.isCancelled ? " [취소]" : ""}{session.isLocked ? " [잠금]" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedSession && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              {formatDate(selectedSession.examDate)}
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {selectedSession.week}주차
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {EXAM_TYPE_LABEL[selectedSession.examType as keyof typeof EXAM_TYPE_LABEL]}
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {getScoreSubjectLabel(selectedSession.subject as Subject, selectedSession.displaySubjectName, subjectLabelMap)}
            </span>
            {selectedSession.isLocked && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                잠금됨
              </span>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleMarkAllAbsent}
          className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          전체 결석
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          초기화
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-4 text-sm text-slate">
          <span>
            응시 <span className="font-semibold text-ink">{stats.presentCount}</span>
          </span>
          <span>
            결석 <span className="font-semibold text-red-600">{stats.absentCount}</span>
          </span>
          <span>
            평균 <span className="font-semibold text-ink">{stats.average !== null ? `${stats.average}점` : "-"}</span>
          </span>
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 bg-mist px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">
            수강생 점수 입력 <span className="ml-1 font-normal text-slate">(총 {students.length}명)</span>
          </h2>
        </div>

        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate">현재 지점에 활성 학생이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50 text-xs text-slate">
                  <th className="px-4 py-3 text-left font-semibold">학번</th>
                  <th className="px-4 py-3 text-left font-semibold">이름</th>
                  <th className="w-40 px-4 py-3 text-center font-semibold">점수</th>
                  <th className="w-24 px-4 py-3 text-center font-semibold">결석</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {students.map((student) => {
                  const entry = entries[student.examNumber] ?? { score: "", absent: false };
                  return (
                    <tr
                      key={student.examNumber}
                      className={entry.absent ? "bg-red-50/60 transition hover:bg-red-50" : "transition hover:bg-mist/40"}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate">{student.examNumber}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{student.name}</td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="점수"
                          value={entry.score}
                          disabled={entry.absent}
                          onChange={(event) => handleScoreChange(student.examNumber, event.target.value)}
                          className="w-28 rounded-xl border border-ink/10 px-3 py-1.5 text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest/30 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={entry.absent}
                          onChange={(event) => handleAbsentChange(student.examNumber, event.target.checked)}
                          className="h-4 w-4 cursor-pointer rounded accent-red-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-ink/10 bg-mist/60 px-6 py-4">
          <div className="flex gap-6 text-sm">
            <span>
              응시 <span className="font-semibold text-forest">{stats.presentCount}명</span>
            </span>
            <span>
              결석 <span className="font-semibold text-red-600">{stats.absentCount}명</span>
            </span>
            <span>
              실점 평균 <span className="font-semibold text-ink">{stats.average !== null ? `${stats.average}점` : "-"}</span>
            </span>
          </div>
        </div>
      </section>

      {result && (
        <div
          className={result.ok ? "rounded-[20px] border border-forest/30 bg-forest/10 p-4 text-sm font-medium text-forest" : "rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600"}
        >
          {result.message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={submitting || !selectedSession || selectedSession.isLocked}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              저장 중...
            </>
          ) : (
            "일괄 저장"
          )}
        </button>
      </div>
    </div>
  );
}
