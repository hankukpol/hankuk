import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resolveScore(finalScore: number | null, rawScore: number | null): number | null {
  if (finalScore !== null) return finalScore;
  if (rawScore !== null) return rawScore;
  return null;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medalEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function CohortLeaderboardPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  await requireAdminContext(AdminRole.TEACHER);
  const { cohortId } = await params;

  const prisma = getPrisma();

  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

  if (!cohort) notFound();

  // Enrolled students
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      cohortId,
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
    },
    select: { examNumber: true },
  });

  const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

  // ─── KPI & leaderboard data ──────────────────────────────────────────────
  type LeaderboardRow = {
    rank: number;
    examNumber: string;
    name: string;
    avgScore: number | null;
    sessionsAttended: number;
    totalSessions: number;
    attendanceRate: number | null;
    earlyAvg: number | null;
    lateAvg: number | null;
    improvement: number | null;
  };

  let rows: LeaderboardRow[] = [];
  let kpiTopScore: number | null = null;
  let kpiAvg: number | null = null;
  let kpiMedian: number | null = null;

  if (examNumbers.length > 0) {
    // Fetch student names
    const students = await prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true, name: true },
    });
    const nameMap = new Map(students.map((s) => [s.examNumber, s.name]));

    // All non-cumulative scores for these students
    const allScores = await prisma.score.findMany({
      where: {
        examNumber: { in: examNumbers },
        session: { subject: { not: Subject.CUMULATIVE } },
      },
      select: {
        examNumber: true,
        finalScore: true,
        rawScore: true,
        attendType: true,
        sessionId: true,
      },
      orderBy: { sessionId: "asc" },
    });

    const presentTypes = [AttendType.NORMAL, AttendType.LIVE] as AttendType[];
    const absentTypes = [AttendType.ABSENT, AttendType.EXCUSED] as AttendType[];

    // Group by student
    const byStudent = new Map<
      string,
      { sessionId: number; score: number | null; attendType: AttendType }[]
    >();

    for (const s of allScores) {
      const arr = byStudent.get(s.examNumber) ?? [];
      arr.push({
        sessionId: s.sessionId,
        score: resolveScore(s.finalScore, s.rawScore),
        attendType: s.attendType,
      });
      byStudent.set(s.examNumber, arr);
    }

    // Compute per-student stats
    const studentAvgs: number[] = [];

    for (const examNumber of examNumbers) {
      const studentScores = byStudent.get(examNumber) ?? [];

      // Deduplicate by sessionId
      const seen = new Set<number>();
      const deduped = studentScores.filter((s) => {
        if (seen.has(s.sessionId)) return false;
        seen.add(s.sessionId);
        return true;
      });

      const totalSessions = deduped.length;
      const presentCount = deduped.filter((s) =>
        presentTypes.includes(s.attendType),
      ).length;
      const absentCount = deduped.filter((s) =>
        absentTypes.includes(s.attendType),
      ).length;
      void absentCount; // used for attendance rate

      const attendanceRate =
        totalSessions > 0
          ? Math.round((presentCount / totalSessions) * 1000) / 10
          : null;

      // Valid scored sessions
      const withScore = deduped.filter(
        (s) =>
          presentTypes.includes(s.attendType) &&
          s.score !== null &&
          s.score !== undefined,
      );

      const validScores = withScore.map((s) => s.score as number);
      const overallAvg = round1(avg(validScores));

      // Improvement: first 3 vs last 3 sessions avg
      const firstThree = withScore.slice(0, 3).map((s) => s.score as number);
      const lastThree = withScore.slice(-3).map((s) => s.score as number);

      const earlyAvg = round1(avg(firstThree));
      const lateAvg = round1(avg(lastThree));

      let improvement: number | null = null;
      if (
        earlyAvg !== null &&
        lateAvg !== null &&
        withScore.length >= 4 // Only meaningful if there are enough sessions to distinguish
      ) {
        improvement = round1(lateAvg - earlyAvg);
      }

      rows.push({
        rank: 0,
        examNumber,
        name: nameMap.get(examNumber) ?? "-",
        avgScore: overallAvg,
        sessionsAttended: presentCount,
        totalSessions,
        attendanceRate,
        earlyAvg,
        lateAvg,
        improvement,
      });

      if (overallAvg !== null) studentAvgs.push(overallAvg);
    }

    // Sort by avgScore desc (nulls last), then attendance rate desc
    rows.sort((a, b) => {
      const av = a.avgScore ?? -Infinity;
      const bv = b.avgScore ?? -Infinity;
      if (bv !== av) return bv - av;
      return (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0);
    });

    // Assign ranks
    rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));

    // KPI
    kpiTopScore = studentAvgs.length > 0 ? round1(Math.max(...studentAvgs)) : null;
    kpiAvg = round1(avg(studentAvgs));
    const sorted = [...studentAvgs].sort((a, b) => a - b);
    kpiMedian = round1(median(sorted));
  }

  return (
    <div className="p-8 sm:p-10 print:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:block">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest print:hidden">
            성적 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink print:mt-0 print:text-2xl">
            기수 성적 리더보드
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                cohort.examCategory === "GONGCHAE"
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ember/30 bg-ember/10 text-ember"
              }`}
            >
              {EXAM_CATEGORY_LABEL[cohort.examCategory] ?? cohort.examCategory}
            </span>
            <span className="text-base font-semibold text-ink">{cohort.name}</span>
            <span className="text-sm text-slate">
              {cohort.startDate.toLocaleDateString("ko-KR")} ~{" "}
              {cohort.endDate.toLocaleDateString("ko-KR")}
            </span>
            {cohort.isActive && (
              <span className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                진행 중
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            인쇄
          </button>
          <Link
            href={`/admin/results/cohort?cohortId=${cohortId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            기수별 통계로
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        {/* 학생 수 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel print:rounded-xl print:shadow-none">
          <p className="text-sm text-slate">수강 학생 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {examNumbers.length.toLocaleString("ko-KR")}
            <span className="ml-1.5 text-base font-normal text-slate">명</span>
          </p>
        </div>

        {/* 최고점 */}
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel print:rounded-xl print:shadow-none">
          <p className="text-sm text-ember/80">최고 평균점</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {kpiTopScore !== null ? kpiTopScore.toFixed(1) : "-"}
            <span className="ml-1 text-base font-normal text-ember/70">점</span>
          </p>
        </div>

        {/* 기수 평균 */}
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel print:rounded-xl print:shadow-none">
          <p className="text-sm text-forest/80">기수 평균점</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {kpiAvg !== null ? kpiAvg.toFixed(1) : "-"}
            <span className="ml-1 text-base font-normal text-forest/70">점</span>
          </p>
        </div>

        {/* 중간값 */}
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6 shadow-panel print:rounded-xl print:shadow-none">
          <p className="text-sm text-sky-700">중간값 (Median)</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {kpiMedian !== null ? kpiMedian.toFixed(1) : "-"}
            <span className="ml-1 text-base font-normal text-sky-600">점</span>
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      {examNumbers.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-slate">
          이 기수에 등록된 수강생이 없습니다.
        </div>
      ) : (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel print:rounded-xl print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">순위</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">학생명</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">학번</th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    평균 점수
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    출석 회차
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    출석률
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    향상도
                    <span className="ml-1 text-[10px] font-normal text-slate/60">(초반3회→최근3회)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isEven = idx % 2 === 0;
                  const medal = medalEmoji(row.rank);
                  const isTop3 = row.rank <= 3;

                  let improvementBadge: React.ReactNode = (
                    <span className="text-xs text-slate">-</span>
                  );
                  if (row.improvement !== null) {
                    const isPositive = row.improvement > 0;
                    const isNeutral = row.improvement === 0;
                    improvementBadge = (
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          isNeutral
                            ? "border-ink/10 bg-ink/5 text-slate"
                            : isPositive
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-red-200 bg-red-50 text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {row.improvement.toFixed(1)}점
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={row.examNumber}
                      className={`border-b border-ink/5 transition hover:bg-mist/60 ${
                        isTop3
                          ? "bg-amber-50/60"
                          : isEven
                            ? ""
                            : "bg-gray-50/40"
                      }`}
                    >
                      {/* 순위 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          {medal ? (
                            <span className="text-xl" aria-label={`${row.rank}위`}>
                              {medal}
                            </span>
                          ) : (
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 bg-ink/5 text-xs font-semibold text-slate">
                              {row.rank}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 학생명 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className={`font-semibold underline-offset-2 hover:underline ${
                            isTop3 ? "text-ember" : "text-ink"
                          }`}
                        >
                          {row.name}
                        </Link>
                      </td>

                      {/* 학번 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-mono text-xs text-slate underline-offset-2 hover:text-ink hover:underline"
                        >
                          {row.examNumber}
                        </Link>
                      </td>

                      {/* 평균 점수 */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-middle">
                        {row.avgScore !== null ? (
                          <span
                            className={`text-base font-bold ${
                              isTop3 ? "text-ember" : "text-ink"
                            }`}
                          >
                            {row.avgScore.toFixed(1)}
                            <span className="ml-0.5 text-xs font-normal text-slate">점</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>

                      {/* 출석 회차 */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-middle">
                        <span className="text-sm text-ink">
                          {row.sessionsAttended}
                          <span className="text-xs text-slate">/{row.totalSessions}</span>
                        </span>
                      </td>

                      {/* 출석률 */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-middle">
                        {row.attendanceRate !== null ? (
                          <span
                            className={`text-sm font-semibold ${
                              row.attendanceRate >= 80
                                ? "text-forest"
                                : row.attendanceRate >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}
                          >
                            {row.attendanceRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>

                      {/* 향상도 */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-middle">
                        <div className="flex flex-col items-end gap-0.5">
                          {improvementBadge}
                          {row.earlyAvg !== null && row.lateAvg !== null && (
                            <span className="text-[10px] text-slate/60">
                              {row.earlyAvg.toFixed(1)} → {row.lateAvg.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="border-t border-ink/10 px-6 py-4">
            <p className="text-xs text-slate">
              · 평균 점수는 출석(NORMAL·LIVE) 회차의 점수만 포함합니다. &nbsp;
              · 향상도는 출석 회차 4회 이상인 경우에만 표시됩니다. &nbsp;
              · 기수 내 수강 상태가 활성(ACTIVE)·완료(COMPLETED)·휴원(SUSPENDED)인 학생이 집계됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
