"use client";

import { SUBJECT_LABEL } from "@/lib/constants";
import { Subject } from "@prisma/client";

interface BenchmarkPanelProps {
  // Prospect's recent exam subject averages (null if no score data yet)
  subjectScores: Record<string, number> | null;
  // Graduate benchmark: subject averages at pass time + enrollment duration
  benchmarkData: {
    totalGraduates: number;
    subjectAverages: Record<string, number>;
    passAvgScore: number;
    avgMonths: number;
  };
  prospectName: string;
}

const SUBJECT_ORDER: Subject[] = [
  Subject.CONSTITUTIONAL_LAW,
  Subject.CRIMINAL_LAW,
  Subject.CRIMINAL_PROCEDURE,
  Subject.POLICE_SCIENCE,
  Subject.CRIMINOLOGY,
];

function getDiffColor(diff: number): string {
  if (diff >= 0) return "text-forest font-semibold";
  if (diff >= -5) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function getDiffBg(diff: number): string {
  if (diff >= 0) return "bg-forest/5";
  if (diff >= -5) return "bg-amber-50";
  return "bg-red-50";
}

function formatDiff(diff: number): string {
  if (diff > 0) return `+${diff.toFixed(1)}`;
  return diff.toFixed(1);
}

function estimateMonths(
  prospectAvg: number | null,
  passAvg: number,
  avgEnrolledMonths: number,
): { months: number; label: string } | null {
  if (prospectAvg === null) return null;
  const gap = passAvg - prospectAvg;
  if (gap <= 0) {
    // Already at or above pass average
    return { months: 0, label: "현재 점수가 합격자 평균 이상입니다" };
  }
  // Assume 1.5점/month growth rate
  const GROWTH_RATE_PER_MONTH = 1.5;
  const estimatedMonths = Math.ceil(gap / GROWTH_RATE_PER_MONTH);
  const cappedMonths = Math.min(estimatedMonths, avgEnrolledMonths * 3);
  return {
    months: cappedMonths,
    label: `약 ${cappedMonths}개월 후 합격자 평균 도달 예상`,
  };
}

export function BenchmarkPanel({
  subjectScores,
  benchmarkData,
  prospectName,
}: BenchmarkPanelProps) {
  const { totalGraduates, subjectAverages, passAvgScore, avgMonths } = benchmarkData;

  // Determine which subjects to show based on benchmark data
  const availableSubjects = SUBJECT_ORDER.filter(
    (s) => typeof subjectAverages[s] === "number",
  );

  // Compute prospect overall average (only subjects present in benchmark)
  let prospectOverallAvg: number | null = null;
  if (subjectScores && availableSubjects.length > 0) {
    const vals = availableSubjects
      .map((s) => subjectScores[s])
      .filter((v): v is number => typeof v === "number");
    if (vals.length > 0) {
      prospectOverallAvg =
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
  }

  const estimate = estimateMonths(prospectOverallAvg, passAvgScore, avgMonths);

  const hasScores = subjectScores && Object.keys(subjectScores).length > 0;

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">합격자 벤치마크</h2>
          <p className="mt-0.5 text-xs text-slate">
            {prospectName} 님의 현재 점수와 합격자 기준을 비교합니다
          </p>
        </div>
        {totalGraduates > 0 ? (
          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            합격자 {totalGraduates}명 기준
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            데이터 준비 중
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {totalGraduates === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            합격자 데이터가 아직 없습니다.
          </div>
        ) : (
          <>
            {/* ── 과목별 비교 테이블 ──────────────────────────────── */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">과목별 점수 비교</h3>
              {availableSubjects.length === 0 ? (
                <p className="text-sm text-slate">과목별 합격자 데이터가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto rounded-[20px] border border-ink/10">
                  <table className="w-full text-sm">
                    <thead className="bg-mist/60">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                          과목
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate">
                          수험생 현재
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate">
                          합격자 평균
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate">
                          차이
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {availableSubjects.map((subject) => {
                        const passAvg = subjectAverages[subject] ?? 0;
                        const prospectScore =
                          hasScores && subjectScores
                            ? (subjectScores[subject] ?? null)
                            : null;
                        const diff =
                          prospectScore !== null ? prospectScore - passAvg : null;

                        return (
                          <tr
                            key={subject}
                            className={`transition ${
                              diff !== null ? getDiffBg(diff) : "hover:bg-mist/30"
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-ink">
                              {SUBJECT_LABEL[subject] ?? subject}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {prospectScore !== null ? (
                                <span className="font-semibold text-ink">
                                  {prospectScore.toFixed(1)}점
                                </span>
                              ) : (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold text-forest">
                                {passAvg.toFixed(1)}점
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {diff !== null ? (
                                <span className={getDiffColor(diff)}>
                                  {formatDiff(diff)}점
                                </span>
                              ) : (
                                <span className="text-xs text-slate">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* 전체 평균 행 */}
                    {(passAvgScore > 0 || prospectOverallAvg !== null) && (
                      <tfoot>
                        <tr className="border-t-2 border-ink/10 bg-mist/80">
                          <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate">
                            전체 평균
                          </td>
                          <td className="px-4 py-3 text-center">
                            {prospectOverallAvg !== null ? (
                              <span className="font-bold text-ink">
                                {prospectOverallAvg.toFixed(1)}점
                              </span>
                            ) : (
                              <span className="text-slate">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-forest">
                              {passAvgScore.toFixed(1)}점
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {prospectOverallAvg !== null ? (
                              <span
                                className={getDiffColor(prospectOverallAvg - passAvgScore)}
                              >
                                {formatDiff(prospectOverallAvg - passAvgScore)}점
                              </span>
                            ) : (
                              <span className="text-slate">-</span>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* 점수 없음 안내 */}
              {!hasScores && (
                <div className="mt-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3 text-xs text-slate">
                  수험생의 현재 점수 데이터가 없습니다. 상담 시 직접 점수를 물어본 후 참고
                  자료로 활용하세요.
                </div>
              )}
            </div>

            {/* ── 합격 예상 소요 기간 ─────────────────────────────── */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">합격 예상 소요 기간</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* 합격자 평균 수강 기간 */}
                <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4">
                  <p className="text-xs font-semibold text-forest">합격자 평균 수강 기간</p>
                  <p className="mt-1.5 text-3xl font-bold text-forest">
                    {avgMonths}
                    <span className="ml-1 text-sm font-normal">개월</span>
                  </p>
                  <p className="mt-1 text-xs text-forest/70">
                    실제 합격자 {totalGraduates}명 기준
                  </p>
                </div>

                {/* 수험생 예상 기간 */}
                <div
                  className={`rounded-[20px] border p-4 ${
                    estimate === null
                      ? "border-ink/10 bg-mist/50"
                      : estimate.months === 0
                        ? "border-forest/20 bg-forest/5"
                        : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      estimate === null
                        ? "text-slate"
                        : estimate.months === 0
                          ? "text-forest"
                          : "text-amber-700"
                    }`}
                  >
                    수험생 예상 기간
                  </p>
                  {estimate === null ? (
                    <>
                      <p className="mt-1.5 text-3xl font-bold text-slate">-</p>
                      <p className="mt-1 text-xs text-slate">
                        점수 입력 후 자동 계산됩니다
                      </p>
                    </>
                  ) : estimate.months === 0 ? (
                    <>
                      <p className="mt-1.5 text-sm font-bold text-forest">
                        합격 점수 도달
                      </p>
                      <p className="mt-1 text-xs text-forest/70">{estimate.label}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 text-3xl font-bold text-amber-700">
                        {estimate.months}
                        <span className="ml-1 text-sm font-normal">개월</span>
                      </p>
                      <p className="mt-1 text-xs text-amber-600">{estimate.label}</p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate">
                * 예상 기간은 월 1.5점 향상 기준으로 계산됩니다. 개인차가 있으므로
                참고용으로만 활용하세요.
              </p>
            </div>

            {/* ── 상담 활용 포인트 ────────────────────────────────── */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">상담 활용 포인트</h3>
              <div className="rounded-[20px] border border-amber-100 bg-amber-50/60 p-4">
                <ul className="space-y-2 text-xs leading-5 text-amber-800">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-bold">1.</span>
                    <span>
                      <strong>취약 과목 파악:</strong> 합격자 평균 대비 차이가 큰 과목(-5점
                      이하)을 우선 집중 학습 과목으로 추천하세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-bold">2.</span>
                    <span>
                      <strong>수강 기간 제안:</strong> 합격자 평균 수강 기간{" "}
                      <strong>{avgMonths}개월</strong>을 기준으로 목표 시험일까지
                      역산하여 등록 시점을 안내하세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-bold">3.</span>
                    <span>
                      <strong>목표 점수 설정:</strong> 합격자 전체 평균{" "}
                      <strong>{passAvgScore.toFixed(1)}점</strong>을 목표로 제시하고,
                      과목별 달성 계획을 함께 수립하세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-bold">4.</span>
                    <span>
                      <strong>현실적 기대치:</strong> 단기간 급격한 점수 향상보다 꾸준한
                      학습을 통한 안정적 성취를 강조하세요.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
