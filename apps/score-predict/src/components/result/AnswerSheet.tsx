"use client";

import { useMemo, useState } from "react";

interface SubjectAnswerRow {
  questionNumber: number;
  selectedAnswer: number;
  isCorrect: boolean;
  correctAnswer: number | null;
  correctRate: number;
  difficultyLevel: "EASY" | "NORMAL" | "HARD" | "VERY_HARD";
}

interface SubjectSummary {
  subjectId: number;
  subjectName: string;
  averageCorrectRate: number | null;
  hardestQuestion: number | null;
  hardestRate: number | null;
  easiestQuestion: number | null;
  easiestRate: number | null;
  myCorrectOnHard: number;
  myWrongOnEasy: number;
}

interface SubjectAnswerSheet {
  subjectId: number;
  subjectName: string;
  answers: SubjectAnswerRow[];
}

interface AnswerSheetProps {
  subjects: SubjectAnswerSheet[];
  summaries: SubjectSummary[];
}

function difficultyBadge(level: SubjectAnswerRow["difficultyLevel"]): { label: string; className: string } {
  if (level === "VERY_HARD") {
    return { label: "고난도", className: "bg-rose-100 text-rose-700" };
  }
  if (level === "HARD") {
    return { label: "어려움", className: "bg-amber-100 text-amber-700" };
  }
  if (level === "EASY") {
    return { label: "쉬움", className: "bg-emerald-100 text-emerald-700" };
  }
  return { label: "보통", className: "bg-slate-100 text-slate-700" };
}

function AnswerRowsTable({ rows }: { rows: SubjectAnswerRow[] }) {
  return (
    <div className="space-y-2">
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="min-w-[420px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="border border-slate-200 px-3 py-2 text-left">번호</th>
              <th className="border border-slate-200 px-3 py-2 text-center">내 답</th>
              <th className="border border-slate-200 px-3 py-2 text-center">정답</th>
              <th className="border border-slate-200 px-3 py-2 text-center">결과</th>
              <th className="border border-slate-200 px-3 py-2 text-center">정답률</th>
              <th className="border border-slate-200 px-3 py-2 text-center">난이도</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((answer) => {
              const badge = difficultyBadge(answer.difficultyLevel);
              return (
                <tr key={answer.questionNumber} className="bg-white">
                  <td className="border border-slate-200 px-3 py-2 text-left">{answer.questionNumber}</td>
                  <td className="border border-slate-200 px-3 py-2 text-center">{answer.selectedAnswer}</td>
                  <td className="border border-slate-200 px-3 py-2 text-center">{answer.correctAnswer ?? "-"}</td>
                  <td
                    className={`border border-slate-200 px-3 py-2 text-center font-semibold ${
                      answer.isCorrect ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {answer.isCorrect ? "정답" : "오답"}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-center">{answer.correctRate.toFixed(1)}%</td>
                  <td className="border border-slate-200 px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length < 1 ? (
              <tr>
                <td colSpan={6} className="border border-slate-200 px-3 py-4 text-center text-slate-500">
                  표시할 문항이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.length > 0 ? (
          rows.map((answer) => {
            const badge = difficultyBadge(answer.difficultyLevel);
            return (
              <div key={answer.questionNumber} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{answer.questionNumber}번</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">내 답</span>
                    <span className="font-medium text-slate-800">{answer.selectedAnswer}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">정답</span>
                    <span className="font-medium text-slate-800">{answer.correctAnswer ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">결과</span>
                    <span className={`font-semibold ${answer.isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                      {answer.isCorrect ? "정답" : "오답"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">정답률</span>
                    <span className="font-semibold text-slate-900">{answer.correctRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
            표시할 문항이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnswerSheet({ subjects, summaries }: AnswerSheetProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(subjects[0]?.subjectId ?? 0);

  const effectiveSubjectId = useMemo(() => {
    if (subjects.length < 1) {
      return 0;
    }
    return subjects.some((subject) => subject.subjectId === selectedSubjectId)
      ? selectedSubjectId
      : subjects[0].subjectId;
  }, [selectedSubjectId, subjects]);

  const selectedSubject = useMemo(() => {
    return subjects.find((subject) => subject.subjectId === effectiveSubjectId) ?? subjects[0] ?? null;
  }, [effectiveSubjectId, subjects]);

  if (!selectedSubject) {
    return (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">정오표 - 문항별 정답률 분석</h2>
        <p className="text-sm text-slate-500">표시할 데이터가 없습니다.</p>
      </section>
    );
  }

  const summary = summaries.find((item) => item.subjectId === selectedSubject.subjectId) ?? null;
  const splitIndex = Math.ceil(selectedSubject.answers.length / 2);
  const leftRows = selectedSubject.answers.slice(0, splitIndex);
  const rightRows = selectedSubject.answers.slice(splitIndex);

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">정오표 - 문항별 정답률 분석</h2>
        <select
          className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          value={effectiveSubjectId}
          onChange={(event) => setSelectedSubjectId(Number(event.target.value))}
        >
          {subjects.map((subject) => (
            <option key={subject.subjectId} value={subject.subjectId}>
              {subject.subjectName}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden gap-4 lg:grid lg:grid-cols-2">
        <AnswerRowsTable rows={leftRows} />
        <AnswerRowsTable rows={rightRows} />
      </div>
      <div className="lg:hidden">
        <AnswerRowsTable rows={selectedSubject.answers} />
      </div>

      {summary ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:text-sm">
          <p>
            과목 평균 정답률:{" "}
            {summary.averageCorrectRate === null ? "데이터 없음" : `${summary.averageCorrectRate.toFixed(1)}%`}
          </p>
          <p>
            가장 어려운 문항: {summary.hardestQuestion ?? "-"}번 ({summary.hardestRate?.toFixed(1) ?? "-"}%)
          </p>
          <p>
            가장 쉬운 문항: {summary.easiestQuestion ?? "-"}번 ({summary.easiestRate?.toFixed(1) ?? "-"}%)
          </p>
          <p>고난도 문항 정답 수: {summary.myCorrectOnHard}문항</p>
          <p>쉬운 문항 오답 수: {summary.myWrongOnEasy}문항</p>
        </div>
      ) : null}
    </section>
  );
}
