import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/subject-heatmap
 *
 * Query params:
 * - weeks: number of weeks to look back (default 12)
 * - examType: "GONGCHAE" | "GYEONGCHAE" | "ALL" (default "ALL")
 *
 * Returns:
 * {
 *   weeks: string[],        // week keys like "2026-W01"
 *   subjects: string[],     // subject enum values
 *   data: { subject: string, weekKey: string, avg: number, count: number }[]
 * }
 */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const weeksBack = Math.min(
    parseInt(url.searchParams.get("weeks") ?? "12", 10) || 12,
    52,
  );
  const examTypeParam = url.searchParams.get("examType") ?? "ALL";

  const prisma = getPrisma();

  // Calculate date range (last N weeks, starting from Monday)
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  // Build examType filter
  const examTypeFilter =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam as "GONGCHAE" | "GYEONGCHAE" }
      : {};

  // Fetch sessions in the date range
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: { gte: startDate, lte: now },
      ...examTypeFilter,
    },
    select: {
      id: true,
      subject: true,
      examDate: true,
      examType: true,
    },
    orderBy: { examDate: "asc" },
  });

  if (sessions.length === 0) {
    return Response.json({
      data: {
        weeks: [],
        subjects: [],
        data: [],
      },
    });
  }

  const sessionIds = sessions.map((s) => s.id);

  // Fetch all scores for these sessions
  const scores = await prisma.score.findMany({
    where: {
      sessionId: { in: sessionIds },
      finalScore: { not: null },
      attendType: { not: "ABSENT" },
    },
    select: {
      sessionId: true,
      finalScore: true,
    },
  });

  // Build week key helper: ISO week "YYYY-WNN"
  function getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Set to Thursday in current week (ISO 8601)
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum =
      1 +
      Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7,
      );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  // Map sessionId -> { subject, weekKey }
  const sessionInfoMap = new Map<
    number,
    { subject: string; weekKey: string }
  >();
  for (const session of sessions) {
    sessionInfoMap.set(session.id, {
      subject: session.subject,
      weekKey: getWeekKey(session.examDate),
    });
  }

  // Aggregate: { subject+weekKey -> { sum, count } }
  const aggMap = new Map<string, { sum: number; count: number }>();
  for (const score of scores) {
    const info = sessionInfoMap.get(score.sessionId);
    if (!info || score.finalScore === null) continue;
    const key = `${info.subject}:::${info.weekKey}`;
    const prev = aggMap.get(key) ?? { sum: 0, count: 0 };
    aggMap.set(key, {
      sum: prev.sum + score.finalScore,
      count: prev.count + 1,
    });
  }

  // Collect unique weeks (sorted) and subjects
  const weekSet = new Set<string>();
  const subjectSet = new Set<string>();
  for (const session of sessions) {
    weekSet.add(getWeekKey(session.examDate));
    subjectSet.add(session.subject);
  }

  const weeks = Array.from(weekSet).sort();
  const subjects = Array.from(subjectSet).sort();

  // Build result data
  const data: { subject: string; weekKey: string; avg: number; count: number }[] =
    [];
  for (const subject of subjects) {
    for (const weekKey of weeks) {
      const key = `${subject}:::${weekKey}`;
      const agg = aggMap.get(key);
      if (agg && agg.count > 0) {
        data.push({
          subject,
          weekKey,
          avg: Math.round((agg.sum / agg.count) * 10) / 10,
          count: agg.count,
        });
      }
    }
  }

  return Response.json({
    data: {
      weeks,
      subjects,
      data,
    },
  });
}
