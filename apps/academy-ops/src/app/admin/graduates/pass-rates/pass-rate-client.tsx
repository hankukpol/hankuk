"use client";

import { useState } from "react";
import Link from "next/link";

type CohortRow = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  targetExamYear: number | null;
  totalGraduates: number;
  testTakers: number; // WRITTEN_PASS + WRITTEN_FAIL
  passCount: number; // WRITTEN_PASS + FINAL_PASS + APPOINTED
  finalPassCount: number; // FINAL_PASS + APPOINTED
  passRate: number; // passCount / testTakers * 100
  finalPassRate: number; // finalPassCount / testTakers * 100
  vsAvg: number; // passRate - overallAvg
};

type Props = {
  cohortRows: CohortRow[];
  filterExamCategory: string;
  filterYear: string;
  availableYears: number[];
  overallPassRate: number;
  totalGraduates: number;
  totalTestTakers: number;
  totalPasses: number;
};

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
  ALL: "전체",
};

function formatRate(rate: number) {
  return rate.toFixed(1) + "%";
}

export function PassRateClient({
  cohortRows,
  filterExamCategory,
  filterYear,
  availableYears,
  overallPassRate,
  totalGraduates,
  totalTestTakers,
  totalPasses,
}: Props) {
  const [examCat, setExamCat] = useState(filterExamCategory);
  const [year, setYear] = useState(filterYear);

  function applyFilter() {
    const params = new URLSearchParams();
    if (examCat && examCat !== "ALL") params.set("examCategory", examCat);
    if (year && year !== "ALL") params.set("year", year);
    window.location.href = `/admin/graduates/pass-rates?${params.toString()}`;
  }

  const maxPassRate = Math.max(...cohortRows.map((r) => r.passRate), 1);

  // Recent 4 cohorts for trend
  const recent4 = cohortRows.slice(-4);

  return (
    <div className="mt-8 space-y-8">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate mb-1">
            시험 유형
          </label>
          <select
            value={examCat}
            onChange={(e) => setExamCat(e.target.value)}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
          >
            <option value="ALL">전체</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
            <option value="SOGANG">소강</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate mb-1">
            목표 시험 연도
          </label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
          >
            <option value="ALL">전체</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={applyFilter}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white transition hover:bg-forest/80"
        >
          적용
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">
            전체 졸업생
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">
            {totalGraduates.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">합격 기록 보유</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
            응시자
          </p>
          <p className="mt-3 text-2xl font-bold text-sky-700">
            {totalTestTakers.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
          <p className="mt-1 text-xs text-sky-600">필기 응시 기록 있음</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">
            합격자
          </p>
          <p className="mt-3 text-2xl font-bold text-forest">
            {totalPasses.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
          <p className="mt-1 text-xs text-forest/70">필기 이상 합격</p>
        </div>
        <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ember">
            합격률
          </p>
          <p className="mt-3 text-2xl font-bold text-ember">
            {formatRate(overallPassRate)}
          </p>
          <p className="mt-1 text-xs text-ember/70">응시자 기준</p>
        </div>
      </div>

      {/* Per-cohort table */}
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">기수별 합격률</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-forest/5">
              <th className="px-5 py-3 text-left font-semibold text-forest">
                기수명
              </th>
              <th className="px-5 py-3 text-center font-semibold text-forest">
                유형
              </th>
              <th className="px-5 py-3 text-right font-semibold text-forest">
                졸업생
              </th>
              <th className="px-5 py-3 text-right font-semibold text-forest">
                응시자
              </th>
              <th className="px-5 py-3 text-right font-semibold text-forest">
                합격자
              </th>
              <th className="px-5 py-3 text-right font-semibold text-forest">
                합격률
              </th>
              <th className="px-5 py-3 text-right font-semibold text-forest">
                전체 평균 대비
              </th>
              <th className="px-5 py-3 text-center font-semibold text-forest">
                상세
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {cohortRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-slate"
                >
                  조회된 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              cohortRows.map((row) => (
                <tr
                  key={row.cohortId}
                  className="transition-colors hover:bg-mist/50"
                >
                  <td className="px-5 py-3 font-medium text-ink">
                    {row.cohortName}
                    {row.targetExamYear && (
                      <span className="ml-1.5 text-xs text-slate">
                        ({row.targetExamYear}년)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                      {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink">
                    {row.totalGraduates}명
                  </td>
                  <td className="px-5 py-3 text-right text-ink">
                    {row.testTakers > 0 ? `${row.testTakers}명` : "-"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-forest">
                    {row.passCount > 0 ? `${row.passCount}명` : "-"}
                  </td>
                  <td className="px-5 py-3 text-right font-bold">
                    {row.testTakers > 0 ? (
                      <span
                        className={
                          row.passRate >= overallPassRate
                            ? "text-forest"
                            : "text-slate"
                        }
                      >
                        {formatRate(row.passRate)}
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.testTakers > 0 ? (
                      <span
                        className={
                          row.vsAvg >= 0
                            ? "text-forest font-medium"
                            : "text-red-600 font-medium"
                        }
                      >
                        {row.vsAvg >= 0 ? "+" : ""}
                        {row.vsAvg.toFixed(1)}%p
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Link
                      href={`/admin/graduates?cohort=${row.cohortId}`}
                      className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                    >
                      이 기수 상세
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pass rate trend chart (recent 4 cohorts) */}
      {recent4.length > 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h3 className="text-sm font-semibold text-ink">
            최근 4기수 합격률 트렌드
          </h3>
          <p className="mt-1 text-xs text-slate">
            응시자 기준 필기합격률 비교
          </p>
          <div className="mt-6 flex items-end gap-4">
            {recent4.map((row) => {
              const heightPct =
                maxPassRate > 0
                  ? Math.max((row.passRate / maxPassRate) * 100, 2)
                  : 2;
              return (
                <div
                  key={row.cohortId}
                  className="group flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-xs font-semibold text-forest">
                    {row.passRate > 0 ? formatRate(row.passRate) : "-"}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-forest/40 transition-all group-hover:bg-forest"
                    style={{ height: `${heightPct * 2}px` }}
                    title={`${row.cohortName}: ${formatRate(row.passRate)}`}
                  />
                  <span className="mt-1 max-w-[80px] truncate text-center text-xs text-slate">
                    {row.cohortName}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Average line indicator */}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate">
            <div className="h-0.5 w-6 bg-ember" />
            <span>전체 평균: {formatRate(overallPassRate)}</span>
          </div>
        </div>
      )}

      <div className="space-y-1 text-xs text-slate">
        <p>
          * 응시자: 필기합격(WRITTEN_PASS) 또는 필기불합격(WRITTEN_FAIL) 기록이 있는 학생 수입니다.
        </p>
        <p>
          * 합격자: 필기합격·최종합격·임용 중 하나 이상인 학생 수입니다.
        </p>
        <p>
          * 기수 배정은 수강 등록(CourseEnrollment.cohortId) 기준입니다.
        </p>
      </div>
    </div>
  );
}
