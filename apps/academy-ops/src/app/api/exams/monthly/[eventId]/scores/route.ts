import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

/**
 * GET /api/exams/monthly/[eventId]/scores
 *
 * 월말평가 성적 목록 조회
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId } = await context.params;

  const prisma = getPrisma();

  // Verify event exists
  const event = await prisma.examEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  // Fetch all non-cancelled registrations with scores
  const registrations = await prisma.examRegistration.findMany({
    where: {
      examEventId: eventId,
      cancelledAt: null,
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          examType: true,
        },
      },
      score: true,
    },
    orderBy: { registeredAt: "asc" },
  });

  return NextResponse.json({ data: { registrations } });
}

/**
 * POST /api/exams/monthly/[eventId]/scores
 *
 * 성적 일괄 저장 (upsert)
 * Body: { scores: [{ registrationId: string, score: number, rank?: number }] }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId } = await context.params;

  let body: { scores?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!Array.isArray(body.scores)) {
    return NextResponse.json({ error: "scores 배열이 필요합니다." }, { status: 400 });
  }

  type ScoreInput = {
    registrationId: string;
    score: number;
    rank?: number;
  };

  const scoreInputs = body.scores as ScoreInput[];

  // Validate
  for (const s of scoreInputs) {
    if (!s.registrationId || typeof s.registrationId !== "string") {
      return NextResponse.json(
        { error: "각 항목에 registrationId가 필요합니다." },
        { status: 400 },
      );
    }
    if (typeof s.score !== "number" || s.score < 0 || s.score > 100) {
      return NextResponse.json(
        { error: `유효하지 않은 점수: ${s.registrationId}` },
        { status: 400 },
      );
    }
  }

  const prisma = getPrisma();

  // Verify event exists and all registrations belong to this event
  const event = await prisma.examEvent.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  // Verify all registrationIds belong to this event
  const regIds = scoreInputs.map((s) => s.registrationId);
  const regs = await prisma.examRegistration.findMany({
    where: { id: { in: regIds }, examEventId: eventId },
    select: { id: true },
  });

  if (regs.length !== regIds.length) {
    return NextResponse.json(
      { error: "일부 접수 ID가 이 시험에 속하지 않습니다." },
      { status: 400 },
    );
  }

  // Upsert all scores in a transaction
  const now = new Date();
  await prisma.$transaction(
    scoreInputs.map((s) =>
      prisma.examScore.upsert({
        where: { registrationId: s.registrationId },
        update: {
          score: s.score,
          rank: s.rank ?? null,
          updatedAt: now,
        },
        create: {
          registrationId: s.registrationId,
          score: s.score,
          rank: s.rank ?? null,
        },
      }),
    ),
  );

  return NextResponse.json({ data: { saved: scoreInputs.length } });
}
