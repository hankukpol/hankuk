import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CompletionClient } from "./completion-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function CohortCompletionPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const categoryParam = sp(searchParams?.category) ?? "";
  const yearParam = sp(searchParams?.year) ?? "";

  const now = new Date();

  // Fetch completed cohorts (isActive=false and endDate < now)
  const endDateFilter = yearParam
    ? {
        gte: new Date(`${yearParam}-01-01T00:00:00`),
        lt: new Date(`${parseInt(yearParam) + 1}-01-01T00:00:00`),
      }
    : { lt: now };

  const completedCohorts = await prisma.cohort.findMany({
    where: {
      isActive: false,
      endDate: endDateFilter,
      ...(categoryParam ? { examCategory: categoryParam as "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM" } : {}),
    },
    orderBy: { endDate: "desc" },
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      enrollments: {
        select: { id: true, status: true },
      },
    },
  });

  // Available years from completed cohorts (before filtering)
  const allCohorts = await prisma.cohort.findMany({
    where: { isActive: false, endDate: { lt: now } },
    select: { endDate: true },
  });
  const availableYears = Array.from(
    new Set(allCohorts.map((c) => new Date(c.endDate).getFullYear()))
  ).sort((a, b) => b - a);

  // For score data: get the last 4 sessions before each cohort's endDate
  // We'll batch-fetch sessions and scores for each cohort
  const cohortIds = completedCohorts.map((c) => c.id);

  // Fetch all exam sessions (we need them to compute final period scores)
  // We don't have a direct cohortId on exam sessions, so we use the date range of each cohort
  // and look at the period enrollments for students in each cohort

  // Compute enrollment stats per cohort
  const cohortStats = await Promise.all(
    completedCohorts.map(async (cohort) => {
      const total = cohort.enrollments.length;
      const activeAtEnd = cohort.enrollments.filter((e) => e.status === "ACTIVE").length;
      const completed = cohort.enrollments.filter((e) => e.status === "COMPLETED").length;
      const cancelled = cohort.enrollments.filter(
        (e) => e.status === "CANCELLED" || e.status === "WITHDRAWN"
      ).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Find students in this cohort (get their examNumbers from enrollments)
      const enrollmentIds = cohort.enrollments.map((e) => e.id);
      const studentExamNumbers =
        enrollmentIds.length > 0
          ? (
              await prisma.courseEnrollment.findMany({
                where: { id: { in: enrollmentIds } },
                select: { examNumber: true },
              })
            ).map((e) => e.examNumber)
          : [];

      // Get the last 4 exam sessions before cohort.endDate
      const last4Sessions = await prisma.examSession.findMany({
        where: {
          examDate: {
            gte: new Date(cohort.endDate.getTime() - 28 * 24 * 60 * 60 * 1000), // last ~4 weeks
            lte: cohort.endDate,
          },
          isCancelled: false,
        },
        orderBy: { examDate: "desc" },
        take: 4,
        select: { id: true },
      });

      const last4SessionIds = last4Sessions.map((s) => s.id);

      // Get scores for these students in the last 4 sessions
      const finalScores =
        last4SessionIds.length > 0 && studentExamNumbers.length > 0
          ? await prisma.score.findMany({
              where: {
                sessionId: { in: last4SessionIds },
                examNumber: { in: studentExamNumbers },
                attendType: { not: AttendType.ABSENT },
                finalScore: { not: null },
              },
              select: { finalScore: true },
            })
          : [];

      const finalAvgScore =
        finalScores.length > 0
          ? Math.round(
              (finalScores.reduce((s, r) => s + (r.finalScore as number), 0) /
                finalScores.length) *
                10
            ) / 10
          : null;

      return {
        id: cohort.id,
        name: cohort.name,
        examCategory: cohort.examCategory as string,
        startDate: cohort.startDate.toISOString(),
        endDate: cohort.endDate.toISOString(),
        totalEnrolled: total,
        activeAtEnd,
        completed,
        cancelled,
        finalAvgScore,
        overallAvgDelta: null as number | null, // computed below
        completionRate,
      };
    })
  );

  // Compute overall avg score across all cohorts for delta comparison
  const allFinalScores = cohortStats.filter((c) => c.finalAvgScore !== null);
  const overallAvgScore =
    allFinalScores.length > 0
      ? Math.round(
          (allFinalScores.reduce((s, c) => s + (c.finalAvgScore as number), 0) /
            allFinalScores.length) *
            10
        ) / 10
      : null;

  // Compute delta for each cohort
  const cohortStatsWithDelta = cohortStats.map((c) => ({
    ...c,
    overallAvgDelta:
      c.finalAvgScore !== null && overallAvgScore !== null
        ? Math.round((c.finalAvgScore - overallAvgScore) * 10) / 10
        : null,
  }));

  // KPI computations
  const completedCount = cohortStats.length;

  const avgCompletionRate =
    completedCount > 0
      ? Math.round(
          (cohortStats.reduce((s, c) => s + c.completionRate, 0) / completedCount) * 10
        ) / 10
      : null;

  const avgFinalScore =
    allFinalScores.length > 0
      ? Math.round(
          (allFinalScores.reduce((s, c) => s + (c.finalAvgScore as number), 0) /
            allFinalScores.length) *
            10
        ) / 10
      : null;

  // Best cohort by completion rate
  const bestCohort =
    cohortStats.length > 0
      ? cohortStats.reduce((best, c) => (c.completionRate > best.completionRate ? c : best))
      : null;
  const bestCohortName = bestCohort?.name ?? null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        보고서
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">기수 수료 분석</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            완료된 기수별 수료율, 최종 성적, 탈락 현황을 분석합니다.
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          ← 보고서 목록
        </Link>
      </div>

      <div className="mt-8">
        <CompletionClient
          cohorts={cohortStatsWithDelta}
          completedCount={completedCount}
          avgCompletionRate={avgCompletionRate}
          avgFinalScore={avgFinalScore}
          bestCohortName={bestCohortName}
          overallAvgScore={overallAvgScore}
          availableYears={availableYears}
          initialYear={yearParam}
          initialCategory={categoryParam}
        />
      </div>
    </div>
  );
}
