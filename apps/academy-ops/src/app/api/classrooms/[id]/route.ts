import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const classroom = await getPrisma().classroom.findUnique({
    where: { id: params.id },
    include: {
      teacher: { select: { id: true, name: true } },
      students: {
        where: { leftAt: null },
        include: {
          student: { select: { examNumber: true, name: true, generation: true, currentStatus: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!classroom) {
    return NextResponse.json({ error: "담임반을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ classroom });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, teacherId, generation, note, isActive } = body;

    const existing = await getPrisma().classroom.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "담임반을 찾을 수 없습니다." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (teacherId !== undefined) updateData.teacherId = teacherId;
    if (generation !== undefined) updateData.generation = generation ? Number(generation) : null;
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const classroom = await getPrisma().classroom.update({
      where: { id: params.id },
      data: updateData,
      include: {
        teacher: { select: { name: true } },
        _count: { select: { students: { where: { leftAt: null } } } },
      },
    });

    return NextResponse.json({ classroom });
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
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await getPrisma().classroom.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
