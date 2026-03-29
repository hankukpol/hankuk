import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Simple linear regression
 */
function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return { slope: 0, intercept: sumY / n };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export type ForecastStudentData = {
  examNumber: string;
  name: string;
  historical: { sessionIndex: number; avg: number; examDate: string }[];
  projected: { sessionIndex: number; projectedAvg: number }[];
  slope: number;
  currentAvg: number;
  predictedAvg: number;
  trend: "declining" | "improving" | "stable";
};

/**
 * GET /api/admin/analytics/score-forecast
 *
 * Query params:
 * - examType: "GONGCHAE" | "GYEONGCHAE" | "ALL" (default "ALL")
 * - weeks: number of weeks to look back (default 12)
 * - mode: "declining" | "improving" | "all" (default "declining")
 * - examNumber: specific student (optional)
 * - limit: max students to return (default 20)
 */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const examTypeParam = url.searchParams.get("examType") ?? "ALL";
  const weeksBack = Math.min(
    parseInt(url.searchParams.get("weeks") ?? "12", 10) || 12,
    52,
  );
  const mode = url.searchParams.get("mode") ?? "declining";
  const specificExamNumber = url.searchParams.get("examNumber");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);

  const prisma = getPrisma();

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  // Fetch sessions ordered by date
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: { gte: startDate, lte: now },
      ...examTypeFilter,
    },
    select: {
      id: true,
      examDate: true,
    },
    orderBy: { examDate: "asc" },
  });

  if (sessions.length < 3) {
    return Response.json({ data: [] });
  }

  // Assign sequential index by sorted examDate
  const uniqueDates = Array.from(new Set(sessions.map((s) => s.examDate.toISOString().split("T")[0]))).sort();
  const dateIndexMap = new Map<string, number>();
  uniqueDates.forEach((d, i) => dateIndexMap.set(d, i + 1));

  const sessionIds = sessions.map((s) => s.id);

  // Session → dateKey map
  const sessionDateMap = new Map<number, string>();
  for (const s of sessions) {
    sessionDateMap.set(s.id, s.examDate.toISOString().split("T")[0]);
  }

  // Fetch scores
  const scoreWhere = specificExamNumber
    ? { sessionId: { in: sessionIds }, finalScore: { not: null }, attendType: { not: "ABSENT" as const }, examNumber: specificExamNumber }
    : { sessionId: { in: sessionIds }, finalScore: { not: null }, attendType: { not: "ABSENT" as const } };

  const scores = await prisma.score.findMany({
    where: scoreWhere,
    select: {
      examNumber: true,
      sessionId: true,
      finalScore: true,
    },
  });

  // Aggregate per student per session-date: avg score
  // Map: examNumber → dateKey → { sum, count }
  const studentDateMap = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const score of scores) {
    if (score.finalScore === null) continue;
    const dateKey = sessionDateMap.get(score.sessionId);
    if (!dateKey) continue;

    if (!studentDateMap.has(score.examNumber)) {
      studentDateMap.set(score.examNumber, new Map());
    }
    const dateMap = studentDateMap.get(score.examNumber)!;
    const prev = dateMap.get(dateKey) ?? { sum: 0, count: 0 };
    dateMap.set(dateKey, { sum: prev.sum + score.finalScore, count: prev.count + 1 });
  }

  // Filter students with 8+ sessions
  const MIN_SESSIONS = 4;

  // Get student names
  const examNumbers = specificExamNumber
    ? [specificExamNumber]
    : Array.from(studentDateMap.keys());

  const studentRecords = await prisma.student.findMany({
    where: { examNumber: { in: examNumbers } },
    select: { examNumber: true, name: true },
  });
  const studentNameMap = new Map<string, string>();
  for (const s of studentRecords) {
    studentNameMap.set(s.examNumber, s.name);
  }

  const results: ForecastStudentData[] = [];

  for (const [examNum, dateMap] of studentDateMap) {
    if (dateMap.size < MIN_SESSIONS) continue;

    // Build sorted historical points
    const historicalPoints: { sessionIndex: number; avg: number; examDate: string }[] = [];
    const sortedDates = Array.from(dateMap.keys()).sort();
    for (const dateKey of sortedDates) {
      const agg = dateMap.get(dateKey)!;
      const idx = dateIndexMap.get(dateKey) ?? 0;
      historicalPoints.push({
        sessionIndex: idx,
        avg: Math.round((agg.sum / agg.count) * 10) / 10,
        examDate: dateKey,
      });
    }

    const points = historicalPoints.map((p) => ({ x: p.sessionIndex, y: p.avg }));
    const { slope, intercept } = linearRegression(points);

    const lastIdx = historicalPoints[historicalPoints.length - 1].sessionIndex;
    const currentAvg = historicalPoints[historicalPoints.length - 1].avg;

    // Project next 4 sessions
    const projected: { sessionIndex: number; projectedAvg: number }[] = [];
    for (let i = 1; i <= 4; i++) {
      const projIdx = lastIdx + i;
      const projAvg = Math.max(0, Math.min(100, slope * projIdx + intercept));
      projected.push({
        sessionIndex: projIdx,
        projectedAvg: Math.round(projAvg * 10) / 10,
      });
    }

    const predictedAvg = projected[3].projectedAvg;

    let trend: "declining" | "improving" | "stable";
    if (slope < -1) trend = "declining";
    else if (slope > 1) trend = "improving";
    else trend = "stable";

    results.push({
      examNumber: examNum,
      name: studentNameMap.get(examNum) ?? examNum,
      historical: historicalPoints,
      projected,
      slope: Math.round(slope * 100) / 100,
      currentAvg,
      predictedAvg,
      trend,
    });
  }

  // Filter by mode
  let filtered = results;
  if (mode === "declining") {
    filtered = results.filter((r) => r.trend === "declining");
  } else if (mode === "improving") {
    filtered = results.filter((r) => r.trend === "improving");
  }

  // Sort: declining → by slope asc (steepest decline first), others by slope desc
  if (mode === "declining") {
    filtered.sort((a, b) => a.slope - b.slope);
  } else {
    filtered.sort((a, b) => b.slope - a.slope);
  }

  const output = filtered.slice(0, limit);

  return Response.json({ data: output });
}
