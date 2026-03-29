import { AdminRole, LockerStatus, RentalStatus } from "@prisma/client";
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
    const { status, endDate, note } = body as {
      status?: RentalStatus;
      endDate?: string;
      note?: string;
    };

    const existing = await getPrisma().lockerRental.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "대여 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (note !== undefined) updateData.note = note?.trim() || null;

    const rental = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.lockerRental.update({
        where: { id: params.id },
        data: updateData,
        include: { student: { select: { name: true } } },
      });

      // When returning, mark locker as AVAILABLE
      if (status === RentalStatus.RETURNED || status === RentalStatus.CANCELLED) {
        await tx.locker.update({
          where: { id: existing.lockerId },
          data: { status: LockerStatus.AVAILABLE },
        });
      }

      return updated;
    });

    return NextResponse.json({ rental });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
