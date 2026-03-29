"use client";

import type { ResultResponse } from "@/app/exam/result/types";

interface GradeAnalysisTableProps {
  result: ResultResponse;
}

function formatBonusType(type: ResultResponse["submission"]["bonusType"]): string {
  switch (type) {
    case "VETERAN_5":
      return "취업지원대상자 5%";
    case "VETERAN_10":
      return "취업지원대상자 10%";
    case "HERO_3":
      return "의사상자 3%";
    case "HERO_5":
      return "의사상자 5%";
    default:
      return "해당 없음";
  }
}

function formatRankingBasis(basis: ResultResponse["statistics"]["rankingBasis"]): string {
  if (basis === "NON_CUTOFF_PARTICIPANTS") return "과락 미해당자 기준";
  return "전체 참여자 기준";
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatInt(value: number): string {
  return Math.round(value).toString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatStat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

const TH = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-500";
const TD = "border-b border-slate-100 px-3 py-2.5 text-right text-sm tabular-nums";
const TD_LEFT = "border-b border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-slate-700";

export default function GradeAnalysisTable({ result }: GradeAnalysisTableProps) {
  const summary = result.analysisSummary;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">전체 성적 요약</h2>
        <p className="text-xs text-slate-500">순위 기준: {formatRankingBasis(result.statistics.rankingBasis)}</p>
      </div>

      {result.statistics.hasCutoff && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-xs text-rose-800">!</span>
            과락 과목이 있습니다
          </h3>
          <ul className="flex flex-wrap gap-2">
            {result.statistics.cutoffSubjects.map((subject) => (
              <li
                key={subject.subjectName}
                className="flex items-center gap-2 rounded-lg border border-rose-100 bg-white px-3 py-2 text-sm text-rose-700"
              >
                <span className="font-semibold">{subject.subjectName}</span>
                <span className="font-bold">{formatScore(subject.rawScore)}점</span>
                <span className="text-xs text-rose-400">(기준 {formatScore(subject.cutoffScore)}점 미만)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-700">내 점수</h3>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>과목</th>
                  <th className={TH}>정답수</th>
                  <th className={TH}>점수</th>
                  <th className={TH}>상위%</th>
                  <th className={TH}>백분위</th>
                </tr>
              </thead>
              <tbody>
                {summary.subjects.map((subject) => (
                  <tr key={subject.subjectId} className="bg-white transition-colors hover:bg-slate-50/60">
                    <td className={TD_LEFT}>{subject.subjectName}</td>
                    <td className={TD}>
                      {subject.correctCount}/{subject.questionCount}
                    </td>
                    <td className={TD}>
                      {formatScore(subject.myScore)}
                      <span className="text-xs text-slate-400">/{formatInt(subject.maxScore)}</span>
                    </td>
                    <td className={`${TD} ${subject.topPercent === 0 ? "font-semibold text-blue-600" : ""}`}>
                      {formatPercent(subject.topPercent)}
                    </td>
                    <td className={TD}>{formatPercent(subject.percentile)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2.5 text-left text-sm font-bold">총점</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                    {summary.total.correctCount}/{summary.total.questionCount}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                    {formatScore(summary.total.myScore)}
                    <span className="text-xs font-normal text-slate-400">/{formatInt(summary.total.maxScore)}</span>
                  </td>
                  <td className={`px-3 py-2.5 text-right text-sm tabular-nums ${summary.total.topPercent === 0 ? "text-blue-600" : ""}`}>
                    {formatPercent(summary.total.topPercent)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatPercent(summary.total.percentile)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-3 md:hidden">
            {summary.subjects.map((subject) => (
              <div key={subject.subjectId} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">{subject.subjectName}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">정답수</span>
                    <span className="font-medium text-slate-800">
                      {subject.correctCount}/{subject.questionCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">점수</span>
                    <span className="font-medium text-slate-800">
                      {formatScore(subject.myScore)}/{formatInt(subject.maxScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">상위%</span>
                    <span className={`font-semibold ${subject.topPercent === 0 ? "text-blue-600" : "text-slate-900"}`}>
                      {formatPercent(subject.topPercent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">백분위</span>
                    <span className="font-semibold text-slate-900">{formatPercent(subject.percentile)}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">총점</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">정답수</span>
                  <span className="font-medium text-slate-900">
                    {summary.total.correctCount}/{summary.total.questionCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">점수</span>
                  <span className="font-medium text-slate-900">
                    {formatScore(summary.total.myScore)}/{formatInt(summary.total.maxScore)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">상위%</span>
                  <span className={`font-semibold ${summary.total.topPercent === 0 ? "text-blue-600" : "text-slate-900"}`}>
                    {formatPercent(summary.total.topPercent)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">백분위</span>
                  <span className="font-semibold text-slate-900">{formatPercent(summary.total.percentile)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-2.5 border-t border-slate-200 bg-slate-50/50 px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">원점수 합계</span>
              <span className="text-sm font-semibold text-slate-700">{formatScore(result.submission.totalScore)}점</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                가산점
                <span className="ml-2 inline-flex items-center rounded-md bg-slate-200/70 px-2 py-0.5 text-xs text-slate-600">
                  {formatBonusType(result.submission.bonusType)}
                </span>
              </span>
              <span className="text-sm font-semibold text-emerald-600">+{formatScore(result.statistics.bonusScore)}점</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
              <span className="text-base font-bold text-slate-900">최종점수</span>
              <span className="text-2xl font-bold tracking-tight text-blue-600">{formatScore(result.submission.finalScore)}점</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-700">전체 입력자 비교</h3>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>과목</th>
                  <th className={TH}>상위10%</th>
                  <th className={TH}>상위30%</th>
                  <th className={TH}>전체평균</th>
                  <th className={TH}>최고점</th>
                  <th className={TH}>최저점</th>
                </tr>
              </thead>
              <tbody>
                {summary.subjects.map((subject) => (
                  <tr key={subject.subjectId} className="bg-white transition-colors hover:bg-slate-50/60">
                    <td className={TD_LEFT}>{subject.subjectName}</td>
                    <td className={TD}>{formatStat(subject.top10Average)}</td>
                    <td className={TD}>{formatStat(subject.top30Average)}</td>
                    <td className={TD}>{formatStat(subject.averageScore)}</td>
                    <td className={TD}>{formatInt(subject.highestScore)}</td>
                    <td className={TD}>{formatInt(subject.lowestScore)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2.5 text-left text-sm font-bold">총점</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatStat(summary.total.top10Average)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatStat(summary.total.top30Average)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatStat(summary.total.averageScore)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatInt(summary.total.highestScore)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatInt(summary.total.lowestScore)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-3 md:hidden">
            {summary.subjects.map((subject) => (
              <div key={subject.subjectId} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">{subject.subjectName}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">상위 10%</span>
                    <span className="font-medium text-slate-800">{formatStat(subject.top10Average)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">상위 30%</span>
                    <span className="font-medium text-slate-800">{formatStat(subject.top30Average)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">전체 평균</span>
                    <span className="font-medium text-slate-800">{formatStat(subject.averageScore)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">최고점</span>
                    <span className="font-medium text-slate-800">{formatInt(subject.highestScore)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">최저점</span>
                    <span className="font-medium text-slate-800">{formatInt(subject.lowestScore)}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">총점</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">상위 10%</span>
                  <span className="font-medium text-slate-900">{formatStat(summary.total.top10Average)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">상위 30%</span>
                  <span className="font-medium text-slate-900">{formatStat(summary.total.top30Average)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">전체 평균</span>
                  <span className="font-medium text-slate-900">{formatStat(summary.total.averageScore)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">최고점</span>
                  <span className="font-medium text-slate-900">{formatInt(summary.total.highestScore)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">최저점</span>
                  <span className="font-medium text-slate-900">{formatInt(summary.total.lowestScore)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
