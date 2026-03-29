import { AdminRole, ExamEventType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/exams/external/[id]/scores — 외부시험 성적 목록
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const prisma = getPrisma();

  // Verify event exists and is EXTERNAL type
  const event = await prisma.examEvent.findFirst({
    where: { id, eventType: ExamEventType.EXTERNAL },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  const registrations = await prisma.examRegistration.findMany({
    where: { examEventId: id, cancelledAt: null },
    orderBy: [{ division: "asc" }, { registeredAt: "asc" }],
    include: {
      student: {
        select: { examNumber: true, name: true, phone: true },
      },
      score: true,
    },
  });

  const rows = registrations.map((reg) => ({
    registrationId: reg.id,
    examNumber: reg.examNumber,
    externalName: reg.externalName,
    externalPhone: reg.externalPhone,
    division: reg.division,
    seatNumber: reg.seatNumber,
    student: reg.student,
    score: reg.score
      ? {
          id: reg.score.id,
          score: reg.score.score,
          rank: reg.score.rank,
          note: reg.score.note,
        }
      : null,
  }));

  return NextResponse.json({ data: rows });
}

// POST /api/exams/external/[id]/scores — 성적 일괄 저장 (upsert)
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const prisma = getPrisma();

  // Verify event
  const event = await prisma.examEvent.findFirst({
    where: { id, eventType: ExamEventType.EXTERNAL },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  type ScoreEntry = {
    registrationId: string;
    score: number;
    note?: string;
  };

  const parsed = body as { scores?: ScoreEntry[] };
  if (!Array.isArray(parsed?.scores)) {
    return NextResponse.json({ error: "scores 배열이 필요합니다." }, { status: 400 });
  }

  const scores = parsed.scores;

  // Validate all registrationIds belong to this event
  const validRegs = await prisma.examRegistration.findMany({
    where: {
      id: { in: scores.map((s) => s.registrationId) },
      examEventId: id,
      cancelledAt: null,
    },
    select: { id: true, division: true },
  });
  const validRegSet = new Set(validRegs.map((r) => r.id));

  const validScores = scores.filter(
    (s) =>
      validRegSet.has(s.registrationId) &&
      typeof s.score === "number" &&
      !isNaN(s.score) &&
      s.score >= 0 &&
      s.score <= 100,
  );

  if (validScores.length === 0) {
    return NextResponse.json({ error: "유효한 성적 데이터가 없습니다." }, { status: 400 });
  }

  // Upsert scores
  let saved = 0;
  for (const entry of validScores) {
    await prisma.examScore.upsert({
      where: { registrationId: entry.registrationId },
      create: {
        registrationId: entry.registrationId,
        score: entry.score,
        note: entry.note?.trim() || null,
      },
      update: {
        score: entry.score,
        note: entry.note?.trim() || null,
      },
    });
    saved++;
  }

  // Recalculate ranks within each division for this event
  const divisionMap = new Map<string, string[]>();
  for (const reg of validRegs) {
    if (!divisionMap.has(reg.division)) divisionMap.set(reg.division, []);
    divisionMap.get(reg.division)!.push(reg.id);
  }

  // For each division touched, recalc ranks
  const touchedDivisions = new Set(validRegs.map((r) => r.division));
  for (const division of touchedDivisions) {
    const divRegs = await prisma.examRegistration.findMany({
      where: { examEventId: id, division, cancelledAt: null },
      include: { score: { select: { id: true, score: true } } },
      orderBy: { registeredAt: "asc" },
    });

    // Sort by score desc to calculate rank
    const scored = divRegs
      .filter((r): r is typeof r & { score: NonNullable<(typeof r)["score"]> } => r.score !== null)
      .sort((a, b) => b.score.score - a.score.score);

    for (let i = 0; i < scored.length; i++) {
      // Handle ties: same rank for same score
      const rank =
        i > 0 && scored[i].score.score === scored[i - 1].score.score
          ? (
              await prisma.examScore.findUnique({
                where: { id: scored[i - 1].score.id },
                select: { rank: true },
              })
            )?.rank ?? i + 1
          : i + 1;

      await prisma.examScore.update({
        where: { id: scored[i].score.id },
        data: { rank },
      });
    }
  }

  return NextResponse.json({ data: { saved } });
}
