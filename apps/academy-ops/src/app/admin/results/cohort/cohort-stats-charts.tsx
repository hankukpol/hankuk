"use client";

import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

// ─── Types (mirrored from API) ─────────────────────────────────────────────────

export type CohortSummary = {
  id: string;
  name: string;
  examCategory: string;
  studentCount: number;
  avgScore: number | null;
  topScore: number | null;
  bottomScore: number | null;
  passRate: number | null;
};

export type ScoreDistributionBucket = {
  range: string;
  count: number;
};

export type SubjectAverage = {
  subject: string;
  label: string;
  avg: number;
};

export type TopStudent = {
  rank: number;
  examNumber: string;
  name: string;
  avgScore: number;
  bestSubject: string;
};

export type SelectedCohortDetail = CohortSummary & {
  scoreDistribution: ScoreDistributionBucket[];
  subjectAverages: SubjectAverage[];
  top10: TopStudent[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 1): string {
  if (v === null) return "-";
  return v.toFixed(digits);
}

function bucketColor(range: string): string {
  const lower = parseInt(range.split("-")[0] ?? "0", 10);
  if (lower >= 90) return "#1F4D3A"; // forest — excellent
  if (lower >= 80) return "#2D7A5A"; // forest lighter
  if (lower >= 70) return "#C55A11"; // ember — good
  if (lower >= 60) return "#D97706"; // amber — pass
  return "#9CA3AF"; // gray — below pass
}

// ─── All-cohorts overview ──────────────────────────────────────────────────────

export function AllCohortsCharts({ cohorts }: { cohorts: CohortSummary[] }) {
  const chartData = cohorts
    .filter((c) => c.avgScore !== null)
    .map((c) => ({
      name: c.name.length > 12 ? c.name.slice(0, 11) + "…" : c.name,
      fullName: c.name,
      avg: c.avgScore ?? 0,
      passRate: c.passRate ?? 0,
    }));

  if (chartData.length === 0) {
    return (
      <p className="rounded-[20px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
        성적 데이터가 있는 기수가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Average score bar chart */}
      <div className="rounded-[20px] border border-ink/10 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">기수별 평균 점수</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 40, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#4B5563" }}
              tickLine={false}
              angle={-30}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: "#4B5563" }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
              formatter={(value) => [`${Number(value).toFixed(1)}점`, "평균 점수"]}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.name === String(label));
                return item?.fullName ?? String(label);
              }}
            />
            <ReferenceLine y={60} stroke="#D97706" strokeDasharray="4 4" label={{ value: "60점", position: "right", fontSize: 11, fill: "#D97706" }} />
            <Bar dataKey="avg" radius={[6, 6, 0, 0]} fill="#C55A11" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pass rate table */}
      <div className="rounded-[20px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h3 className="text-sm font-semibold text-ink">기수별 합격률 (60점 이상 기준)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/5 bg-mist">
                <th className="px-6 py-3 text-left font-medium text-slate">기수명</th>
                <th className="px-4 py-3 text-center font-medium text-slate">수강생</th>
                <th className="px-4 py-3 text-center font-medium text-slate">평균</th>
                <th className="px-4 py-3 text-center font-medium text-slate">최고</th>
                <th className="px-4 py-3 text-center font-medium text-slate">최저</th>
                <th className="px-4 py-3 text-center font-medium text-slate">합격률</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c, idx) => (
                <tr
                  key={c.id}
                  className={`border-b border-ink/5 transition hover:bg-mist ${idx % 2 === 1 ? "bg-ink/[0.015]" : ""}`}
                >
                  <td className="px-6 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/results/cohort?cohortId=${c.id}`}
                      className="hover:text-ember"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-slate">{c.studentCount}명</td>
                  <td className="px-4 py-3 text-center text-slate">{fmt(c.avgScore)}점</td>
                  <td className="px-4 py-3 text-center text-slate">{fmt(c.topScore)}점</td>
                  <td className="px-4 py-3 text-center text-slate">{fmt(c.bottomScore)}점</td>
                  <td className="px-4 py-3 text-center">
                    {c.passRate === null ? (
                      <span className="text-slate">-</span>
                    ) : (
                      <span
                        className={`font-semibold ${c.passRate >= 70 ? "text-forest" : c.passRate >= 50 ? "text-ember" : "text-red-600"}`}
                      >
                        {fmt(c.passRate)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Selected cohort KPI cards ─────────────────────────────────────────────────

export function CohortKpiCards({ cohort }: { cohort: CohortSummary }) {
  const cards = [
    {
      label: "수강생 수",
      value: `${cohort.studentCount}명`,
      sub: "활성 수강생",
      color: "text-forest",
      bg: "bg-forest/10",
    },
    {
      label: "평균 점수",
      value: cohort.avgScore !== null ? `${fmt(cohort.avgScore)}점` : "-",
      sub: "과목 평균",
      color: "text-ember",
      bg: "bg-ember/10",
    },
    {
      label: "최고 / 최저",
      value:
        cohort.topScore !== null && cohort.bottomScore !== null
          ? `${fmt(cohort.topScore)} / ${fmt(cohort.bottomScore)}`
          : "-",
      sub: "점수 범위",
      color: "text-sky-700",
      bg: "bg-sky-50",
    },
    {
      label: "합격률",
      value: cohort.passRate !== null ? `${fmt(cohort.passRate)}%` : "-",
      sub: "60점 이상 기준",
      color:
        cohort.passRate === null
          ? "text-slate"
          : cohort.passRate >= 70
            ? "text-forest"
            : cohort.passRate >= 50
              ? "text-ember"
              : "text-red-600",
      bg:
        cohort.passRate === null
          ? "bg-ink/5"
          : cohort.passRate >= 70
            ? "bg-forest/10"
            : cohort.passRate >= 50
              ? "bg-ember/10"
              : "bg-red-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-[20px] border border-ink/10 ${card.bg} p-5`}
        >
          <p className="text-xs font-medium text-slate">{card.label}</p>
          <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
          <p className="mt-1 text-xs text-slate/80">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Score distribution BarChart ───────────────────────────────────────────────

export function ScoreDistributionChart({ data }: { data: ScoreDistributionBucket[] }) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-ink">점수 분포 (학생 평균 기준)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: "#4B5563" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#4B5563" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
            formatter={(value) => [`${value}명`, "인원"]}
            labelFormatter={(label) => `${String(label)}점 구간`}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.range} fill={bucketColor(entry.range)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate">색상: 회색(60 미만) → 황색(60대) → 주황(70대) → 녹색(80점+)</p>
    </div>
  );
}

// ─── Subject averages BarChart ─────────────────────────────────────────────────

export function SubjectAveragesChart({ data }: { data: SubjectAverage[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-[20px] border border-ink/10 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">과목별 평균 점수</h3>
        <p className="py-8 text-center text-sm text-slate">성적 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-ink">과목별 평균 점수</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#4B5563" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#4B5563" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
            formatter={(value) => [`${Number(value).toFixed(1)}점`, "과목 평균"]}
          />
          <ReferenceLine y={60} stroke="#D97706" strokeDasharray="4 4" />
          <Bar dataKey="avg" fill="#1F4D3A" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Top 10 table ──────────────────────────────────────────────────────────────

export function Top10Table({ students }: { students: TopStudent[] }) {
  if (students.length === 0) {
    return (
      <div className="rounded-[20px] border border-ink/10 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">상위 10명</h3>
        <p className="py-8 text-center text-sm text-slate">성적 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-6 py-4">
        <h3 className="text-sm font-semibold text-ink">상위 10명</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/5 bg-mist">
              <th className="px-4 py-3 text-center font-medium text-slate">순위</th>
              <th className="px-6 py-3 text-left font-medium text-slate">이름</th>
              <th className="px-4 py-3 text-left font-medium text-slate">학번</th>
              <th className="px-4 py-3 text-center font-medium text-slate">평균 점수</th>
              <th className="px-4 py-3 text-center font-medium text-slate">강점 과목</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr
                key={s.examNumber}
                className="border-b border-ink/5 transition hover:bg-mist"
              >
                <td className="px-4 py-3 text-center">
                  {s.rank <= 3 ? (
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${s.rank === 1 ? "bg-amber-400" : s.rank === 2 ? "bg-slate-400" : "bg-amber-700"}`}
                    >
                      {s.rank}
                    </span>
                  ) : (
                    <span className="text-slate">{s.rank}</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/students/${s.examNumber}`}
                    className="font-medium text-ink hover:text-ember"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate">{s.examNumber}</td>
                <td className="px-4 py-3 text-center font-semibold text-ember">
                  {s.avgScore.toFixed(1)}점
                </td>
                <td className="px-4 py-3 text-center text-slate">{s.bestSubject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Quick-link buttons ────────────────────────────────────────────────────────

function AnalysisLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/admin/results/distribution"
        className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        성적 분포 분석
      </Link>
      <Link
        href="/admin/results/comparison"
        className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        학생 성적 비교
      </Link>
    </div>
  );
}

// ─── Main export (composed view) ──────────────────────────────────────────────

type CohortStatsChartsProps = {
  cohorts: CohortSummary[];
  selectedCohort: SelectedCohortDetail | null;
};

export default function CohortStatsCharts({ cohorts, selectedCohort }: CohortStatsChartsProps) {
  if (selectedCohort) {
    return (
      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CohortKpiCards cohort={selectedCohort} />
        </div>
        <AnalysisLinks />

        <div className="grid gap-6 lg:grid-cols-2">
          <ScoreDistributionChart data={selectedCohort.scoreDistribution} />
          <SubjectAveragesChart data={selectedCohort.subjectAverages} />
        </div>

        <Top10Table students={selectedCohort.top10} />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <AnalysisLinks />
      <AllCohortsCharts cohorts={cohorts} />
    </div>
  );
}
