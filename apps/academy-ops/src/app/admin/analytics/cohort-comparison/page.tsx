import type { Metadata } from "next";
import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "기수 비교 분석",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(p: PageProps["searchParams"], key: string): string | undefined {
  const v = p?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

// A color palette for up to 4 cohorts
const COHORT_COLORS = [
  { bar: "bg-forest", text: "text-forest", border: "border-forest/30", bg: "bg-forest/10", hex: "#1F4D3A" },
  { bar: "bg-ember", text: "text-ember", border: "border-ember/30", bg: "bg-ember/10", hex: "#C55A11" },
  { bar: "bg-sky-500", text: "text-sky-600", border: "border-sky-300", bg: "bg-sky-50", hex: "#0ea5e9" },
  { bar: "bg-violet-500", text: "text-violet-600", border: "border-violet-300", bg: "bg-violet-50", hex: "#8b5cf6" },
];

function formatKoreanDate(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function fmtScore(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + "점";
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + "%";
}

function fmtCount(n: number): string {
  return n.toLocaleString("ko-KR") + "명";
}

type CohortMetrics = {
  id: string;
  name: string;
  examCategory: string;
  startDate: Date;
  endDate: Date;
  enrollmentCount: number;
  activeCount: number;
  completedCount: number;
  completionRate: number | null;
  avgScore: number | null;
  attendanceRate: number | null;
  passCount: number;
  // Score trend: list of {week, avg} sorted by date
  scoreTrend: { label: string; avg: number }[];
};

export default async function CohortComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  // Read up to 4 cohort IDs from params; fallback to latest active/completed
  const paramIds = [
    readParam(searchParams, "cohort1"),
    readParam(searchParams, "cohort2"),
    readParam(searchParams, "cohort3"),
    readParam(searchParams, "cohort4"),
  ].filter(Boolean) as string[];

  // Get all cohorts for selector
  const allCohorts = await prisma.cohort.findMany({
    orderBy: { startDate: "desc" },
    take: 40,
    select: { id: true, name: true, examCategory: true, startDate: true, endDate: true, isActive: true },
  });

  // Determine selected cohort IDs
  let selectedIds: string[];
  if (paramIds.length > 0) {
    selectedIds = paramIds.slice(0, 4);
  } else {
    // Default: last 4 cohorts
    selectedIds = allCohorts.slice(0, 4).map((c) => c.id);
  }

  // Fetch detailed cohort data
  const cohorts = await prisma.cohort.findMany({
    where: { id: { in: selectedIds } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, examCategory: true, startDate: true, endDate: true },
  });

  // Gather metrics for each cohort
  const metricsArr: CohortMetrics[] = [];

  for (const cohort of cohorts) {
    // Enrollments
    const enrollmentRows = await prisma.courseEnrollment.findMany({
      where: { cohortId: cohort.id },
      select: { id: true, examNumber: true, status: true },
    });

    const total = enrollmentRows.length;
    const active = enrollmentRows.filter((e) => e.status === "ACTIVE" || e.status === "PENDING").length;
    const completed = enrollmentRows.filter((e) => e.status === "COMPLETED").length;
    const examNumbers = enrollmentRows.map((e) => e.examNumber);

    const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : null;

    // Average score
    let avgScore: number | null = null;
    if (examNumbers.length > 0) {
      const scoreAgg = await prisma.score.aggregate({
        _avg: { finalScore: true },
        where: {
          examNumber: { in: examNumbers },
          finalScore: { not: null },
          session: {
            examDate: { gte: cohort.startDate, lte: cohort.endDate },
            isCancelled: false,
          },
        },
      });
      avgScore = scoreAgg._avg.finalScore !== null
        ? Math.round(scoreAgg._avg.finalScore * 10) / 10
        : null;
    }

    // Attendance rate
    let attendanceRate: number | null = null;
    if (examNumbers.length > 0) {
      const attendLogs = await prisma.classroomAttendanceLog.groupBy({
        by: ["attendType"],
        _count: { attendType: true },
        where: {
          examNumber: { in: examNumbers },
          attendDate: { gte: cohort.startDate, lte: cohort.endDate },
        },
      });
      const presentCount = attendLogs
        .filter((l) => l.attendType === "NORMAL" || l.attendType === "LIVE")
        .reduce((s, l) => s + l._count.attendType, 0);
      const totalCount = attendLogs.reduce((s, l) => s + l._count.attendType, 0);
      attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 1000) / 10 : null;
    }

    // Pass count (graduate records during cohort window)
    let passCount = 0;
    if (examNumbers.length > 0) {
      passCount = await prisma.graduateRecord.count({
        where: {
          examNumber: { in: examNumbers },
          finalPassDate: { gte: cohort.startDate, lte: new Date() },
        },
      });
    }

    // Score trend: aggregate avg per exam week within cohort range
    let scoreTrend: { label: string; avg: number }[] = [];
    if (examNumbers.length > 0) {
      const sessions = await prisma.examSession.findMany({
        where: {
          examDate: { gte: cohort.startDate, lte: cohort.endDate },
          isCancelled: false,
          scores: { some: { examNumber: { in: examNumbers }, finalScore: { not: null } } },
        },
        select: { id: true, examDate: true, week: true },
        orderBy: { examDate: "asc" },
        distinct: ["week"],
        take: 12,
      });

      for (const session of sessions) {
        const agg = await prisma.score.aggregate({
          _avg: { finalScore: true },
          where: {
            sessionId: session.id,
            examNumber: { in: examNumbers },
            finalScore: { not: null },
          },
        });
        if (agg._avg.finalScore !== null) {
          scoreTrend.push({
            label: `${session.week}주`,
            avg: Math.round(agg._avg.finalScore * 10) / 10,
          });
        }
      }
    }

    metricsArr.push({
      id: cohort.id,
      name: cohort.name,
      examCategory: EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? cohort.examCategory,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      enrollmentCount: total,
      activeCount: active,
      completedCount: completed,
      completionRate,
      avgScore,
      attendanceRate,
      passCount,
      scoreTrend,
    });
  }

  // Build score trend SVG data: collect all unique week labels
  const allWeekLabels = Array.from(
    new Set(metricsArr.flatMap((m) => m.scoreTrend.map((t) => t.label)))
  );

  // For CSV export: build query string
  const currentParams = selectedIds
    .map((id, i) => `cohort${i + 1}=${encodeURIComponent(id)}`)
    .join("&");

  // Score trend SVG dimensions
  const SVG_W = 560;
  const SVG_H = 180;
  const PAD_L = 36;
  const PAD_R = 20;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = SVG_W - PAD_L - PAD_R;
  const plotH = SVG_H - PAD_T - PAD_B;

  const allScoreValues = metricsArr.flatMap((m) => m.scoreTrend.map((t) => t.avg));
  const minScore = allScoreValues.length > 0 ? Math.max(0, Math.floor(Math.min(...allScoreValues) / 10) * 10 - 10) : 0;
  const maxScore = allScoreValues.length > 0 ? Math.min(100, Math.ceil(Math.max(...allScoreValues) / 10) * 10 + 5) : 100;

  function toSvgX(idx: number, total: number): number {
    if (total <= 1) return PAD_L + plotW / 2;
    return PAD_L + (idx / (total - 1)) * plotW;
  }

  function toSvgY(score: number): number {
    return PAD_T + plotH - ((score - minScore) / (maxScore - minScore)) * plotH;
  }

  const trendLines = metricsArr.map((metrics, mi) => {
    const color = COHORT_COLORS[mi] ?? COHORT_COLORS[0];
    const points = allWeekLabels.map((label, idx) => {
      const found = metrics.scoreTrend.find((t) => t.label === label);
      if (!found) return null;
      return { x: toSvgX(idx, allWeekLabels.length), y: toSvgY(found.avg), avg: found.avg };
    });
    const validPoints = points.filter(Boolean) as { x: number; y: number; avg: number }[];
    const pathD = validPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { metrics, color, points: validPoints, pathD };
  });

  // Y-axis gridlines
  const yGridValues: number[] = [];
  for (let v = minScore; v <= maxScore; v += 10) yGridValues.push(v);

  return (
    <div className="p-6 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        Analytics
      </div>
      <h1 className="mt-4 text-3xl font-semibold">기수 비교 분석</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
        최대 4개 기수를 나란히 비교합니다. 학생수, 평균 점수, 출석률, 수강 완료율, 합격자수를 한눈에 확인하세요.
      </p>

      {/* Cohort selector form */}
      <form
        method="get"
        className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <p className="mb-4 text-sm font-semibold">비교할 기수 선택 (최대 4개)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => {
            const color = COHORT_COLORS[idx]!;
            const currentId = selectedIds[idx] ?? "";
            return (
              <div key={idx}>
                <label className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${color.text}`}>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.bar}`} />
                  기수 {idx + 1}
                </label>
                <select
                  name={`cohort${idx + 1}`}
                  defaultValue={currentId}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">선택 안 함</option>
                  {allCohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({EXAM_CATEGORY_LABEL[c.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? c.examCategory})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90"
          >
            비교하기
          </button>
          <Link
            href="/admin/analytics/cohort-comparison"
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
          >
            초기화
          </Link>
        </div>
      </form>

      {metricsArr.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-base font-semibold text-ink">비교할 기수를 선택해 주세요</p>
          <p className="mt-2 text-sm text-slate">위 셀렉터에서 비교할 기수를 선택하고 비교하기를 누르세요.</p>
        </div>
      ) : (
        <>
          {/* Side-by-side metric bars */}
          <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Comparison</p>
                <h2 className="mt-1 text-xl font-semibold">기수별 주요 지표 비교</h2>
              </div>
              {/* CSV Export */}
              <a
                href={`/api/admin/analytics/cohort-comparison/export?${currentParams}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                CSV 내보내기
              </a>
            </div>

            {/* Metric: 학생수 */}
            <MetricSection
              title="학생수"
              unit="명"
              items={metricsArr.map((m, i) => ({
                label: m.name,
                value: m.enrollmentCount,
                color: COHORT_COLORS[i] ?? COHORT_COLORS[0]!,
              }))}
              maxVal={Math.max(...metricsArr.map((m) => m.enrollmentCount), 1)}
              formatter={(v) => fmtCount(v)}
            />

            {/* Metric: 평균점수 */}
            <MetricSection
              title="평균 점수"
              unit="점"
              items={metricsArr.map((m, i) => ({
                label: m.name,
                value: m.avgScore ?? 0,
                displayLabel: fmtScore(m.avgScore),
                color: COHORT_COLORS[i] ?? COHORT_COLORS[0]!,
              }))}
              maxVal={100}
              formatter={(v) => `${v}점`}
            />

            {/* Metric: 출석률 */}
            <MetricSection
              title="출석률"
              unit="%"
              items={metricsArr.map((m, i) => ({
                label: m.name,
                value: m.attendanceRate ?? 0,
                displayLabel: fmtPct(m.attendanceRate),
                color: COHORT_COLORS[i] ?? COHORT_COLORS[0]!,
              }))}
              maxVal={100}
              formatter={(v) => `${v}%`}
            />

            {/* Metric: 수강완료율 */}
            <MetricSection
              title="수강 완료율"
              unit="%"
              items={metricsArr.map((m, i) => ({
                label: m.name,
                value: m.completionRate ?? 0,
                displayLabel: fmtPct(m.completionRate),
                color: COHORT_COLORS[i] ?? COHORT_COLORS[0]!,
              }))}
              maxVal={100}
              formatter={(v) => `${v}%`}
            />

            {/* Metric: 합격자수 */}
            <MetricSection
              title="합격자수"
              unit="명"
              items={metricsArr.map((m, i) => ({
                label: m.name,
                value: m.passCount,
                color: COHORT_COLORS[i] ?? COHORT_COLORS[0]!,
              }))}
              maxVal={Math.max(...metricsArr.map((m) => m.passCount), 1)}
              formatter={(v) => `${v}명`}
            />
          </section>

          {/* Score trend SVG line chart */}
          {allWeekLabels.length > 0 && (
            <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Score Trend</p>
                <h2 className="mt-1 text-xl font-semibold">주차별 평균 점수 추이</h2>
              </div>

              {/* Legend */}
              <div className="mb-4 flex flex-wrap gap-3">
                {trendLines.map(({ metrics: m, color }, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`h-3 w-3 rounded-full ${color.bar}`} />
                    <span className="text-xs font-semibold text-slate">{m.name}</span>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                  width={SVG_W}
                  height={SVG_H}
                  style={{ minWidth: Math.max(SVG_W, allWeekLabels.length * 60) }}
                >
                  {/* Y gridlines */}
                  {yGridValues.map((v) => {
                    const y = toSvgY(v);
                    return (
                      <g key={v}>
                        <line
                          x1={PAD_L}
                          y1={y}
                          x2={SVG_W - PAD_R}
                          y2={y}
                          stroke="#e5e7eb"
                          strokeWidth={1}
                        />
                        <text
                          x={PAD_L - 4}
                          y={y + 4}
                          textAnchor="end"
                          fontSize={9}
                          fill="#9ca3af"
                        >
                          {v}
                        </text>
                      </g>
                    );
                  })}

                  {/* X axis labels */}
                  {allWeekLabels.map((label, idx) => {
                    const x = toSvgX(idx, allWeekLabels.length);
                    return (
                      <text
                        key={label}
                        x={x}
                        y={SVG_H - 6}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#9ca3af"
                      >
                        {label}
                      </text>
                    );
                  })}

                  {/* Trend lines */}
                  {trendLines.map(({ color, points, pathD }, i) =>
                    pathD ? (
                      <g key={i}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={color.hex}
                          strokeWidth={2.5}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {points.map((p, j) => (
                          <circle key={j} cx={p.x} cy={p.y} r={4} fill={color.hex} stroke="white" strokeWidth={1.5} />
                        ))}
                      </g>
                    ) : null
                  )}
                </svg>
              </div>
            </section>
          )}

          {/* Side-by-side cohort detail cards */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricsArr.map((m, i) => {
              const color = COHORT_COLORS[i] ?? COHORT_COLORS[0]!;
              return (
                <article
                  key={m.id}
                  className={`rounded-[28px] border p-5 ${color.border} ${color.bg}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color.border} ${color.text} bg-white`}>
                        기수 {i + 1}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-ink leading-snug">{m.name}</h3>
                      <p className="mt-0.5 text-xs text-slate">{m.examCategory}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">기간</span>
                      <span className="text-xs font-semibold text-ink">
                        {formatKoreanDate(m.startDate)} ~ {formatKoreanDate(m.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">학생수</span>
                      <span className="text-xs font-semibold text-ink">{fmtCount(m.enrollmentCount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">평균 점수</span>
                      <span className={`text-xs font-semibold ${m.avgScore !== null ? (m.avgScore >= 80 ? "text-forest" : m.avgScore >= 60 ? "text-amber-600" : "text-red-600") : "text-slate"}`}>
                        {fmtScore(m.avgScore)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">출석률</span>
                      <span className="text-xs font-semibold text-ink">{fmtPct(m.attendanceRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">수강 완료율</span>
                      <span className="text-xs font-semibold text-ink">{fmtPct(m.completionRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate">합격자</span>
                      <span className="text-xs font-semibold text-ink">{m.passCount}명</span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-ink/10 pt-3">
                    <Link
                      href={`/admin/cohorts/${m.id}`}
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${color.text} transition hover:underline`}
                    >
                      이 기수 상세 보기
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                      </svg>
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// Local helper component: MetricSection
// ────────────────────────────────────────────────

type MetricItem = {
  label: string;
  value: number;
  displayLabel?: string;
  color: { bar: string; text: string };
};

function MetricSection({
  title,
  items,
  maxVal,
  formatter,
}: {
  title: string;
  unit: string;
  items: MetricItem[];
  maxVal: number;
  formatter: (v: number) => string;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => {
          const pct = maxVal > 0 ? Math.min(100, Math.round((item.value / maxVal) * 100)) : 0;
          const display = item.displayLabel ?? formatter(item.value);
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs font-semibold text-slate" title={item.label}>
                {item.label}
              </div>
              <div className="relative h-5 flex-1 rounded-full bg-ink/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${item.color.bar} opacity-80`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={`w-16 shrink-0 text-right text-xs font-semibold ${item.color.text}`}>
                {display}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
