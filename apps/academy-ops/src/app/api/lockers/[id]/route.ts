import { AdminRole, LockerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { status, note, row, col } = body as {
      status?: LockerStatus;
      note?: string;
      row?: number | null;
      col?: number | null;
    };

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (row !== undefined) updateData.row = row;
    if (col !== undefined) updateData.col = col;

    const locker = await getPrisma().locker.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ locker });
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

  try {
    await getPrisma().locker.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
