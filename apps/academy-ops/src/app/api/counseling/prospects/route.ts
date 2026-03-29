import { AdminRole, ExamType, ProspectSource, ProspectStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const stage = searchParams.get("stage") as ProspectStage | null;
  const source = searchParams.get("source") as ProspectSource | null;

  const prospects = await getPrisma().consultationProspect.findMany({
    where: {
      ...(stage && Object.values(ProspectStage).includes(stage) ? { stage } : {}),
      ...(source && Object.values(ProspectSource).includes(source) ? { source } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      staff: { select: { name: true } },
    },
  });

  return NextResponse.json({ prospects });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, phone, examType, source, stage, note, visitedAt } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (source && !Object.values(ProspectSource).includes(source)) {
      return NextResponse.json({ error: "유효하지 않은 유입경로입니다." }, { status: 400 });
    }
    if (stage && !Object.values(ProspectStage).includes(stage)) {
      return NextResponse.json({ error: "유효하지 않은 단계입니다." }, { status: 400 });
    }
    if (examType && !Object.values(ExamType).includes(examType)) {
      return NextResponse.json({ error: "유효하지 않은 시험유형입니다." }, { status: 400 });
    }

    const prospect = await getPrisma().consultationProspect.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        examType: examType || null,
        source: source || ProspectSource.WALK_IN,
        stage: stage || ProspectStage.INQUIRY,
        note: note?.trim() || null,
        staffId: auth.context.adminUser.id,
        visitedAt: visitedAt ? new Date(visitedAt) : new Date(),
      },
      include: {
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({ prospect }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
