import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; subjectId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.subjectName !== undefined) data.subjectName = String(body.subjectName).trim();
    if (body.instructorId !== undefined) data.instructorId = body.instructorId;
    if (body.price !== undefined) data.price = Number(body.price);
    if (body.instructorRate !== undefined) data.instructorRate = Number(body.instructorRate);
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    const subject = await getPrisma().specialLectureSubject.update({
      where: { id: params.subjectId, lectureId: params.id },
      data,
      include: { instructor: { select: { id: true, name: true, subject: true } } },
    });

    return NextResponse.json({ subject });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; subjectId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    await getPrisma().specialLectureSubject.delete({
      where: { id: params.subjectId, lectureId: params.id },
    });
    return NextResponse.json({ id: params.subjectId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
