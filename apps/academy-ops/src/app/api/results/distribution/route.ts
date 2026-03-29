import { AdminRole, AttendType, ExamType, Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Score buckets ──────────────────────────────────────────────────────────

const DIST_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0~50", min: 0, max: 51 },
  { label: "51~60", min: 51, max: 61 },
  { label: "61~70", min: 61, max: 71 },
  { label: "71~80", min: 71, max: 81 },
  { label: "81~90", min: 81, max: 91 },
  { label: "91~100", min: 91, max: 101 },
];

function resolveScore(finalScore: number | null, rawScore: number | null): number | null {
  if (finalScore !== null) return finalScore;
  if (rawScore !== null) return rawScore;
  return null;
}

function computeStats(values: number[]): {
  avg: number | null;
  median: number | null;
  stddev: number | null;
  max: number | null;
  min: number | null;
} {
  if (values.length === 0) {
    return { avg: null, median: null, stddev: null, max: null, min: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = sorted.reduce((a, b) => a + b, 0) / n;

  const median =
    n % 2 === 1
      ? (sorted[Math.floor(n / 2)] ?? 0)
      : (((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2);

  const variance = sorted.reduce((sum, v) => sum + (v - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    avg: Math.round(avg * 10) / 10,
    median: Math.round(median * 10) / 10,
    stddev: Math.round(stddev * 10) / 10,
    max: Math.round((sorted[n - 1] ?? 0) * 10) / 10,
    min: Math.round((sorted[0] ?? 0) * 10) / 10,
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const periodId = sp.get("periodId") ? parseInt(sp.get("periodId")!) : null;
  const sessionId = sp.get("sessionId") ? parseInt(sp.get("sessionId")!) : null;
  const examTypeParam = sp.get("examType") as ExamType | null;

  const prisma = getPrisma();

  // ── 1. Load exam periods (for filter dropdowns) ──────────────────────────
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true },
  });

  // ── 2. Load sessions if periodId is given ────────────────────────────────
  let sessions: Array<{ id: number; week: number; subject: Subject; examDate: Date; examType: ExamType }> = [];
  if (periodId !== null) {
    const where: Record<string, unknown> = {
      periodId,
      isCancelled: false,
      subject: { not: Subject.CUMULATIVE },
    };
    if (examTypeParam) where.examType = examTypeParam;

    sessions = await prisma.examSession.findMany({
      where,
      orderBy: [{ week: "asc" }, { examDate: "asc" }],
      select: { id: true, week: true, subject: true, examDate: true, examType: true },
    });
  }

  // ── 3. Compute distribution if we have a period ──────────────────────────
  if (periodId === null) {
    return NextResponse.json({ data: { periods, sessions: [], stats: null, distribution: [], subjectAverages: [] } });
  }

  // Determine target session IDs
  const targetSessionIds: number[] =
    sessionId !== null
      ? [sessionId]
      : sessions.map((s) => s.id);

  if (targetSessionIds.length === 0) {
    return NextResponse.json({
      data: { periods, sessions, stats: null, distribution: [], subjectAverages: [] },
    });
  }

  // Fetch scores
  const scores = await prisma.score.findMany({
    where: {
      sessionId: { in: targetSessionIds },
      attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
    },
    select: {
      examNumber: true,
      finalScore: true,
      rawScore: true,
      session: { select: { subject: true } },
    },
  });

  // ── 4. Per-session stats: group by examNumber → per-student average ───────
  //    If a single session is selected, each student has one row.
  //    If all sessions in period, compute average across sessions.
  const byStudent = new Map<string, number[]>();
  for (const s of scores) {
    const val = resolveScore(s.finalScore, s.rawScore);
    if (val === null) continue;
    const arr = byStudent.get(s.examNumber) ?? [];
    arr.push(val);
    byStudent.set(s.examNumber, arr);
  }

  const studentAvgs: number[] = [];
  for (const [, vals] of byStudent) {
    if (vals.length > 0) {
      studentAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  // ── 5. Stats ──────────────────────────────────────────────────────────────
  const stats = computeStats(studentAvgs);

  // ── 6. Distribution buckets ───────────────────────────────────────────────
  const distribution = DIST_BUCKETS.map((b) => ({
    range: b.label,
    count: studentAvgs.filter((v) => v >= b.min && v < b.max).length,
  }));

  // ── 7. Subject averages ───────────────────────────────────────────────────
  const bySubject = new Map<Subject, number[]>();
  for (const s of scores) {
    const val = resolveScore(s.finalScore, s.rawScore);
    if (val === null) continue;
    const arr = bySubject.get(s.session.subject) ?? [];
    arr.push(val);
    bySubject.set(s.session.subject, arr);
  }

  const subjectAverages = [...bySubject.entries()]
    .map(([subject, vals]) => ({
      subject,
      label: SUBJECT_LABEL[subject] ?? subject,
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      count: vals.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  return NextResponse.json({
    data: { periods, sessions, stats, distribution, subjectAverages },
  });
}
