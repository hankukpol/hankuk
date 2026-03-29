import type { DifficultyStatsResult } from "@/lib/difficulty";
import DifficultyBar from "@/components/landing/DifficultyBar";

interface DifficultyPanelProps {
  difficulty: DifficultyStatsResult;
}

export default function DifficultyPanel({ difficulty }: DifficultyPanelProps) {
  if (difficulty.totalResponses < 1) return null;

  const dominantEmoji =
    difficulty.overall.dominantLabel === "매우 쉬움"
      ? "😄"
      : difficulty.overall.dominantLabel === "쉬움"
        ? "😊"
        : difficulty.overall.dominantLabel === "보통"
          ? "😐"
          : difficulty.overall.dominantLabel === "어려움"
            ? "😰"
            : "🥵";

  if (difficulty.totalResponses < 10) {
    return (
      <section className="border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">시험 체감 난이도</h2>
          <p className="text-xs text-slate-500">
            응답 {difficulty.totalResponses.toLocaleString("ko-KR")}건 · {difficulty.overall.dominantLabel}{" "}
            {dominantEmoji}
          </p>
        </div>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          아직 충분한 데이터가 수집되지 않았습니다. 응답 10건 이상부터 상세 난이도를 표시합니다.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">시험 체감 난이도</h2>
        <p className="text-xs text-slate-500">
          응답 {difficulty.totalResponses.toLocaleString("ko-KR")}건 · 전체 체감{" "}
          {difficulty.overall.dominantLabel} {dominantEmoji}
        </p>
      </div>

      <div className="mt-4 space-y-3 border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm text-slate-700">
          <p className="font-medium text-slate-900">전체 난이도</p>
          <p>
            쉬움 {difficulty.overall.easyCombined}% · 보통 {difficulty.overall.normal}% · 어려움{" "}
            {difficulty.overall.hardCombined}%
          </p>
        </div>
        <DifficultyBar
          easy={difficulty.overall.easyCombined}
          normal={difficulty.overall.normal}
          hard={difficulty.overall.hardCombined}
        />
      </div>

      {difficulty.subjects.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {difficulty.subjects.map((subject) => (
            <article key={subject.subjectId} className="border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {subject.subjectName}
                  {subject.examType === "CAREER_RESCUE" ? (
                    <span className="ml-1 text-xs font-medium text-sky-700">(구조 경채)</span>
                  ) : subject.examType === "CAREER_ACADEMIC" ? (
                    <span className="ml-1 text-xs font-medium text-sky-700">(소방학과 경채)</span>
                  ) : subject.examType === "CAREER_EMT" ? (
                    <span className="ml-1 text-xs font-medium text-sky-700">(구급 경채)</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {subject.responses.toLocaleString("ko-KR")}건 · {subject.dominantLabel}
                </p>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                쉬움 {subject.easyCombined}% · 보통 {subject.normal}% · 어려움 {subject.hardCombined}%
              </div>
              <div className="mt-2">
                <DifficultyBar
                  easy={subject.easyCombined}
                  normal={subject.normal}
                  hard={subject.hardCombined}
                />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
