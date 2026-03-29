import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumbers } = body as { examNumbers: string[] };

    if (!Array.isArray(examNumbers) || examNumbers.length === 0) {
      return NextResponse.json({ error: "학생을 선택하세요." }, { status: 400 });
    }

    const classroom = await getPrisma().classroom.findUnique({ where: { id: params.id } });
    if (!classroom) {
      return NextResponse.json({ error: "담임반을 찾을 수 없습니다." }, { status: 404 });
    }

    // Upsert: if already exists and leftAt is set, reactivate; otherwise create
    await getPrisma().$transaction(
      examNumbers.map((examNumber) =>
        getPrisma().classroomStudent.upsert({
          where: { classroomId_examNumber: { classroomId: params.id, examNumber } },
          create: { classroomId: params.id, examNumber },
          update: { leftAt: null, joinedAt: new Date() },
        }),
      ),
    );

    return NextResponse.json({ ok: true, added: examNumbers.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "추가 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber } = body as { examNumber: string };

    if (!examNumber) {
      return NextResponse.json({ error: "학생 수험번호를 입력하세요." }, { status: 400 });
    }

    await getPrisma().classroomStudent.update({
      where: { classroomId_examNumber: { classroomId: params.id, examNumber } },
      data: { leftAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "제거 실패" },
      { status: 400 },
    );
  }
}
