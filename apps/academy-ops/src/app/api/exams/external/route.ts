import { AdminRole, ExamEventType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/exams/external — 외부모의고사 시험 목록
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const activeOnly = sp.get("activeOnly") !== "false";

  const events = await getPrisma().examEvent.findMany({
    where: {
      eventType: ExamEventType.EXTERNAL,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: { examDate: "desc" },
    include: {
      _count: { select: { registrations: true } },
    },
  });

  return NextResponse.json({ events });
}

// POST /api/exams/external — 새 외부모의고사 등록
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { title, examDate, venue, registrationFee } = body;

    if (!title?.trim()) throw new Error("시험명을 입력하세요.");
    if (!examDate) throw new Error("시험일을 입력하세요.");

    const fee =
      typeof registrationFee === "number" && registrationFee >= 0
        ? Math.floor(registrationFee)
        : 0;

    const event = await getPrisma().examEvent.create({
      data: {
        title: title.trim(),
        eventType: ExamEventType.EXTERNAL,
        examDate: new Date(examDate),
        registrationFee: fee,
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
