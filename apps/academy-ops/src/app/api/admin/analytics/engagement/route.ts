import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Engagement Score Formula (0-100):
 * - Attendance rate (40%): attended / total sessions
 * - Score trend (30%): +15 improving, 0 flat, -15 declining
 * - Points activity (15%): +15 if any points earned this month
 * - Counseling engagement (15%): +15 if had counseling this month
 */

function computeTrend(
  historicalAvgs: number[],
): "improving" | "declining" | "stable" {
  if (historicalAvgs.length < 2) return "stable";
  const n = historicalAvgs.length;
  const points = historicalAvgs.map((y, i) => ({ x: i + 1, y }));
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return "stable";
  const slope = (n * sumXY - sumX * sumY) / denom;
  if (slope > 1) return "improving";
  if (slope < -1) return "declining";
  return "stable";
}

export type EngagementStudentData = {
  examNumber: string;
  name: string;
  attendanceRate: number;
  trend: "improving" | "declining" | "stable";
  hasPointsThisMonth: boolean;
  hasCounselingThisMonth: boolean;
  engagementScore: number;
  tier: "A" | "B" | "C" | "D";
};

function getTier(score: number): "A" | "B" | "C" | "D" {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * GET /api/admin/analytics/engagement
 *
 * Query params:
 * - examType: "GONGCHAE" | "GYEONGCHAE" | "ALL" (default "ALL")
 * - weeks: number of weeks to look back (default 8)
 */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const examTypeParam = url.searchParams.get("examType") ?? "ALL";
  const weeksBack = Math.min(
    parseInt(url.searchParams.get("weeks") ?? "8", 10) || 8,
    24,
  );

  const prisma = getPrisma();

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  // Start of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  // 1. Fetch exam sessions
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: { gte: startDate, lte: now },
      ...examTypeFilter,
    },
    select: { id: true, examDate: true },
    orderBy: { examDate: "asc" },
  });

  if (sessions.length === 0) {
    return Response.json({ data: [] });
  }

  const sessionIds = sessions.map((s) => s.id);

  // Date index for trend analysis
  const uniqueDates = Array.from(
    new Set(sessions.map((s) => s.examDate.toISOString().split("T")[0])),
  ).sort();
  const dateIndexMap = new Map<string, number>();
  uniqueDates.forEach((d, i) => dateIndexMap.set(d, i + 1));

  const sessionDateMap = new Map<number, string>();
  for (const s of sessions) {
    sessionDateMap.set(s.id, s.examDate.toISOString().split("T")[0]);
  }

  // 2. Fetch all scores
  const scores = await prisma.score.findMany({
    where: {
      sessionId: { in: sessionIds },
    },
    select: {
      examNumber: true,
      sessionId: true,
      finalScore: true,
      attendType: true,
    },
  });

  // Per student: track attendance per session, scores per date
  // Map: examNumber → { attendedSessions, totalSessions, dateAvgs }
  const studentScoreMap = new Map<
    string,
    {
      attended: number;
      total: number;
      dateAvgMap: Map<string, { sum: number; count: number }>;
    }
  >();

  for (const score of scores) {
    if (!studentScoreMap.has(score.examNumber)) {
      studentScoreMap.set(score.examNumber, {
        attended: 0,
        total: 0,
        dateAvgMap: new Map(),
      });
    }
    const entry = studentScoreMap.get(score.examNumber)!;
    entry.total++;
    if (score.attendType !== "ABSENT") {
      entry.attended++;
      if (score.finalScore !== null) {
        const dateKey = sessionDateMap.get(score.sessionId) ?? "";
        const prev = entry.dateAvgMap.get(dateKey) ?? { sum: 0, count: 0 };
        entry.dateAvgMap.set(dateKey, {
          sum: prev.sum + score.finalScore,
          count: prev.count + 1,
        });
      }
    }
  }

  const examNumbers = Array.from(studentScoreMap.keys());
  if (examNumbers.length === 0) {
    return Response.json({ data: [] });
  }

  // 3. Points this month
  const pointLogs = await prisma.pointLog.findMany({
    where: {
      examNumber: { in: examNumbers },
      grantedAt: { gte: monthStart },
      amount: { gt: 0 },
    },
    select: { examNumber: true },
    distinct: ["examNumber"],
  });
  const studentsWithPoints = new Set(pointLogs.map((p) => p.examNumber));

  // 4. Counseling records this month
  const counselingRecords = await prisma.counselingRecord.findMany({
    where: {
      examNumber: { in: examNumbers },
      counseledAt: { gte: monthStart },
    },
    select: { examNumber: true },
    distinct: ["examNumber"],
  });
  const studentsWithCounseling = new Set(counselingRecords.map((c) => c.examNumber));

  // 5. Student names
  const studentRecords = await prisma.student.findMany({
    where: { examNumber: { in: examNumbers } },
    select: { examNumber: true, name: true },
  });
  const studentNameMap = new Map<string, string>();
  for (const s of studentRecords) {
    studentNameMap.set(s.examNumber, s.name);
  }

  // 6. Compute engagement score per student
  const results: EngagementStudentData[] = [];

  for (const [examNum, entry] of studentScoreMap) {
    const attendanceRate =
      entry.total > 0 ? Math.round((entry.attended / entry.total) * 100) : 0;

    // Build sorted date avgs for trend
    const sortedDates = Array.from(entry.dateAvgMap.keys()).sort();
    const historicalAvgs = sortedDates.map((d) => {
      const agg = entry.dateAvgMap.get(d)!;
      return agg.sum / agg.count;
    });
    const trend = computeTrend(historicalAvgs);

    const hasPoints = studentsWithPoints.has(examNum);
    const hasCounseling = studentsWithCounseling.has(examNum);

    // Score components:
    // Attendance: 40% weight (scale to 0-40)
    const attendanceComponent = (attendanceRate / 100) * 40;
    // Trend: 30% weight -> +15 improving, 0 flat, -15 declining
    const trendComponent = trend === "improving" ? 15 : trend === "declining" ? -15 : 0;
    // Baseline for trend (normalize from -15 to +15 → 0 to 30)
    const trendNormalized = trendComponent + 15; // 0 to 30
    // Points: 15% weight
    const pointsComponent = hasPoints ? 15 : 0;
    // Counseling: 15% weight
    const counselingComponent = hasCounseling ? 15 : 0;

    const rawScore =
      attendanceComponent + trendNormalized + pointsComponent + counselingComponent;
    // Scale: max = 40 + 30 + 15 + 15 = 100, min = 0 + 0 + 0 + 0 = 0
    const engagementScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    results.push({
      examNumber: examNum,
      name: studentNameMap.get(examNum) ?? examNum,
      attendanceRate,
      trend,
      hasPointsThisMonth: hasPoints,
      hasCounselingThisMonth: hasCounseling,
      engagementScore,
      tier: getTier(engagementScore),
    });
  }

  // Sort by engagement score ascending (lowest first)
  results.sort((a, b) => a.engagementScore - b.engagementScore);

  return Response.json({ data: results });
}
