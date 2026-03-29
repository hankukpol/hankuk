import { AttendType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type CohortStudentStat = {
  examNumber: string;
  name: string;
  enrollmentStatus: string;
  avgScore: number | null;
  sessionCount: number;
  attendedCount: number;
  attendanceRate: number;
};

export type CohortAnalyticsData = {
  cohortId: string;
  cohortName: string;
  totalEnrolled: number;
  activeCount: number;
  avgScore: number | null;
  passRate: number; // % scoring >= 80
  attendanceRate: number;
  scoreDistribution: Array<{ range: string; count: number }>;
  students: CohortStudentStat[];
};

function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundTo(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function getScoreRange(score: number): string {
  if (score < 40) return "0~39";
  if (score < 60) return "40~59";
  if (score < 70) return "60~69";
  if (score < 80) return "70~79";
  if (score < 90) return "80~89";
  return "90~100";
}

const SCORE_RANGES = ["0~39", "40~59", "60~69", "70~79", "80~89", "90~100"] as const;

export async function getCohortAnalytics(cohortId: string): Promise<CohortAnalyticsData> {
  const prisma = getPrisma();

  // Fetch cohort and its enrollments
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    include: {
      enrollments: {
        where: {
          status: { in: ["ACTIVE", "COMPLETED", "PENDING", "SUSPENDED"] },
        },
        select: {
          examNumber: true,
          status: true,
          student: { select: { name: true } },
        },
      },
    },
  });

  if (!cohort) {
    return {
      cohortId,
      cohortName: "",
      totalEnrolled: 0,
      activeCount: 0,
      avgScore: null,
      passRate: 0,
      attendanceRate: 0,
      scoreDistribution: SCORE_RANGES.map((range) => ({ range, count: 0 })),
      students: [],
    };
  }

  const enrollments = cohort.enrollments;
  const totalEnrolled = enrollments.length;
  const activeCount = enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "PENDING",
  ).length;

  if (totalEnrolled === 0) {
    return {
      cohortId,
      cohortName: cohort.name,
      totalEnrolled: 0,
      activeCount: 0,
      avgScore: null,
      passRate: 0,
      attendanceRate: 0,
      scoreDistribution: SCORE_RANGES.map((range) => ({ range, count: 0 })),
      students: [],
    };
  }

  const examNumbers = enrollments.map((e) => e.examNumber);

  // Fetch all scores for these students within the cohort's date range
  // ExamSession.examDate must be within cohort startDate..endDate
  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: examNumbers },
      session: {
        examDate: {
          gte: cohort.startDate,
          lte: cohort.endDate,
        },
        isCancelled: false,
      },
    },
    select: {
      examNumber: true,
      finalScore: true,
      rawScore: true,
      attendType: true,
      sessionId: true,
    },
  });

  // Group scores by student
  const scoresByStudent = new Map<string, typeof scores>();
  for (const score of scores) {
    const existing = scoresByStudent.get(score.examNumber) ?? [];
    existing.push(score);
    scoresByStudent.set(score.examNumber, existing);
  }

  // Count distinct sessions that occurred in range (for attendance denominator)
  const allSessionIds = new Set(scores.map((s) => s.sessionId));
  const totalSessionCount = allSessionIds.size;

  // Build per-student stats
  const studentStats: CohortStudentStat[] = enrollments.map((enrollment) => {
    const studentScores = scoresByStudent.get(enrollment.examNumber) ?? [];
    const attendedScores = studentScores.filter(
      (s) => s.attendType !== AttendType.ABSENT,
    );
    const scoredValues = attendedScores
      .map((s) => s.finalScore ?? s.rawScore)
      .filter((v): v is number => v !== null);

    const sessionCount = totalSessionCount;
    const attendedCount = attendedScores.length;
    const attendanceRate =
      sessionCount === 0 ? 0 : roundTo((attendedCount / sessionCount) * 100);

    return {
      examNumber: enrollment.examNumber,
      name: enrollment.student?.name ?? "-",
      enrollmentStatus: enrollment.status,
      avgScore: average(scoredValues),
      sessionCount,
      attendedCount,
      attendanceRate,
    };
  });

  // Overall average score
  const allScoreValues = studentStats
    .map((s) => s.avgScore)
    .filter((v): v is number => v !== null);
  const overallAvg = average(allScoreValues);

  // Pass rate: students with avgScore >= 80
  const passCount = studentStats.filter(
    (s) => s.avgScore !== null && s.avgScore >= 80,
  ).length;
  const passRate =
    totalEnrolled === 0 ? 0 : roundTo((passCount / totalEnrolled) * 100);

  // Overall attendance rate
  const totalAttended = studentStats.reduce((sum, s) => sum + s.attendedCount, 0);
  const totalPossible = totalSessionCount * totalEnrolled;
  const overallAttendanceRate =
    totalPossible === 0 ? 0 : roundTo((totalAttended / totalPossible) * 100);

  // Score distribution histogram (based on per-student average scores)
  const distributionMap: Record<string, number> = Object.fromEntries(
    SCORE_RANGES.map((r) => [r, 0]),
  );
  for (const stat of studentStats) {
    if (stat.avgScore !== null) {
      const range = getScoreRange(stat.avgScore);
      distributionMap[range] = (distributionMap[range] ?? 0) + 1;
    }
  }
  const scoreDistribution = SCORE_RANGES.map((range) => ({
    range,
    count: distributionMap[range] ?? 0,
  }));

  return {
    cohortId,
    cohortName: cohort.name,
    totalEnrolled,
    activeCount,
    avgScore: overallAvg,
    passRate,
    attendanceRate: overallAttendanceRate,
    scoreDistribution,
    students: studentStats.sort((a, b) => {
      // Sort: scored students first (desc by avg), then unscored
      if (a.avgScore !== null && b.avgScore !== null) return b.avgScore - a.avgScore;
      if (a.avgScore !== null) return -1;
      if (b.avgScore !== null) return 1;
      return a.name.localeCompare(b.name, "ko-KR");
    }),
  };
}
