import { AdminRole, BookingStatus } from "@prisma/client";
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
    const { status, note } = body as { status?: BookingStatus; note?: string };

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (note !== undefined) data.note = note?.trim() || null;

    const booking = await getPrisma().studyRoomBooking.update({
      where: { id: params.id },
      data,
      include: {
        room: { select: { name: true } },
        student: { select: { name: true, generation: true } },
      },
    });

    return NextResponse.json({ booking });
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
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await getPrisma().studyRoomBooking.update({
    where: { id: params.id },
    data: { status: BookingStatus.CANCELLED },
  });

  return NextResponse.json({ ok: true });
}
