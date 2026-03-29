import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type DivisionBreakdown = {
  GONGCHAE_M: number;
  GONGCHAE_F: number;
  GYEONGCHAE: number;
  ONLINE: number;
};

type ExamScoreSummary = {
  id: string;
  title: string;
  examDate: string;
  totalCount: number;
  scoredCount: number;
  avgScore: number | null;
  topScore: number | null;
  passRate: number | null;
  /** Score distribution: index = bucket 0-9 → score range 0-9, 10-19, …, 90-100 */
  histogram: number[];
  /** Per-division average scores */
  divisionAvg: Partial<Record<keyof DivisionBreakdown, number | null>>;
  divisionCounts: DivisionBreakdown;
};

type TopPerformer = {
  examNumber: string;
  name: string;
  avgScore: number;
  examCount: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const DIVISION_KEYS = [
  "GONGCHAE_M",
  "GONGCHAE_F",
  "GYEONGCHAE",
  "ONLINE",
] as const;

/** Compute 10-bucket histogram (0-9, 10-19, …, 90-100) */
function buildHistogram(scores: number[]): number[] {
  const buckets = Array<number>(10).fill(0);
  for (const s of scores) {
    const idx = Math.min(Math.floor(s / 10), 9);
    buckets[idx]++;
  }
  return buckets;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function MonthlyExamResultsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const sp = await Promise.resolve(searchParams);
  const now = new Date();
  const filterYear = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const yearStart = new Date(filterYear, 0, 1);
  const yearEnd = new Date(filterYear + 1, 0, 1);

  // ── 1. Fetch events with registrations AND their scores ─────────────────────
  const events = await prisma.examEvent.findMany({
    where: {
      eventType: ExamEventType.MONTHLY,
      examDate: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { examDate: "asc" },
    take: 12,
    include: {
      registrations: {
        where: { cancelledAt: null },
        select: {
          division: true,
          isPaid: true,
          examNumber: true,
          externalName: true,
          score: {
            select: { score: true },
          },
        },
      },
    },
  });

  // Derive available years
  const allEvents = await prisma.examEvent.findMany({
    where: { eventType: ExamEventType.MONTHLY },
    orderBy: { examDate: "desc" },
    select: { examDate: true },
  });
  const availableYears = Array.from(
    new Set(allEvents.map((e) => e.examDate.getFullYear())),
  ).sort((a, b) => b - a);

  // ── 2. Build per-event score summaries ─────────────────────────────────────
  const examScoreSummaries: ExamScoreSummary[] = events.map((e) => {
    const regs = e.registrations;
    const totalCount = regs.length;

    const allScoreValues = regs
      .filter((r) => r.score !== null)
      .map((r) => r.score!.score);
    const scoredCount = allScoreValues.length;

    const avgScore =
      scoredCount > 0
        ? round1(allScoreValues.reduce((s, v) => s + v, 0) / scoredCount)
        : null;
    const topScore =
      scoredCount > 0 ? round1(Math.max(...allScoreValues)) : null;
    const passCount = allScoreValues.filter((s) => s >= 60).length;
    const passRate =
      scoredCount > 0 ? round1((passCount / scoredCount) * 100) : null;

    const histogram = buildHistogram(allScoreValues);

    // Per-division averages
    const divisionAvg: Partial<Record<keyof DivisionBreakdown, number | null>> =
      {};
    for (const div of DIVISION_KEYS) {
      const divScores = regs
        .filter((r) => r.division === div && r.score !== null)
        .map((r) => r.score!.score);
      if (divScores.length > 0) {
        divisionAvg[div] = round1(
          divScores.reduce((s, v) => s + v, 0) / divScores.length,
        );
      } else {
        const hasDiv = regs.some((r) => r.division === div);
        divisionAvg[div] = hasDiv ? null : undefined;
      }
    }

    // Division participant counts
    const divisionCounts: DivisionBreakdown = {
      GONGCHAE_M: 0,
      GONGCHAE_F: 0,
      GYEONGCHAE: 0,
      ONLINE: 0,
    };
    for (const r of regs) {
      if (r.division in divisionCounts) {
        divisionCounts[r.division as keyof DivisionBreakdown]++;
      }
    }

    return {
      id: e.id,
      title: e.title,
      examDate: e.examDate.toISOString(),
      totalCount,
      scoredCount,
      avgScore,
      topScore,
      passRate,
      histogram,
      divisionAvg,
      divisionCounts,
    };
  });

  // ── 3. Aggregate KPIs ──────────────────────────────────────────────────────
  const totalDivisionBreakdown: DivisionBreakdown = {
    GONGCHAE_M: 0,
    GONGCHAE_F: 0,
    GYEONGCHAE: 0,
    ONLINE: 0,
  };
  for (const s of examScoreSummaries) {
    for (const div of DIVISION_KEYS) {
      totalDivisionBreakdown[div] += s.divisionCounts[div];
    }
  }
  const totalParticipants = Object.values(totalDivisionBreakdown).reduce(
    (a, b) => a + b,
    0,
  );

  // ── 4. Monthly participation trend ────────────────────────────────────────
  const monthlyTrend = examScoreSummaries.map((s) => ({
    month: new Date(s.examDate).toLocaleDateString("ko-KR", { month: "short" }),
    count: s.totalCount,
  }));
  const maxCount = Math.max(...monthlyTrend.map((m) => m.count), 1);

  // ── 5. Top 10 frequently attending students ────────────────────────────────
  const allYearRegs = await prisma.examRegistration.findMany({
    where: {
      examEvent: {
        eventType: ExamEventType.MONTHLY,
        examDate: { gte: yearStart, lt: yearEnd },
      },
      cancelledAt: null,
      examNumber: { not: null },
    },
    select: {
      examNumber: true,
      isPaid: true,
      student: { select: { name: true } },
      score: { select: { score: true } },
    },
  });

  const studentRegMap = new Map<
    string,
    { name: string; count: number; scores: number[] }
  >();
  for (const r of allYearRegs) {
    if (!r.examNumber || !r.student) continue;
    const entry = studentRegMap.get(r.examNumber);
    const scoreVal = r.score?.score ?? null;
    if (entry) {
      entry.count += 1;
      if (scoreVal !== null) entry.scores.push(scoreVal);
    } else {
      studentRegMap.set(r.examNumber, {
        name: r.student.name,
        count: 1,
        scores: scoreVal !== null ? [scoreVal] : [],
      });
    }
  }

  const topPerformers: TopPerformer[] = Array.from(studentRegMap.entries())
    .map(([examNumber, { name, count, scores }]) => ({
      examNumber,
      name,
      avgScore:
        scores.length > 0
          ? round1(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0,
      examCount: count,
    }))
    .sort((a, b) => b.examCount - a.examCount || b.avgScore - a.avgScore)
    .slice(0, 10);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "월말평가 접수 관리", href: "/admin/exams/monthly" },
          { label: "결과 분석" },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Monthly Exam Analytics
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            월말평가 결과 분석
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월말평가 접수 현황, 성적 입력 현황, 점수 분포 및 구분별 통계를
            분석합니다.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-0">
          <div className="flex items-center gap-2">
            {availableYears.map((y) => (
              <Link
                key={y}
                href={`/admin/exams/monthly/results?year=${y}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  y === filterYear
                    ? "bg-ember text-white"
                    : "border border-ink/10 text-slate hover:bg-ink/5"
                }`}
              >
                {y}년
              </Link>
            ))}
          </div>
          <Link
            href="/admin/exams/monthly"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:bg-ink/5"
          >
            접수 관리로
          </Link>
        </div>
      </div>

      {examScoreSummaries.length === 0 ? (
        <div className="mt-12 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
          {filterYear}년 월말평가 데이터가 없습니다.
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {/* ── Section 1: KPI Overview ───────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              {filterYear}년 종합 현황
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  시험 횟수
                </p>
                <p className="mt-3 text-4xl font-bold text-ink">
                  {examScoreSummaries.length}
                </p>
                <p className="mt-1 text-xs text-slate">회</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  총 응시 인원
                </p>
                <p className="mt-3 text-4xl font-bold text-ember">
                  {totalParticipants.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  회당 평균 응시
                </p>
                <p className="mt-3 text-4xl font-bold text-forest">
                  {examScoreSummaries.length > 0
                    ? round1(totalParticipants / examScoreSummaries.length)
                    : 0}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  재원생 응시
                </p>
                <p className="mt-3 text-4xl font-bold text-ink">
                  {studentRegMap.size.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
            </div>
          </section>

          {/* ── Section 2: Participation trend bar chart ─────────────────── */}
          {monthlyTrend.length > 1 && (
            <section>
              <h2 className="text-lg font-semibold text-ink">
                월별 응시 추이
              </h2>
              <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6">
                <div className="flex h-40 items-end gap-3">
                  {monthlyTrend.map((m, idx) => {
                    const heightPct =
                      maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                    return (
                      <div
                        key={idx}
                        className="flex flex-1 flex-col items-center gap-1"
                      >
                        <span className="text-xs font-mono text-slate">
                          {m.count}
                        </span>
                        <div
                          className="w-full rounded-t-lg bg-ember/70 transition-all"
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        />
                        <span className="text-xs text-slate">{m.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── Section 3: Division breakdown ────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">구분별 누계</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DIVISION_KEYS.map((div) => {
                const count = totalDivisionBreakdown[div];
                const pct =
                  totalParticipants > 0
                    ? round1((count / totalParticipants) * 100)
                    : 0;
                return (
                  <div
                    key={div}
                    className="rounded-[28px] border border-ink/10 bg-white p-5 text-center"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                      {DIVISION_LABEL[div]}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-ink">
                      {count.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-slate">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Section 4: Per-event summary table with score badge ───────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              회차별 현황{" "}
              <span className="text-sm font-normal text-slate">
                ({filterYear}년 최근 12회)
              </span>
            </h2>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험명
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험일
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      공채(남)
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      공채(여)
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      경채
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      온라인
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      합계
                    </th>
                    <th className="px-5 py-3.5 text-center font-semibold text-ink/60">
                      성적 입력률
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      평균
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      합격률
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {examScoreSummaries.map((row) => {
                    const allEntered =
                      row.totalCount > 0 &&
                      row.scoredCount === row.totalCount;
                    const badgeClass = allEntered
                      ? "bg-forest/10 text-forest border-forest/20"
                      : row.scoredCount > 0
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-ink/5 text-slate border-ink/10";
                    return (
                      <tr key={row.id} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">
                          <Link
                            href={`/admin/exams/monthly/${row.id}`}
                            className="hover:text-ember hover:underline"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {formatDate(row.examDate)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.divisionCounts.GONGCHAE_M}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.divisionCounts.GONGCHAE_F}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.divisionCounts.GYEONGCHAE}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.divisionCounts.ONLINE}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {row.totalCount}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
                          >
                            {row.scoredCount}/{row.totalCount} 입력
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          {row.avgScore !== null ? (
                            <span className="font-semibold text-ink">
                              {row.avgScore}점
                            </span>
                          ) : (
                            <span className="text-ink/20">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          {row.passRate !== null ? (
                            <span
                              className={
                                row.passRate >= 80
                                  ? "font-semibold text-forest"
                                  : row.passRate >= 60
                                    ? "text-ink"
                                    : "text-amber-600"
                              }
                            >
                              {row.passRate}%
                            </span>
                          ) : (
                            <span className="text-ink/20">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink/10 bg-mist/80">
                    <td
                      colSpan={2}
                      className="px-5 py-3.5 text-sm font-semibold text-ink"
                    >
                      합계
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GONGCHAE_M}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GONGCHAE_F}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GYEONGCHAE}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.ONLINE}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">
                      {totalParticipants}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── Section 5: Score distribution histograms ──────────────────── */}
          {examScoreSummaries.some((s) => s.scoredCount > 0) && (
            <section>
              <h2 className="text-lg font-semibold text-ink">
                점수 분포 히스토그램{" "}
                <span className="text-sm font-normal text-slate">
                  (10점 구간)
                </span>
              </h2>
              <div className="mt-4 space-y-4">
                {examScoreSummaries
                  .filter((s) => s.scoredCount > 0)
                  .map((s) => {
                    const maxBucket = Math.max(...s.histogram, 1);
                    const bucketLabels = [
                      "0-9",
                      "10-19",
                      "20-29",
                      "30-39",
                      "40-49",
                      "50-59",
                      "60-69",
                      "70-79",
                      "80-89",
                      "90-100",
                    ];
                    return (
                      <div
                        key={s.id}
                        className="rounded-[28px] border border-ink/10 bg-white p-6"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">
                            {s.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate">
                            <span>
                              평균{" "}
                              <span className="font-semibold text-ink">
                                {s.avgScore}점
                              </span>
                            </span>
                            <span>
                              최고{" "}
                              <span className="font-semibold text-ember">
                                {s.topScore}점
                              </span>
                            </span>
                            <span>
                              합격률(60점↑){" "}
                              <span className="font-semibold text-forest">
                                {s.passRate}%
                              </span>
                            </span>
                            <span className="text-slate/70">
                              ({s.scoredCount}명 입력)
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 flex h-28 items-end gap-1.5">
                          {s.histogram.map((cnt, idx) => {
                            const heightPct =
                              maxBucket > 0 ? (cnt / maxBucket) * 100 : 0;
                            const isPass = idx >= 6; // 60점 이상
                            return (
                              <div
                                key={idx}
                                className="flex flex-1 flex-col items-center gap-1"
                              >
                                {cnt > 0 && (
                                  <span className="text-[10px] font-mono text-slate">
                                    {cnt}
                                  </span>
                                )}
                                <div
                                  className={`w-full rounded-t transition-all ${
                                    isPass
                                      ? "bg-forest/60"
                                      : "bg-amber-400/60"
                                  }`}
                                  style={{
                                    height: `${Math.max(heightPct, cnt > 0 ? 4 : 0)}%`,
                                  }}
                                />
                                <span className="text-[9px] text-slate/70 leading-none">
                                  {bucketLabels[idx]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate">
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-3 rounded-sm bg-amber-400/60" />
                            불합격 구간(60점 미만)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-3 rounded-sm bg-forest/60" />
                            합격 구간(60점↑)
                          </span>
                        </div>

                        {/* Per-division averages */}
                        {DIVISION_KEYS.some(
                          (d) => s.divisionAvg[d] !== undefined,
                        ) && (
                          <div className="mt-4 border-t border-ink/5 pt-4">
                            <p className="mb-2 text-xs font-semibold text-slate">
                              구분별 평균
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {DIVISION_KEYS.filter(
                                (d) => s.divisionAvg[d] !== undefined,
                              ).map((d) => {
                                const avg = s.divisionAvg[d];
                                return (
                                  <span
                                    key={d}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs"
                                  >
                                    <span className="font-medium text-ink">
                                      {DIVISION_LABEL[d]}
                                    </span>
                                    <span
                                      className={
                                        avg !== null
                                          ? "font-semibold text-forest"
                                          : "text-slate"
                                      }
                                    >
                                      {avg !== null ? `${avg}점` : "미입력"}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* ── Section 6: Top 10 frequent participants ───────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              다회 응시 재원생 TOP 10{" "}
              <span className="text-sm font-normal text-slate">
                ({filterYear}년, 응시 횟수 기준)
              </span>
            </h2>
            {topPerformers.length === 0 ? (
              <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
                {filterYear}년 재원생 응시 기록이 없습니다.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist/80">
                      <th className="w-12 px-5 py-3.5 text-center font-semibold text-ink/60">
                        순위
                      </th>
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        학생
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        응시 횟수
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        평균 점수
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {topPerformers.map((t, idx) => (
                      <tr key={t.examNumber} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 text-center">
                          {idx === 0 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
                              1
                            </span>
                          ) : idx === 1 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate/40 text-xs font-bold text-white">
                              2
                            </span>
                          ) : idx === 2 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700/60 text-xs font-bold text-white">
                              3
                            </span>
                          ) : (
                            <span className="text-slate">{idx + 1}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/students/${t.examNumber}`}
                            className="font-medium text-ink transition hover:text-ember"
                          >
                            {t.name}
                          </Link>{" "}
                          <span className="text-xs text-slate">
                            {t.examNumber}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {t.examCount}회
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          {t.avgScore > 0 ? (
                            <span
                              className={
                                t.avgScore >= 80
                                  ? "font-semibold text-forest"
                                  : t.avgScore >= 60
                                    ? "text-ink"
                                    : "text-amber-600"
                              }
                            >
                              {t.avgScore}점
                            </span>
                          ) : (
                            <span className="text-slate/50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Section 7: Division × Event matrix ───────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              구분별 월별 추이 매트릭스{" "}
              <span className="text-sm font-normal text-slate">
                (시험 × 구분)
              </span>
            </h2>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="whitespace-nowrap px-5 py-3.5 text-left font-semibold text-ink/60">
                      구분
                    </th>
                    {examScoreSummaries.map((s) => (
                      <th
                        key={s.id}
                        className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-ink/60"
                      >
                        {new Date(s.examDate).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {DIVISION_KEYS.map((div) => (
                    <tr key={div} className="hover:bg-mist/30">
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-ink">
                        {DIVISION_LABEL[div]}
                      </td>
                      {examScoreSummaries.map((s) => {
                        const count = s.divisionCounts[div];
                        return (
                          <td
                            key={s.id}
                            className="px-4 py-3.5 text-right font-mono"
                          >
                            {count > 0 ? (
                              <span
                                className={
                                  count >= 30
                                    ? "font-semibold text-forest"
                                    : count >= 10
                                      ? "text-ink"
                                      : "text-slate"
                                }
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-ink/20">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ember">
                        {totalDivisionBreakdown[div]}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-ink/10 bg-mist/50">
                    <td className="px-5 py-3.5 font-semibold text-ink">
                      합계
                    </td>
                    {examScoreSummaries.map((s) => (
                      <td
                        key={s.id}
                        className="px-4 py-3.5 text-right font-mono font-semibold text-ink"
                      >
                        {s.totalCount}
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">
                      {totalParticipants}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
