import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const onlyMine = searchParams.get("mine") === "1";

  const classrooms = await getPrisma().classroom.findMany({
    where: {
      isActive: true,
      ...(onlyMine ? { teacherId: auth.context.adminUser.id } : {}),
    },
    include: {
      teacher: { select: { name: true } },
      _count: { select: { students: { where: { leftAt: null } } } },
    },
    orderBy: [{ generation: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ classrooms });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, teacherId, generation, note } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "반 이름을 입력하세요." }, { status: 400 });
    }
    if (!teacherId) {
      return NextResponse.json({ error: "담임 선생님을 선택하세요." }, { status: 400 });
    }

    const classroom = await getPrisma().classroom.create({
      data: {
        name: name.trim(),
        teacherId,
        generation: generation ? Number(generation) : null,
        note: note?.trim() || null,
      },
      include: {
        teacher: { select: { name: true } },
        _count: { select: { students: { where: { leftAt: null } } } },
      },
    });

    return NextResponse.json({ classroom }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
