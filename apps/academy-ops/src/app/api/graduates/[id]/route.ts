import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const record = await getPrisma().graduateRecord.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { name: true, generation: true, examType: true } },
      staff: { select: { name: true } },
      scoreSnapshots: { orderBy: { createdAt: "asc" as const } },
    },
  });

  if (!record) return NextResponse.json({ error: "합격 기록을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ record });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examName, passType, writtenPassDate, finalPassDate, appointedDate, enrolledMonths, testimony, isPublic, note } = body;

    const updateData: Record<string, unknown> = {};
    if (examName !== undefined) updateData.examName = examName.trim();
    if (passType !== undefined) updateData.passType = passType;
    if (writtenPassDate !== undefined) updateData.writtenPassDate = writtenPassDate ? new Date(writtenPassDate) : null;
    if (finalPassDate !== undefined) updateData.finalPassDate = finalPassDate ? new Date(finalPassDate) : null;
    if (appointedDate !== undefined) updateData.appointedDate = appointedDate ? new Date(appointedDate) : null;
    if (enrolledMonths !== undefined) updateData.enrolledMonths = enrolledMonths ? Number(enrolledMonths) : null;
    if (testimony !== undefined) updateData.testimony = testimony?.trim() || null;
    if (isPublic !== undefined) updateData.isPublic = Boolean(isPublic);
    if (note !== undefined) updateData.note = note?.trim() || null;

    const record = await getPrisma().graduateRecord.update({
      where: { id: params.id },
      data: updateData,
      include: {
        student: { select: { name: true, generation: true } },
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({ record });
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
    await getPrisma().graduateRecord.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
