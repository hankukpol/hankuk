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
  return `${value.toFixed(1)}%`;
}

function formatSamplePercent(value: number | null, available: boolean): string {
  if (value === null) return "표시 보류";
  if (!available) return "표본 축적 중";
  return formatPercent(value);
}

function formatStat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

/* 표의 크기·여백·색·정렬은 globals.css 의 .data-table 이 단독으로 결정한다.
   여기서 인라인으로 덮으면 이 표만 다른 페이지와 어긋난다. */
/* 컬럼머리는 DESIGN.md 표 규격상 가운데다. num-right 는 자릿수를 세로로 맞춰야 하는
   데이터 셀에만 붙인다 — th 에 붙이면 머리글만 오른쪽으로 밀려 열 이름이 값에 붙어 보인다. */
const TH = "";
const TD = "tabular-nums num-right";
const TD_LEFT = "font-medium";

export default function GradeAnalysisTable({ result }: GradeAnalysisTableProps) {
  const summary = result.analysisSummary;
  const analysisEnabled = result.features.analysisEnabled;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="user-section-title">전체 성적 요약</h2>
        {analysisEnabled ? (
          <p className="text-xs text-slate-500">순위 기준: {formatRankingBasis(result.statistics.rankingBasis)}</p>
        ) : (
          <p className="text-xs text-slate-500">현재 단계에서는 개인 채점 결과만 제공합니다.</p>
        )}
      </div>

      {result.bonusApplication?.message ? (
        <div
          className={`border-l-2 px-4 py-3 text-sm ${
 result.bonusApplication.status === "APPLIED"
 ? "border-emerald-400 bg-emerald-50 text-emerald-800"
 : result.bonusApplication.status === "PENDING"
 ? "border-amber-400 bg-amber-50 text-amber-800"
 : "border-slate-400 bg-slate-50 text-slate-700"
 }`}
        >
          {result.bonusApplication.message}
        </div>
      ) : null}

      {result.statistics.hasCutoff && (
        <div className="border-l-2 border-rose-400 bg-rose-50 px-4 py-3">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-xs text-rose-800">!</span>
            {result.submission.examType === "CAREER"
              ? "총점 60% 미만으로 과락입니다"
              : "과락 과목이 있습니다"}
          </h3>
          {result.statistics.cutoffSubjects.length > 0 ? <ul className="flex flex-wrap gap-2">
            {result.statistics.cutoffSubjects.map((subject) => (
              <li
                key={subject.subjectName}
                className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-rose-700"
              >
                <span className="font-semibold">{subject.subjectName}</span>
                <span className="font-bold">{formatScore(subject.rawScore)}점</span>
                <span className="text-xs text-rose-400">(기준 {formatScore(subject.cutoffScore)}점 미만)</span>
              </li>
            ))}
          </ul> : null}
        </div>
      )}

      {/* 수험생이 가장 먼저 알아야 할 숫자는 스크롤 없이 보여야 한다.
          과락일 때는 점수를 강조색으로 자랑하지 않고 중립으로 둔다. */}
      <div className="rounded-lg border border-service-200 bg-service-50 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <p className="user-data-label">최종점수</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className={`user-metric-hero ${result.statistics.hasCutoff ? "text-slate-400" : "text-service-700"}`}>
                {formatScore(result.submission.finalScore)}
              </span>
              <span className="text-base font-bold text-slate-500">점</span>
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              원점수 {formatScore(result.submission.totalScore)}점
              {result.statistics.bonusScore > 0 ? ` · 가산점 +${formatScore(result.statistics.bonusScore)}점` : ""}
            </p>
          </div>

          {analysisEnabled ? (
            <div className="flex gap-8 sm:gap-10">
              <div>
                <p className="user-data-label">표본 내 순위</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">
                    {summary.total.myRank !== null ? summary.total.myRank : "-"}
                  </span>
                  <span className="text-sm font-semibold text-slate-500">
                    / {summary.total.totalParticipants.toLocaleString("ko-KR")}명
                  </span>
                </p>
              </div>
              <div>
                <p className="user-data-label">상위</p>
                <p
                  className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${
                    summary.total.percentileAvailable && summary.total.topPercent !== null
                      ? "text-slate-900"
                      : "text-slate-400"
                  }`}
                >
                  {summary.total.percentileAvailable && summary.total.topPercent !== null
                    ? formatPercent(summary.total.topPercent)
                    : "집계 중"}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`grid gap-4 ${analysisEnabled ? "lg:grid-cols-2" : ""}`}>
        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="bg-slate-100 px-4 py-2.5">
            <h3 className="user-card-title">내 점수</h3>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className={TH}>과목</th>
                  <th className={TH}>정답수</th>
                  <th className={TH}>점수</th>
                  {analysisEnabled ? <th className={TH}>상위%</th> : null}
                  {analysisEnabled ? <th className={TH}>백분위</th> : null}
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
                    {analysisEnabled ? <td className={`${TD} ${subject.percentileAvailable ? "" : "text-slate-400"}`}>
                      {formatSamplePercent(subject.topPercent, subject.percentileAvailable)}
                    </td> : null}
                    {analysisEnabled ? <td className={`${TD} ${subject.percentileAvailable ? "" : "text-slate-400"}`}>
                      {formatSamplePercent(subject.percentile, subject.percentileAvailable)}
                    </td> : null}
                  </tr>
                ))}
                <tr className="data-table-total">
                  <td>가점 반영 총점</td>
                  <td className={TD}>
                    {summary.total.correctCount}/{summary.total.questionCount}
                  </td>
                  <td className={TD}>
                    {formatScore(summary.total.myScore)}
                  </td>
                  {analysisEnabled ? <td className={`${TD} ${summary.total.percentileAvailable ? "" : "text-slate-400"}`}>
                    {formatSamplePercent(summary.total.topPercent, summary.total.percentileAvailable)}
                  </td> : null}
                  {analysisEnabled ? <td className={`${TD} ${summary.total.percentileAvailable ? "" : "text-slate-400"}`}>
                    {formatSamplePercent(summary.total.percentile, summary.total.percentileAvailable)}
                  </td> : null}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="data-list-flat md:hidden">
            {summary.subjects.map((subject) => (
              <div key={subject.subjectId} className="px-4 py-3">
                <p className="user-metric-heading">{subject.subjectName}</p>
                <dl className="user-metric-pairs mt-3" data-cols={analysisEnabled ? "4" : "2"}>
                  <div>
                    <dt>정답수</dt>
                    <dd>{subject.correctCount}/{subject.questionCount}</dd>
                  </div>
                  <div>
                    <dt>점수</dt>
                    <dd>{formatScore(subject.myScore)}/{formatInt(subject.maxScore)}</dd>
                  </div>
                  {analysisEnabled ? <div>
                    <dt>상위%</dt>
                    <dd data-tone={subject.percentileAvailable ? undefined : "muted"}>
                      {formatSamplePercent(subject.topPercent, subject.percentileAvailable)}
                    </dd>
                  </div> : null}
                  {analysisEnabled ? <div>
                    <dt>백분위</dt>
                    <dd data-tone={subject.percentileAvailable ? undefined : "muted"}>
                      {formatSamplePercent(subject.percentile, subject.percentileAvailable)}
                    </dd>
                  </div> : null}
                </dl>
              </div>
            ))}

            <div className="bg-slate-50 px-4 py-3">
              <p className="user-metric-heading">가점 반영 총점</p>
              <dl className="user-metric-pairs mt-3" data-cols={analysisEnabled ? "4" : "2"}>
                <div>
                  <dt>정답수</dt>
                  <dd>{summary.total.correctCount}/{summary.total.questionCount}</dd>
                </div>
                <div>
                  <dt>점수</dt>
                  <dd>{formatScore(summary.total.myScore)}점</dd>
                </div>
                {analysisEnabled ? <div>
                  <dt>상위%</dt>
                  <dd data-tone={summary.total.percentileAvailable ? undefined : "muted"}>
                    {formatSamplePercent(summary.total.topPercent, summary.total.percentileAvailable)}
                  </dd>
                </div> : null}
                {analysisEnabled ? <div>
                  <dt>백분위</dt>
                  <dd data-tone={summary.total.percentileAvailable ? undefined : "muted"}>
                    {formatSamplePercent(summary.total.percentile, summary.total.percentileAvailable)}
                  </dd>
                </div> : null}
              </dl>
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
              <span className="text-base font-bold tabular-nums text-slate-900">{formatScore(result.submission.finalScore)}점</span>
            </div>
          </div>
        </div>

        {analysisEnabled ? <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="bg-slate-100 px-4 py-2.5">
            <h3 className="user-card-title">전체 입력자 비교</h3>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="data-table w-full">
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
                <tr className="data-table-total">
                  <td className="font-bold">총점</td>
                  <td className={TD}>{formatStat(summary.total.top10Average)}</td>
                  <td className={TD}>{formatStat(summary.total.top30Average)}</td>
                  <td className={TD}>{formatStat(summary.total.averageScore)}</td>
                  <td className={TD}>{formatInt(summary.total.highestScore)}</td>
                  <td className={TD}>{formatInt(summary.total.lowestScore)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="data-list-flat md:hidden">
            {summary.subjects.map((subject) => (
              <div key={subject.subjectId} className="px-4 py-3">
                <p className="user-metric-heading">{subject.subjectName}</p>
                <dl className="user-metric-pairs mt-3" data-cols="3">
                  <div>
                    <dt>상위 10%</dt>
                    <dd>{formatStat(subject.top10Average)}</dd>
                  </div>
                  <div>
                    <dt>상위 30%</dt>
                    <dd>{formatStat(subject.top30Average)}</dd>
                  </div>
                  <div>
                    <dt>전체 평균</dt>
                    <dd>{formatStat(subject.averageScore)}</dd>
                  </div>
                  <div>
                    <dt>최고점</dt>
                    <dd>{formatInt(subject.highestScore)}</dd>
                  </div>
                  <div>
                    <dt>최저점</dt>
                    <dd>{formatInt(subject.lowestScore)}</dd>
                  </div>
                </dl>
              </div>
            ))}

            <div className="bg-slate-50 px-4 py-3">
              <p className="user-metric-heading">총점</p>
              <dl className="user-metric-pairs mt-3" data-cols="3">
                <div>
                  <dt>상위 10%</dt>
                  <dd>{formatStat(summary.total.top10Average)}</dd>
                </div>
                <div>
                  <dt>상위 30%</dt>
                  <dd>{formatStat(summary.total.top30Average)}</dd>
                </div>
                <div>
                  <dt>전체 평균</dt>
                  <dd>{formatStat(summary.total.averageScore)}</dd>
                </div>
                <div>
                  <dt>최고점</dt>
                  <dd>{formatInt(summary.total.highestScore)}</dd>
                </div>
                <div>
                  <dt>최저점</dt>
                  <dd>{formatInt(summary.total.lowestScore)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div> : null}
      </div>
    </section>
  );
}
