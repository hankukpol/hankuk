import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// Students who actually sat the exam (not absent)
const ACTIVE_ATTEND_TYPES: AttendType[] = [
  AttendType.NORMAL,
  AttendType.LIVE,
  AttendType.EXCUSED,
];

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function avg(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function roundOne(n: number): string {
  return n.toFixed(1);
}

function avgColor(a: number | null): string {
  if (a === null) return "text-slate";
  if (a >= 70) return "text-green-600";
  if (a >= 50) return "text-amber-600";
  return "text-red-500";
}

function avgBg(a: number | null): string {
  if (a === null) return "bg-mist";
  if (a >= 70) return "bg-green-50 border-green-200";
  if (a >= 50) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function trendIcon(trend: "up" | "down" | "flat" | "none"): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  if (trend === "flat") return "→";
  return "—";
}

function trendColor(trend: "up" | "down" | "flat" | "none"): string {
  if (trend === "up") return "text-green-600";
  if (trend === "down") return "text-red-500";
  return "text-slate";
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ScoreHealthPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // ─── 1. Active exam periods ───────────────────────────────────────────────

  const activePeriods = await prisma.examPeriod.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      sessions: {
        where: { isCancelled: false },
        select: {
          id: true,
          examDate: true,
          week: true,
          subject: true,
          examType: true,
          scores: {
            select: {
              examNumber: true,
              finalScore: true,
              rawScore: true,
              attendType: true,
            },
          },
        },
      },
      enrollments: {
        select: { examNumber: true },
      },
    },
  });

  // ─── 2. Compute per-period health rows ────────────────────────────────────

  type TrendDir = "up" | "down" | "flat" | "none";

  type PeriodHealthRow = {
    id: number;
    name: string;
    enrolledCount: number;
    testedCount: number;
    avgScore: number | null;
    trend: TrendDir;
    trendDelta: number | null;
    atRiskCount: number;
    sessionCount: number;
    sessionsWithScores: number;
    entryCompletionRate: string;
  };

  const rows: PeriodHealthRow[] = activePeriods.map((period) => {
    const enrolledStudents = new Set(period.enrollments.map((e) => e.examNumber));
    const enrolledCount = enrolledStudents.size;

    // All scores across all sessions for this period
    const allScores = period.sessions.flatMap((s) =>
      s.scores
        .filter(
          (sc) =>
            ACTIVE_ATTEND_TYPES.includes(sc.attendType) &&
            (sc.finalScore !== null || sc.rawScore !== null),
        )
        .map((sc) => sc.finalScore ?? sc.rawScore ?? 0),
    );

    const overallAvg = avg(allScores);

    // Unique tested students (appear in at least one score)
    const testedStudentSet = new Set(
      period.sessions.flatMap((s) =>
        s.scores
          .filter((sc) => ACTIVE_ATTEND_TYPES.includes(sc.attendType))
          .map((sc) => sc.examNumber),
      ),
    );
    const testedCount = testedStudentSet.size;

    // Trend: compare avg of last 2 weeks vs 2-4 weeks ago
    const recentScores: number[] = [];
    const olderScores: number[] = [];
    for (const session of period.sessions) {
      const sessionDate = new Date(session.examDate);
      for (const sc of session.scores) {
        if (
          ACTIVE_ATTEND_TYPES.includes(sc.attendType) &&
          (sc.finalScore !== null || sc.rawScore !== null)
        ) {
          const score = sc.finalScore ?? sc.rawScore ?? 0;
          if (sessionDate >= twoWeeksAgo) {
            recentScores.push(score);
          } else if (sessionDate >= fourWeeksAgo && sessionDate < twoWeeksAgo) {
            olderScores.push(score);
          }
        }
      }
    }

    const recentAvg = avg(recentScores);
    const olderAvg = avg(olderScores);

    let trend: TrendDir = "none";
    let trendDelta: number | null = null;
    if (recentAvg !== null && olderAvg !== null) {
      trendDelta = recentAvg - olderAvg;
      if (Math.abs(trendDelta) < 1) trend = "flat";
      else if (trendDelta > 0) trend = "up";
      else trend = "down";
    } else if (recentAvg !== null) {
      trend = "flat";
    }

    // At-risk: students whose average across all sessions is < 40
    const studentScoreMap = new Map<string, number[]>();
    for (const session of period.sessions) {
      for (const sc of session.scores) {
        if (
          ACTIVE_ATTEND_TYPES.includes(sc.attendType) &&
          (sc.finalScore !== null || sc.rawScore !== null)
        ) {
          const score = sc.finalScore ?? sc.rawScore ?? 0;
          if (!studentScoreMap.has(sc.examNumber)) {
            studentScoreMap.set(sc.examNumber, []);
          }
          studentScoreMap.get(sc.examNumber)!.push(score);
        }
      }
    }

    let atRiskCount = 0;
    for (const [, scores] of studentScoreMap) {
      const studentAvg = avg(scores);
      if (studentAvg !== null && studentAvg < 40) atRiskCount++;
    }

    // Entry completion rate
    const sessionCount = period.sessions.length;
    const sessionsWithScores = period.sessions.filter(
      (s) => s.scores.length > 0,
    ).length;
    const entryCompletionRate =
      sessionCount === 0
        ? "—"
        : `${Math.round((sessionsWithScores / sessionCount) * 100)}%`;

    return {
      id: period.id,
      name: period.name,
      enrolledCount,
      testedCount,
      avgScore: overallAvg,
      trend,
      trendDelta,
      atRiskCount,
      sessionCount,
      sessionsWithScores,
      entryCompletionRate,
    };
  });

  // ─── 3. Global KPIs ───────────────────────────────────────────────────────

  // Total unique tested students across all active periods
  const globalTestedSet = new Set(
    activePeriods.flatMap((p) =>
      p.sessions.flatMap((s) =>
        s.scores
          .filter((sc) => ACTIVE_ATTEND_TYPES.includes(sc.attendType))
          .map((sc) => sc.examNumber),
      ),
    ),
  );
  const totalTested = globalTestedSet.size;

  // Global average
  const allGlobalScores = activePeriods.flatMap((p) =>
    p.sessions.flatMap((s) =>
      s.scores
        .filter(
          (sc) =>
            ACTIVE_ATTEND_TYPES.includes(sc.attendType) &&
            (sc.finalScore !== null || sc.rawScore !== null),
        )
        .map((sc) => sc.finalScore ?? sc.rawScore ?? 0),
    ),
  );
  const globalAvg = avg(allGlobalScores);

  // Total at-risk across all periods (deduplicated by examNumber)
  const globalAtRiskSet = new Set<string>();
  for (const period of activePeriods) {
    const studentScoreMap = new Map<string, number[]>();
    for (const session of period.sessions) {
      for (const sc of session.scores) {
        if (
          ACTIVE_ATTEND_TYPES.includes(sc.attendType) &&
          (sc.finalScore !== null || sc.rawScore !== null)
        ) {
          const score = sc.finalScore ?? sc.rawScore ?? 0;
          if (!studentScoreMap.has(sc.examNumber)) {
            studentScoreMap.set(sc.examNumber, []);
          }
          studentScoreMap.get(sc.examNumber)!.push(score);
        }
      }
    }
    for (const [examNo, scores] of studentScoreMap) {
      const studentAvg = avg(scores);
      if (studentAvg !== null && studentAvg < 40) {
        globalAtRiskSet.add(examNo);
      }
    }
  }
  const totalAtRisk = globalAtRiskSet.size;

  // Global entry completion rate
  const totalSessions = activePeriods.reduce((s, p) => s + p.sessions.length, 0);
  const totalSessionsWithScores = activePeriods.reduce(
    (s, p) => s + p.sessions.filter((ses) => ses.scores.length > 0).length,
    0,
  );
  const globalEntryRate =
    totalSessions === 0
      ? "—"
      : `${Math.round((totalSessionsWithScores / totalSessions) * 100)}%`;

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        성적 건강
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">성적 건강 대시보드</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            활성 기수별 평균 점수·추이·위험군 학생 수·성적 입력률을 한눈에 파악합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/scores"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            성적 관리 →
          </Link>
          <Link
            href="/admin/analytics/subject-heatmap"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            과목 히트맵 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/analytics" className="hover:text-ember hover:underline">
          분석
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">성적 건강 대시보드</span>
      </nav>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
          우수 (평균 ≥ 70점)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
          보통 (50~70점)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          주의 (&lt; 50점)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-400" />
          데이터 없음
        </span>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 전체 응시자 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전체 응시자
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {totalTested.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">활성 기수 전체</p>
        </div>

        {/* 전체 평균 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전체 평균
          </p>
          <p className={`mt-2 text-3xl font-semibold ${avgColor(globalAvg)}`}>
            {globalAvg !== null ? roundOne(globalAvg) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">점 (전체 점수 기준)</p>
        </div>

        {/* 위험군 학생 수 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            위험군 학생
          </p>
          <p
            className={`mt-2 text-3xl font-semibold ${
              totalAtRisk > 0 ? "text-red-500" : "text-forest"
            }`}
          >
            {totalAtRisk.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">평균 40점 미만</p>
        </div>

        {/* 성적 입력률 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            성적 입력률
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">{globalEntryRate}</p>
          <p className="mt-1 text-xs text-slate">
            {totalSessionsWithScores} / {totalSessions}회차
          </p>
        </div>
      </div>

      {/* Per-period rows */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
          활성 기수가 없습니다. 기수를 활성화하면 이곳에 데이터가 표시됩니다.
        </div>
      ) : (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">기수별 성적 현황</h2>

          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-[28px] border p-6 ${avgBg(row.avgScore)}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: name + meta */}
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-ink">{row.name}</h3>
                    {/* color dot */}
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        row.avgScore === null
                          ? "bg-slate-300"
                          : row.avgScore >= 70
                          ? "bg-green-500"
                          : row.avgScore >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    응시자 {row.testedCount}명 · 등록 {row.enrolledCount}명 ·{" "}
                    세션 {row.sessionsWithScores}/{row.sessionCount}회
                  </p>
                </div>

                {/* Right: stats */}
                <div className="flex flex-wrap items-center gap-6">
                  {/* Avg score */}
                  <div className="text-center">
                    <p className="text-xs text-slate">평균</p>
                    <p className={`mt-0.5 text-2xl font-bold ${avgColor(row.avgScore)}`}>
                      {row.avgScore !== null ? roundOne(row.avgScore) : "—"}
                    </p>
                  </div>

                  {/* Trend */}
                  <div className="text-center">
                    <p className="text-xs text-slate">추이 (2주)</p>
                    <p className={`mt-0.5 text-xl font-bold ${trendColor(row.trend)}`}>
                      {trendIcon(row.trend)}
                      {row.trendDelta !== null && row.trend !== "flat" && row.trend !== "none" ? (
                        <span className="ml-0.5 text-xs font-normal">
                          {row.trendDelta > 0 ? "+" : ""}
                          {roundOne(row.trendDelta)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {/* At-risk */}
                  <div className="text-center">
                    <p className="text-xs text-slate">위험군</p>
                    <p
                      className={`mt-0.5 text-xl font-bold ${
                        row.atRiskCount > 0 ? "text-red-500" : "text-forest"
                      }`}
                    >
                      {row.atRiskCount}명
                    </p>
                  </div>

                  {/* Entry rate */}
                  <div className="text-center">
                    <p className="text-xs text-slate">입력률</p>
                    <p className="mt-0.5 text-xl font-bold text-ember">
                      {row.entryCompletionRate}
                    </p>
                  </div>
                </div>
              </div>

              {/* Score bar */}
              {row.avgScore !== null && (
                <div className="mt-4">
                  <div className="relative h-2 overflow-hidden rounded-full bg-black/5">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                        row.avgScore >= 70
                          ? "bg-green-500"
                          : row.avgScore >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(row.avgScore, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate/60">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <Link
                  href={`/admin/scores?period=${row.id}`}
                  className="text-xs text-slate transition hover:text-ember hover:underline"
                >
                  성적 상세 보기 →
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Summary table */}
      {rows.length > 0 && (
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">기수 비교표</h2>
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">기수명</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">등록</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">응시</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">평균</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">추이</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">위험군</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">입력률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/scores?period=${row.id}`}
                        className="hover:text-ember hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate">{row.enrolledCount}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink">{row.testedCount}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${avgColor(row.avgScore)}`}>
                      {row.avgScore !== null ? `${roundOne(row.avgScore)}점` : "—"}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-bold ${trendColor(row.trend)}`}>
                      {trendIcon(row.trend)}
                      {row.trendDelta !== null && row.trend !== "flat" && row.trend !== "none" ? (
                        <span className="ml-0.5 text-xs font-normal">
                          {row.trendDelta > 0 ? "+" : ""}
                          {roundOne(row.trendDelta)}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums font-semibold ${
                        row.atRiskCount > 0 ? "text-red-500" : "text-forest"
                      }`}
                    >
                      {row.atRiskCount}명
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ember font-semibold">
                      {row.entryCompletionRate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 홈
        </Link>
        <Link
          href="/admin/scores"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          성적 관리 →
        </Link>
        <Link
          href="/admin/analytics/score-forecast"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          성적 예측 →
        </Link>
      </div>

      <p className="mt-6 text-xs text-slate/70">
        * 활성 기수(isActive=true)만 표시됩니다. 추이는 최근 2주 대 직전 2주 평균 비교입니다.
        위험군은 개인 평균 40점 미만 기준입니다.
      </p>
    </div>
  );
}
