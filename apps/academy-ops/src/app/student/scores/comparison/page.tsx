import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

// ─── Helpers ────────────────────────────────────────────────────────────────

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function diffColorClass(diff: number): string {
  if (diff > 0) return "text-[#1F4D3A] font-semibold";
  if (diff < 0) return "text-red-600 font-semibold";
  return "text-slate";
}

// CSS bar width (clamped 0–100)
function barWidth(score: number | null): number {
  if (score === null) return 0;
  return Math.min(100, Math.max(0, score));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ComparisonBar({
  myScore,
  avgScore,
  label,
}: {
  myScore: number | null;
  avgScore: number | null;
  label: string;
}) {
  const myW = barWidth(myScore);
  const avgW = barWidth(avgScore);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <div className="flex items-center gap-3 tabular-nums text-[11px] text-slate">
          {myScore !== null && (
            <span className="font-semibold text-ink">{round1(myScore)}점</span>
          )}
          {avgScore !== null && (
            <span>평균 {round1(avgScore)}점</span>
          )}
        </div>
      </div>
      {/* My score bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-mist">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${myW}%`, backgroundColor: "#C55A11" }}
        />
      </div>
      {/* Class average bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-mist">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${avgW}%`, backgroundColor: "#9CA3AF" }}
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-ember" />
          내 점수
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-slate/40" />
          반 평균
        </span>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function StudentScoreComparisonPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              성적 비교
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              성적 비교
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/scores/comparison" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // Find most recent period with scores for this student
  const period = await prisma.examPeriod.findFirst({
    where: {
      sessions: {
        some: {
          examType: viewer.examType,
          isCancelled: false,
          scores: {
            some: { examNumber: viewer.examNumber },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  if (!period) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center gap-2 text-sm text-slate">
            <Link href="/student/scores" className="transition hover:text-ember">
              성적 카드
            </Link>
            <span>/</span>
            <span className="font-medium text-ink">반 평균 비교</span>
          </div>
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              성적 비교
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              비교 가능한 성적 데이터가 없습니다.
            </h1>
            <div className="mt-6">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                성적 카드로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // Fetch last 10 sessions that have my scores
  const mySessions = await prisma.examSession.findMany({
    where: {
      periodId: period.id,
      examType: viewer.examType,
      isCancelled: false,
      scores: {
        some: {
          examNumber: viewer.examNumber,
          finalScore: { not: null },
        },
      },
    },
    orderBy: { examDate: "desc" },
    take: 10,
    select: {
      id: true,
      subject: true,
      examDate: true,
      week: true,
    },
  });

  const sessionIds = mySessions.map((s) => s.id);

  if (sessionIds.length === 0) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <h1 className="text-2xl font-semibold">성적 데이터가 없습니다.</h1>
          </section>
        </div>
      </main>
    );
  }

  // Fetch all scores from those sessions (for cohort average computation)
  const allScoresInSessions = await prisma.score.findMany({
    where: {
      sessionId: { in: sessionIds },
      finalScore: { not: null },
    },
    select: {
      examNumber: true,
      sessionId: true,
      finalScore: true,
    },
  });

  // Build per-session cohort average
  type SessionAvgMap = Map<number, { sum: number; count: number }>;
  const cohortSessionMap: SessionAvgMap = new Map();
  for (const sc of allScoresInSessions) {
    if (sc.finalScore === null) continue;
    const entry = cohortSessionMap.get(sc.sessionId) ?? { sum: 0, count: 0 };
    entry.sum += sc.finalScore;
    entry.count += 1;
    cohortSessionMap.set(sc.sessionId, entry);
  }

  // Build per-session my score map
  const myScoreMap = new Map<number, number>();
  for (const sc of allScoresInSessions) {
    if (sc.finalScore !== null && sc.examNumber === viewer.examNumber) {
      myScoreMap.set(sc.sessionId, sc.finalScore);
    }
  }

  // ── Per-subject summary (aggregate across all 10 sessions) ──
  const subjects = Array.from(new Set(mySessions.map((s) => s.subject))) as Subject[];

  interface SubjectRow {
    subject: Subject;
    label: string;
    myAvg: number | null;
    cohortAvg: number | null;
    diff: number | null;
    sessionCount: number;
  }

  const subjectRows: SubjectRow[] = subjects.map((subject) => {
    const subjectSessionIds = mySessions
      .filter((s) => s.subject === subject)
      .map((s) => s.id);

    const myScores = subjectSessionIds
      .map((id) => myScoreMap.get(id))
      .filter((v): v is number => v !== undefined);

    const cohortScores = allScoresInSessions
      .filter(
        (sc) =>
          subjectSessionIds.includes(sc.sessionId) && sc.finalScore !== null,
      )
      .map((sc) => sc.finalScore as number);

    const mySubjectAvg = avg(myScores);
    const cohortSubjectAvg = avg(cohortScores);

    return {
      subject,
      label: SUBJECT_LABEL[subject] ?? subject,
      myAvg: mySubjectAvg,
      cohortAvg: cohortSubjectAvg,
      diff:
        mySubjectAvg !== null && cohortSubjectAvg !== null
          ? round1(mySubjectAvg - cohortSubjectAvg)
          : null,
      sessionCount: subjectSessionIds.length,
    };
  });

  // Sort: strongest to weakest by my avg
  const sortedSubjectRows = [...subjectRows].sort((a, b) => {
    const aAvg = a.myAvg ?? -Infinity;
    const bAvg = b.myAvg ?? -Infinity;
    return bAvg - aAvg;
  });

  // Trend: last 5 sessions by date (oldest → newest)
  const recentSessions = [...mySessions].reverse().slice(
    Math.max(0, mySessions.length - 5),
  );

  // Overall KPIs
  const myAllScores = Array.from(myScoreMap.values());
  const myOverallAvg = avg(myAllScores);

  const cohortAllAvgs: number[] = [];
  for (const [, entry] of cohortSessionMap.entries()) {
    if (entry.count > 0) cohortAllAvgs.push(entry.sum / entry.count);
  }
  const cohortOverallAvg = avg(cohortAllAvgs);

  const overallDiff =
    myOverallAvg !== null && cohortOverallAvg !== null
      ? round1(myOverallAvg - cohortOverallAvg)
      : null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate">
          <Link href="/student/scores" className="transition hover:text-ember">
            성적 카드
          </Link>
          <span>/</span>
          <span className="font-medium text-ink">반 평균 비교</span>
        </nav>

        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
                Score Comparison
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                반 평균 비교
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
                최근 {mySessions.length}회차 성적과 같은 시험 유형 수강생 평균을
                비교합니다. 조회 기수: {period.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/scores/benchmark"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                동기 순위 분석
              </Link>
              <Link
                href="/student/scores/subject-focus"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                내 성적 분석
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">내 전체 평균</p>
              <p className="mt-3 text-2xl font-semibold">
                {myOverallAvg !== null ? `${round1(myOverallAvg)}점` : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">반 전체 평균</p>
              <p className="mt-3 text-2xl font-semibold">
                {cohortOverallAvg !== null
                  ? `${round1(cohortOverallAvg)}점`
                  : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">평균 대비 차이</p>
              <p
                className={`mt-3 text-2xl ${
                  overallDiff !== null
                    ? overallDiff > 0
                      ? "font-semibold text-[#1F4D3A]"
                      : overallDiff < 0
                        ? "font-semibold text-red-600"
                        : "font-semibold text-slate"
                    : "text-slate"
                }`}
              >
                {overallDiff !== null
                  ? `${overallDiff > 0 ? "+" : ""}${overallDiff}점`
                  : "-"}
              </p>
            </article>
          </div>
        </section>

        {/* Subject comparison table + bars */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold">
            과목별 비교{" "}
            <span className="text-sm font-normal text-slate">
              (최근 {mySessions.length}회차 평균)
            </span>
          </h2>

          {/* Mobile: bars */}
          <div className="space-y-5 sm:hidden">
            {sortedSubjectRows.map((row) => (
              <ComparisonBar
                key={row.subject}
                label={row.label}
                myScore={row.myAvg}
                avgScore={row.cohortAvg}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-[20px] border border-ink/10 sm:block">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">과목</th>
                  <th className="px-4 py-3 font-semibold text-slate">
                    내 점수
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate">
                    반 평균
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate">차이</th>
                  <th className="px-4 py-3 font-semibold text-slate">
                    비교 바
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {sortedSubjectRows.map((row) => (
                  <tr
                    key={row.subject}
                    className="transition-colors hover:bg-mist/30"
                  >
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                      {row.myAvg !== null ? `${round1(row.myAvg)}점` : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {row.cohortAvg !== null
                        ? `${round1(row.cohortAvg)}점`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.diff !== null ? (
                        <span className={diffColorClass(row.diff)}>
                          {row.diff > 0 ? "+" : ""}
                          {row.diff}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="space-y-1">
                        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-mist">
                          <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                              width: `${barWidth(row.myAvg)}%`,
                              backgroundColor: "#C55A11",
                            }}
                          />
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-mist">
                          <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                              width: `${barWidth(row.cohortAvg)}%`,
                              backgroundColor: "#9CA3AF",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-full bg-ember" />
              내 점수
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-full bg-slate/40" />
              반 평균
            </span>
          </div>
        </section>

        {/* Trend: last 5 sessions */}
        {recentSessions.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">
              최근 {recentSessions.length}회차 추이
            </h2>
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">회차</th>
                    <th className="px-4 py-3 font-semibold text-slate">
                      과목
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate">
                      내 점수
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate">
                      반 평균
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate">
                      차이
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {recentSessions.map((session, idx) => {
                    const myScore = myScoreMap.get(session.id) ?? null;
                    const cohortEntry = cohortSessionMap.get(session.id);
                    const cohortAvgForSession =
                      cohortEntry && cohortEntry.count > 0
                        ? cohortEntry.sum / cohortEntry.count
                        : null;
                    const diff =
                      myScore !== null && cohortAvgForSession !== null
                        ? round1(myScore - cohortAvgForSession)
                        : null;
                    const dateStr = `${session.examDate.getFullYear()}.${String(session.examDate.getMonth() + 1).padStart(2, "0")}.${String(session.examDate.getDate()).padStart(2, "0")}`;

                    return (
                      <tr
                        key={session.id}
                        className={`transition-colors hover:bg-mist/30 ${idx % 2 === 0 ? "" : "bg-mist/20"}`}
                      >
                        <td className="px-4 py-3 text-xs text-slate tabular-nums">
                          {dateStr}
                          <span className="ml-1">({session.week}주)</span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {SUBJECT_LABEL[session.subject] ?? session.subject}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                          {myScore !== null ? `${myScore}점` : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">
                          {cohortAvgForSession !== null
                            ? `${round1(cohortAvgForSession)}점`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {diff !== null ? (
                            <span className={diffColorClass(diff)}>
                              {diff > 0 ? "+" : ""}
                              {diff}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Bottom nav */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <p className="mb-3 text-sm font-semibold text-ink">더 보기</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student/scores/subject-focus"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-medium transition hover:border-ember/30 hover:text-[#C55A11]"
            >
              내 성적 분석
            </Link>
            <Link
              href="/student/scores/benchmark"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-medium transition hover:border-ember/30 hover:text-[#C55A11]"
            >
              동기 대비 순위
            </Link>
            <Link
              href="/student/scores/timeline"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-medium transition hover:border-ember/30 hover:text-[#C55A11]"
            >
              성적 타임라인
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
