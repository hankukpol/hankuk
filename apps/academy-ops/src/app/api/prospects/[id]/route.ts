import { AdminRole, ExamType, ProspectSource, ProspectStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  try {
    const body = await request.json();
    const { name, phone, examType, source, stage, note, visitedAt } = body;

    if (name !== undefined && !name?.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (source !== undefined && !Object.values(ProspectSource).includes(source)) {
      return NextResponse.json({ error: "유효하지 않은 유입경로입니다." }, { status: 400 });
    }
    if (stage !== undefined && !Object.values(ProspectStage).includes(stage)) {
      return NextResponse.json({ error: "유효하지 않은 단계입니다." }, { status: 400 });
    }
    if (examType !== undefined && examType !== null && !Object.values(ExamType).includes(examType)) {
      return NextResponse.json({ error: "유효하지 않은 시험유형입니다." }, { status: 400 });
    }

    const existing = await getPrisma().consultationProspect.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "상담 방문자를 찾을 수 없습니다." }, { status: 404 });
    }

    const prospect = await getPrisma().consultationProspect.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(examType !== undefined && { examType: examType || null }),
        ...(source !== undefined && { source }),
        ...(stage !== undefined && { stage }),
        ...(note !== undefined && { note: note?.trim() || null }),
        ...(visitedAt !== undefined && { visitedAt: new Date(visitedAt) }),
      },
      include: {
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({ data: { prospect } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  try {
    const existing = await getPrisma().consultationProspect.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "상담 방문자를 찾을 수 없습니다." }, { status: 404 });
    }

    await getPrisma().consultationProspect.delete({ where: { id } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
