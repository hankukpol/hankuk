import { AdminRole, AttendType, Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function resolveScore(finalScore: number | null, rawScore: number | null): number | null {
  if (finalScore !== null) return finalScore;
  if (rawScore !== null) return rawScore;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const examNumbersParam = sp.get("examNumbers") ?? "";
  const periodIdParam = sp.get("periodId");

  const examNumbers = examNumbersParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5); // max 5

  const periodId = periodIdParam ? parseInt(periodIdParam) : null;

  const prisma = getPrisma();

  // ── 1. Load periods (for selector) ───────────────────────────────────────
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true },
  });

  if (examNumbers.length === 0 || periodId === null) {
    return NextResponse.json({ data: { periods, students: [] } });
  }

  // ── 2. Validate students exist ────────────────────────────────────────────
  const studentRecords = await prisma.student.findMany({
    where: { examNumber: { in: examNumbers } },
    select: { examNumber: true, name: true },
  });
  const studentMap = new Map(studentRecords.map((s) => [s.examNumber, s.name]));

  // ── 3. Get sessions for this period (non-cumulative, not cancelled) ───────
  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
      isCancelled: false,
      subject: { not: Subject.CUMULATIVE },
    },
    orderBy: [{ examDate: "asc" }],
    select: { id: true, week: true, subject: true, examDate: true, examType: true },
  });

  if (sessions.length === 0) {
    return NextResponse.json({ data: { periods, students: [] } });
  }

  const sessionIds = sessions.map((s) => s.id);

  // ── 4. Get scores for all target students ─────────────────────────────────
  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: examNumbers },
      sessionId: { in: sessionIds },
      attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
    },
    select: {
      examNumber: true,
      sessionId: true,
      finalScore: true,
      rawScore: true,
    },
  });

  // ── 5. Build per-student trend (weekly average) ───────────────────────────
  //    Group sessions by week, then per student compute average score per week.
  const weekToSessionIds = new Map<number, number[]>();
  for (const sess of sessions) {
    const arr = weekToSessionIds.get(sess.week) ?? [];
    arr.push(sess.id);
    weekToSessionIds.set(sess.week, arr);
  }

  const weeks = [...new Set(sessions.map((s) => s.week))].sort((a, b) => a - b);

  type StudentTrend = {
    examNumber: string;
    name: string;
    trend: Array<{ week: number; avg: number | null }>;
    avgScore: number | null;
    maxScore: number | null;
    minScore: number | null;
  };

  const students: StudentTrend[] = [];

  for (const en of examNumbers) {
    const studentScores = scores.filter((s) => s.examNumber === en);
    const scoreBySession = new Map<number, number>();
    for (const s of studentScores) {
      const val = resolveScore(s.finalScore, s.rawScore);
      if (val !== null) scoreBySession.set(s.sessionId, val);
    }

    const trend = weeks.map((week) => {
      const wSessionIds = weekToSessionIds.get(week) ?? [];
      const vals = wSessionIds
        .map((sid) => scoreBySession.get(sid))
        .filter((v): v is number => v !== undefined);
      if (vals.length === 0) return { week, avg: null };
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { week, avg: Math.round(avg * 10) / 10 };
    });

    const allVals = [...scoreBySession.values()];
    const avgScore =
      allVals.length > 0
        ? Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 10) / 10
        : null;
    const maxScore = allVals.length > 0 ? Math.round(Math.max(...allVals) * 10) / 10 : null;
    const minScore = allVals.length > 0 ? Math.round(Math.min(...allVals) * 10) / 10 : null;

    students.push({
      examNumber: en,
      name: studentMap.get(en) ?? en,
      trend,
      avgScore,
      maxScore,
      minScore,
    });
  }

  return NextResponse.json({ data: { periods, students } });
}
