import { AdminRole, ExamEventType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/exams/monthly — 월말평가 시험 목록
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const activeOnly = sp.get("activeOnly") !== "false";

  const events = await getPrisma().examEvent.findMany({
    where: {
      eventType: ExamEventType.MONTHLY,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: { examDate: "desc" },
    include: {
      _count: { select: { registrations: true } },
    },
  });

  return NextResponse.json({ events });
}

// POST /api/exams/monthly — 새 월말평가 등록
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { title, examDate, registrationFee, registrationDeadline, venue } = body;

    if (!title?.trim()) throw new Error("시험명을 입력하세요.");
    if (!examDate) throw new Error("시험일을 입력하세요.");

    const event = await getPrisma().examEvent.create({
      data: {
        title: title.trim(),
        eventType: ExamEventType.MONTHLY,
        examDate: new Date(examDate),
        registrationFee: registrationFee ? Number(registrationFee) : 0,
        registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
        venue: venue?.trim() || null,
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
