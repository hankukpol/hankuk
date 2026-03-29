import { BarComparisonChart, TrendLineChart } from "@/components/analytics/charts";
import { CohortScoreHeatmap } from "@/components/analytics/cohort-score-heatmap";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import type { GenerationCohortAnalysisData } from "@/lib/analytics/cohort-analysis";
import { formatScore } from "@/lib/analytics/presentation";
import { SUBJECT_LABEL } from "@/lib/constants";

const COHORT_COLORS = [
  "#EA580C",
  "#2563EB",
  "#0F766E",
  "#7C3AED",
  "#DB2777",
  "#C2410C",
  "#0891B2",
  "#4D7C0F",
];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSubjectSummary(subject: keyof typeof SUBJECT_LABEL | null, averageScore: number | null) {
  if (!subject || averageScore === null) {
    return "-";
  }

  return `${SUBJECT_LABEL[subject] ?? subject} ${formatScore(averageScore)}점`;
}

export function GenerationCohortAnalysisPanel({
  data,
}: {
  data: GenerationCohortAnalysisData | null;
}) {
  if (!data || data.summaryRows.length === 0) {
    return (
      <section className="mt-8 rounded-[28px] border border-dashed border-ink/10 bg-white p-8 text-sm text-slate">
        선택한 기간에 코호트 비교를 표시할 데이터가 없습니다.
      </section>
    );
  }

  const trendData = data.trendRows.map((row) => {
    const values: Record<string, string | number | null> = {
      weekKey: row.weekKey,
      weekLabel: row.weekLabel,
    };

    for (const value of row.values) {
      values[value.key] = value.averageScore;
    }

    return values;
  });

  return (
    <div className="mt-8 space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">비교 코호트</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{data.cohortCount}</p>
          <p className="mt-2 text-sm text-slate">{data.periodName} 기준</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">비교 학생 수</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{data.studentCount}</p>
          <p className="mt-2 text-sm text-slate">활성 {data.activeStudentCount}명 포함</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">전체 평균 점수</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{formatScore(data.overallAverageScore)}</p>
          <p className="mt-2 text-sm text-slate">집계 회차 {data.sessionCount}회</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">전체 출결/탈락</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{formatPercent(data.overallAttendanceRate)}</p>
          <p className="mt-2 text-sm text-slate">탈락률 {formatPercent(data.overallDropoutRate)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">기수별 평균 점수</h2>
          <p className="mt-2 text-sm text-slate">현재 기간에 발생한 시험 기록만 기준으로 코호트 평균을 비교합니다.</p>
          <div className="mt-4">
            <BarComparisonChart
              data={data.summaryRows.map((row) => ({
                label: row.label,
                averageScore: row.averageScore,
              }))}
              xKey="label"
              bars={[{ dataKey: "averageScore", color: "#EA580C", name: "평균 점수" }]}
            />
          </div>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">기수별 출결/탈락률</h2>
          <p className="mt-2 text-sm text-slate">출석 인정 규칙과 현재 탈락 상태를 동일 기준으로 비교합니다.</p>
          <div className="mt-4">
            <BarComparisonChart
              data={data.summaryRows.map((row) => ({
                label: row.label,
                attendanceRate: row.attendanceRate,
                dropoutRate: row.dropoutRate,
              }))}
              xKey="label"
              bars={[
                { dataKey: "attendanceRate", color: "#2563EB", name: "출석률" },
                { dataKey: "dropoutRate", color: "#DC2626", name: "탈락률" },
              ]}
            />
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">기수별 평균 점수 추이</h2>
        <p className="mt-2 text-sm text-slate">주차별로 코호트 평균이 어떻게 움직였는지 한 화면에서 비교합니다.</p>
        <div className="mt-4">
          <TrendLineChart
            data={trendData}
            xKey="weekKey"
            xTickKey="weekLabel"
            lines={data.summaryRows.map((row, index) => ({
              dataKey: row.key,
              color: COHORT_COLORS[index % COHORT_COLORS.length],
              name: row.label,
            }))}
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">기수별 요약표</h2>
            <p className="mt-2 text-sm text-slate">평균, 출결, 경고/탈락, 강약 과목을 한 표로 확인합니다.</p>
          </div>
        </div>
        <div className="mt-6">
          <ResponsiveTable
            data={data.summaryRows}
            keyExtractor={(row) => row.key}
            cardTitle={(row) => row.label}
            cardDescription={(row) => `${row.studentCount}명 · 탈락 ${row.dropoutCount}명`}
            columns={[
              {
                id: "generation",
                header: "기수",
                cell: (row) => row.label,
              },
              {
                id: "students",
                header: "학생 수",
                cell: (row) => `${row.studentCount}명`,
              },
              {
                id: "average",
                header: "평균 점수",
                cell: (row) => formatScore(row.averageScore),
              },
              {
                id: "attendance",
                header: "출석률",
                cell: (row) => formatPercent(row.attendanceRate),
              },
              {
                id: "dropout",
                header: "탈락/경고",
                cell: (row) => `${row.dropoutCount}명 / ${row.warningCount}명`,
                mobileLabel: "탈락/경고",
              },
              {
                id: "strong",
                header: "강점 과목",
                cell: (row) => formatSubjectSummary(row.strongSubject, row.strongSubjectAverage),
                mobileLabel: "강점",
              },
              {
                id: "weak",
                header: "취약 과목",
                cell: (row) => formatSubjectSummary(row.weakSubject, row.weakSubjectAverage),
                mobileLabel: "취약",
              },
            ]}
          />
        </div>
      </section>

      <CohortScoreHeatmap data={data.heatmap} />
    </div>
  );
}
