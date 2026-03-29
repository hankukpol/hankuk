import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/cohort-progression
 *
 * Query params:
 * - examType: "GONGCHAE" | "GYEONGCHAE" | "ALL" (default "ALL")
 * - periodId: number (optional, limits to a specific exam period)
 * - cohortIds: comma-separated cohort IDs to compare
 *
 * Returns:
 * {
 *   series: {
 *     id: string,
 *     label: string,
 *     examType: string,
 *     points: { weekLabel: string, weekNum: number, avg: number, count: number }[]
 *   }[],
 *   sessions: {
 *     id: number, examDate: string, week: number, examType: string,
 *     avgByType: Record<string, number>
 *   }[]
 * }
 */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const examTypeParam = url.searchParams.get("examType") ?? "ALL";
  const periodIdParam = url.searchParams.get("periodId");
  const cohortIdsParam = url.searchParams.get("cohortIds");

  const prisma = getPrisma();

  // Build filters
  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  const periodFilter = periodIdParam
    ? { periodId: parseInt(periodIdParam, 10) }
    : {};

  // Fetch exam sessions ordered by date
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      ...examTypeFilter,
      ...periodFilter,
    },
    select: {
      id: true,
      examDate: true,
      week: true,
      examType: true,
      subject: true,
    },
    orderBy: { examDate: "asc" },
    take: 500,
  });

  if (sessions.length === 0) {
    return Response.json({
      data: {
        series: [],
        sessions: [],
      },
    });
  }

  const sessionIds = sessions.map((s) => s.id);

  // If cohortIds param is provided, filter by cohort enrollment
  let examNumbersByType: Map<string, Set<string>> | null = null;

  if (cohortIdsParam) {
    const ids = cohortIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length > 0) {
      const enrollments = await prisma.courseEnrollment.findMany({
        where: {
          cohortId: { in: ids },
          status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] },
        },
        select: {
          examNumber: true,
          cohortId: true,
          cohort: {
            select: {
              examCategory: true,
            },
          },
        },
      });

      examNumbersByType = new Map<string, Set<string>>();
      for (const e of enrollments) {
        if (!e.cohortId) continue;
        const category = e.cohort?.examCategory ?? "CUSTOM";
        const key = ids.includes(e.cohortId) ? e.cohortId : category;
        const set = examNumbersByType.get(key) ?? new Set<string>();
        set.add(e.examNumber);
        examNumbersByType.set(key, set);
      }
    }
  }

  // Fetch all scores
  const allScores = await prisma.score.findMany({
    where: {
      sessionId: { in: sessionIds },
      finalScore: { not: null },
      attendType: { not: "ABSENT" },
    },
    select: {
      sessionId: true,
      examNumber: true,
      finalScore: true,
    },
  });

  // Group sessions by week + examType
  type SessionKey = string; // "GONGCHAE:::week5"
  const weekTypeMap = new Map<
    SessionKey,
    { sum: number; count: number; sessionIds: Set<number> }
  >();

  // Also track per-session aggregates for each examType
  const sessionAvgMap = new Map<
    number,
    { avgByType: Record<string, { sum: number; count: number }> }
  >();

  // Build session lookup
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  for (const score of allScores) {
    const session = sessionMap.get(score.sessionId);
    if (!session || score.finalScore === null) continue;

    // Per-session stats
    const sessionEntry = sessionAvgMap.get(score.sessionId) ?? {
      avgByType: {},
    };
    const examType = session.examType;
    const et = sessionEntry.avgByType[examType] ?? { sum: 0, count: 0 };
    et.sum += score.finalScore;
    et.count += 1;
    sessionEntry.avgByType[examType] = et;
    sessionAvgMap.set(score.sessionId, sessionEntry);

    // Weekly type aggregation
    const weekKey: SessionKey = `${session.examType}:::week${session.week}`;
    const prev = weekTypeMap.get(weekKey) ?? {
      sum: 0,
      count: 0,
      sessionIds: new Set<number>(),
    };
    prev.sum += score.finalScore;
    prev.count += 1;
    prev.sessionIds.add(score.sessionId);
    weekTypeMap.set(weekKey, prev);
  }

  // Build series: one per examType with weekly avg points
  const examTypes =
    examTypeParam === "ALL"
      ? ["GONGCHAE", "GYEONGCHAE"]
      : [examTypeParam];

  const series = examTypes.map((examType) => {
    // Get unique weeks for this exam type
    const weekNums = [
      ...new Set(
        sessions
          .filter((s) => s.examType === examType)
          .map((s) => s.week),
      ),
    ].sort((a, b) => a - b);

    const points = weekNums
      .map((weekNum) => {
        const key: SessionKey = `${examType}:::week${weekNum}`;
        const agg = weekTypeMap.get(key);
        if (!agg || agg.count === 0) return null;
        return {
          weekLabel: `${weekNum}주`,
          weekNum,
          avg: Math.round((agg.sum / agg.count) * 10) / 10,
          count: agg.count,
        };
      })
      .filter(
        (
          p,
        ): p is {
          weekLabel: string;
          weekNum: number;
          avg: number;
          count: number;
        } => p !== null,
      );

    const label = examType === "GONGCHAE" ? "공채" : "경채";

    return {
      id: examType,
      label,
      examType,
      points,
    };
  });

  // Build session-level data for the table below the chart
  const sessionRows = sessions.map((session) => {
    const avgMap = sessionAvgMap.get(session.id);
    const avgByType: Record<string, number> = {};
    if (avgMap) {
      for (const [et, agg] of Object.entries(avgMap.avgByType)) {
        if (agg.count > 0) {
          avgByType[et] = Math.round((agg.sum / agg.count) * 10) / 10;
        }
      }
    }
    return {
      id: session.id,
      examDate: session.examDate.toISOString(),
      week: session.week,
      subject: session.subject,
      examType: session.examType,
      avgByType,
    };
  });

  return Response.json({
    data: {
      series: series.filter((s) => s.points.length > 0),
      sessions: sessionRows,
    },
  });
}
