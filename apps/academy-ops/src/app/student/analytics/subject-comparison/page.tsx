import Link from "next/link";
import { type Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type SubjectStats = {
  subject: Subject;
  displayName: string;
  myAvg: number;
  myMin: number;
  myMax: number;
  classAvg: number | null;
  count: number;
  trend: "up" | "down" | "flat";
};

function trendIcon(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "—";
}

function trendColorClass(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "text-forest";
  if (trend === "down") return "text-red-600";
  return "text-slate";
}

function diffColorClass(diff: number): string {
  if (diff > 5) return "text-forest font-semibold";
  if (diff < -5) return "text-red-600 font-semibold";
  return "text-slate";
}

function scoreColorClass(score: number): string {
  if (score < 60) return "text-red-600 font-semibold";
  if (score < 80) return "text-amber-600 font-semibold";
  return "text-forest font-semibold";
}

export default async function SubjectComparisonPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Analytics Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학습 분석은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <div className="mt-8">
              <Link
                href="/student/analytics"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학습 분석으로 돌아가기
              </Link>
            </div>
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
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Analytics Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate">
              학생 포털에 로그인하면 과목별 성적 비교 분석을 확인할 수 있습니다.
            </p>
          </section>
          <StudentLookupForm redirectPath="/student/analytics/subject-comparison" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // Fetch all scores for this student
  const myScores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
    },
    include: {
      session: {
        select: {
          id: true,
          examDate: true,
          subject: true,
          displaySubjectName: true,
          periodId: true,
          examType: true,
        },
      },
    },
    orderBy: { session: { examDate: "asc" } },
  });

  // Group my scores by subject
  type ScoreEntry = { score: number; date: Date };
  const mySubjectMap = new Map<
    Subject,
    { scores: ScoreEntry[]; displayName: string; sessionIds: number[] }
  >();

  for (const row of myScores) {
    const subject = row.session.subject;
    const existing = mySubjectMap.get(subject);
    const entry: ScoreEntry = {
      score: row.finalScore as number,
      date: row.session.examDate,
    };
    if (existing) {
      existing.scores.push(entry);
      existing.sessionIds.push(row.session.id);
    } else {
      mySubjectMap.set(subject, {
        scores: [entry],
        displayName:
          row.session.displaySubjectName ?? SUBJECT_LABEL[subject],
        sessionIds: [row.session.id],
      });
    }
  }

  // Collect all session IDs to fetch class averages
  const allSessionIds = Array.from(mySubjectMap.values()).flatMap(
    (v) => v.sessionIds,
  );

  // Fetch class averages: group by sessionId then aggregate
  const classScores = allSessionIds.length > 0
    ? await prisma.score.groupBy({
        by: ["sessionId"],
        where: {
          sessionId: { in: allSessionIds },
          finalScore: { not: null },
        },
        _avg: { finalScore: true },
        _count: { finalScore: true },
      })
    : [];

  // Build a map: sessionId -> classAvg
  const sessionClassAvgMap = new Map<number, number>();
  for (const row of classScores) {
    if (row._avg.finalScore !== null) {
      sessionClassAvgMap.set(row.sessionId, row._avg.finalScore);
    }
  }

  // Compute per-subject stats
  const subjectStats: SubjectStats[] = [];

  for (const [subject, data] of mySubjectMap.entries()) {
    const scores = data.scores.map((s) => s.score);
    const myAvg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const myMin = Math.min(...scores);
    const myMax = Math.max(...scores);

    // Compute class average across all sessions for this subject
    let classTotal = 0;
    let classCount = 0;
    for (const sid of data.sessionIds) {
      const avg = sessionClassAvgMap.get(sid);
      if (avg !== undefined) {
        classTotal += avg;
        classCount += 1;
      }
    }
    const classAvg = classCount > 0 ? classTotal / classCount : null;

    // Trend: compare last 3 vs first 3 (or all if fewer)
    let trend: "up" | "down" | "flat" = "flat";
    if (scores.length >= 3) {
      const half = Math.floor(scores.length / 2);
      const firstHalf = scores.slice(0, half);
      const secondHalf = scores.slice(-half);
      const firstAvg =
        firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondAvg - firstAvg > 2) trend = "up";
      else if (firstAvg - secondAvg > 2) trend = "down";
    } else if (scores.length === 2) {
      if (scores[1]! - scores[0]! > 2) trend = "up";
      else if (scores[0]! - scores[1]! > 2) trend = "down";
    }

    subjectStats.push({
      subject,
      displayName: data.displayName,
      myAvg,
      myMin,
      myMax,
      classAvg,
      count: scores.length,
      trend,
    });
  }

  // Sort by subject name
  subjectStats.sort((a, b) => a.subject.localeCompare(b.subject));

  // Find strongest and weakest subjects
  const strongestSubject =
    subjectStats.length > 0
      ? subjectStats.reduce((best, s) =>
          s.myAvg > best.myAvg ? s : best,
        )
      : null;
  const weakestSubject =
    subjectStats.length > 0
      ? subjectStats.reduce((worst, s) =>
          s.myAvg < worst.myAvg ? s : worst,
        )
      : null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Subject Comparison
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
                {viewer.name}의 과목별 성적 비교
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate">
                전체 응시 성적 기준으로 과목별 강점과 취약점을 분석합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/student/analytics"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학습 분석으로 돌아가기
              </Link>
            </div>
          </div>

          {/* Strength / Weakness highlight cards */}
          {subjectStats.length > 0 && strongestSubject && weakestSubject ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <article className="rounded-[24px] border border-forest/30 bg-forest/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-forest">
                  강점 과목
                </p>
                <p className="mt-2 text-xl font-bold text-forest">
                  {strongestSubject.displayName}
                </p>
                <p className="mt-1 text-2xl font-bold text-forest">
                  {strongestSubject.myAvg.toFixed(1)}점 평균
                </p>
                <p className="mt-2 text-xs text-forest/70">
                  {strongestSubject.count}회 응시 기준
                </p>
              </article>
              <article className="rounded-[24px] border border-ember/30 bg-ember/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ember">
                  취약 과목
                </p>
                <p className="mt-2 text-xl font-bold text-ember">
                  {weakestSubject.displayName}
                </p>
                <p className="mt-1 text-2xl font-bold text-ember">
                  {weakestSubject.myAvg.toFixed(1)}점 평균
                </p>
                <p className="mt-2 text-xs text-ember/70">
                  {weakestSubject.count}회 응시 기준
                </p>
              </article>
            </div>
          ) : null}

          {/* Recommendation message */}
          {weakestSubject && (
            <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              <span className="font-semibold">{weakestSubject.displayName}</span> 과목을 집중
              학습하세요. 현재 평균{" "}
              <span className="font-semibold">{weakestSubject.myAvg.toFixed(1)}점</span>으로 가장
              낮습니다.
              {weakestSubject.classAvg !== null && (
                <>
                  {" "}학급 평균(
                  {weakestSubject.classAvg.toFixed(1)}점)과{" "}
                  <span className="font-semibold">
                    {Math.abs(weakestSubject.myAvg - weakestSubject.classAvg).toFixed(1)}점
                  </span>{" "}
                  {weakestSubject.myAvg < weakestSubject.classAvg ? "뒤처져" : "앞서"} 있습니다.
                </>
              )}
            </div>
          )}
        </section>

        {/* Subject comparison table */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">과목별 상세 비교</h2>
          <p className="mb-4 text-xs text-slate">
            전체 응시 성적 기준 · 학급 평균은 동일 시험 응시자 기준
          </p>

          {subjectStats.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              집계할 성적이 없습니다. 성적이 입력된 후 다시 확인하세요.
            </div>
          ) : (
            <div className="space-y-6">
              {subjectStats.map((stat) => {
                const diff =
                  stat.classAvg !== null ? stat.myAvg - stat.classAvg : null;
                const progressPct = Math.min(100, Math.max(0, stat.myAvg));
                const classProgressPct =
                  stat.classAvg !== null
                    ? Math.min(100, Math.max(0, stat.classAvg))
                    : null;

                return (
                  <div
                    key={stat.subject}
                    className="rounded-[20px] border border-ink/10 p-4"
                  >
                    {/* Subject name row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {stat.displayName}
                        </span>
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs text-slate">
                          {stat.count}회 응시
                        </span>
                        <span
                          className={`text-sm font-semibold ${trendColorClass(stat.trend)}`}
                          title={
                            stat.trend === "up"
                              ? "상승 추세"
                              : stat.trend === "down"
                                ? "하락 추세"
                                : "보합"
                          }
                        >
                          {trendIcon(stat.trend)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className={scoreColorClass(stat.myAvg)}>
                          내 평균 {stat.myAvg.toFixed(1)}점
                        </span>
                        {stat.classAvg !== null && (
                          <span className="text-slate">
                            학급 평균 {stat.classAvg.toFixed(1)}점
                          </span>
                        )}
                        {diff !== null && (
                          <span className={diffColorClass(diff)}>
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="mt-3 space-y-2">
                      {/* My score bar */}
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-right text-xs text-slate">
                          내 점수
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-mist">
                          <div
                            className={`h-full rounded-full transition-all ${
                              stat.myAvg >= 80
                                ? "bg-forest"
                                : stat.myAvg >= 60
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-xs font-semibold text-ink">
                          {stat.myAvg.toFixed(0)}
                        </span>
                      </div>

                      {/* Class average bar */}
                      {classProgressPct !== null && (
                        <div className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-right text-xs text-slate">
                            학급 평균
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-mist">
                            <div
                              className="h-full rounded-full bg-ink/30 transition-all"
                              style={{ width: `${classProgressPct}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-xs text-slate">
                            {stat.classAvg!.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Min / Max row */}
                    <div className="mt-2 flex gap-4 text-xs text-slate">
                      <span>
                        최저{" "}
                        <span className="font-medium text-red-600">
                          {stat.myMin.toFixed(0)}점
                        </span>
                      </span>
                      <span>
                        최고{" "}
                        <span className="font-medium text-forest">
                          {stat.myMax.toFixed(0)}점
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Summary table */}
        {subjectStats.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold">과목별 요약표</h2>
            <p className="mb-4 text-xs text-slate">
              전체 응시 성적 기준 (미응시 제외)
            </p>
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate whitespace-nowrap">
                      과목명
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      내 평균
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      학급 평균
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      차이
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      최고 점수
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      최저 점수
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate whitespace-nowrap">
                      응시 횟수
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate whitespace-nowrap">
                      경향
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {subjectStats.map((stat) => {
                    const diff =
                      stat.classAvg !== null
                        ? stat.myAvg - stat.classAvg
                        : null;
                    const isStrongest =
                      strongestSubject?.subject === stat.subject;
                    const isWeakest =
                      weakestSubject?.subject === stat.subject &&
                      subjectStats.length > 1;
                    return (
                      <tr
                        key={stat.subject}
                        className={
                          isStrongest
                            ? "bg-forest/5"
                            : isWeakest
                              ? "bg-ember/5"
                              : ""
                        }
                      >
                        <td className="px-4 py-3 font-medium">
                          {stat.displayName}
                          {isStrongest && (
                            <span className="ml-2 inline-flex rounded-full border border-forest/30 bg-forest/10 px-1.5 py-0.5 text-xs font-medium text-forest">
                              강점
                            </span>
                          )}
                          {isWeakest && (
                            <span className="ml-2 inline-flex rounded-full border border-ember/30 bg-ember/10 px-1.5 py-0.5 text-xs font-medium text-ember">
                              취약
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${scoreColorClass(stat.myAvg)}`}
                        >
                          {stat.myAvg.toFixed(1)}점
                        </td>
                        <td className="px-4 py-3 text-right text-slate">
                          {stat.classAvg !== null
                            ? `${stat.classAvg.toFixed(1)}점`
                            : "-"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${diff !== null ? diffColorClass(diff) : "text-slate"}`}
                        >
                          {diff !== null
                            ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-forest font-medium">
                          {stat.myMax.toFixed(0)}점
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">
                          {stat.myMin.toFixed(0)}점
                        </td>
                        <td className="px-4 py-3 text-right text-slate">
                          {stat.count}회
                        </td>
                        <td
                          className={`px-4 py-3 text-center font-semibold ${trendColorClass(stat.trend)}`}
                        >
                          {trendIcon(stat.trend)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate">
              경향:{" "}
              <span className="font-medium text-forest">▲ 상승</span>
              {" · "}
              <span className="font-medium text-red-600">▼ 하락</span>
              {" · "}
              <span className="font-medium text-slate">— 보합</span>
            </p>
          </section>
        )}

      </div>
    </main>
  );
}
