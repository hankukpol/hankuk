import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    const body = await request.json();
    const { name, examType, year, writtenDate, interviewDate, resultDate, description, isActive } =
      body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (examType !== undefined) {
      if (!Object.values(ExamType).includes(examType)) {
        return NextResponse.json({ error: "잘못된 시험 유형" }, { status: 400 });
      }
      updateData.examType = examType;
    }
    if (year !== undefined) updateData.year = Number(year);
    if (writtenDate !== undefined) updateData.writtenDate = writtenDate ? new Date(writtenDate) : null;
    if (interviewDate !== undefined)
      updateData.interviewDate = interviewDate ? new Date(interviewDate) : null;
    if (resultDate !== undefined) updateData.resultDate = resultDate ? new Date(resultDate) : null;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const exam = await getPrisma().civilServiceExam.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ exam });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    await getPrisma().civilServiceExam.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
