import { AdminRole, RentalStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { endDate, fee, feeAmount, feeUnit, note, isPaid, status } = body as {
      endDate?: string | null;
      fee?: number;
      feeAmount?: number;
      feeUnit?: string;
      note?: string | null;
      isPaid?: boolean;
      status?: RentalStatus;
    };

    const existing = await getPrisma().lockerRental.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "대여 내역을 찾을 수 없습니다." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (feeAmount !== undefined) updateData.feeAmount = Number(feeAmount);
    if (fee !== undefined) updateData.feeAmount = Number(fee);
    if (feeUnit !== undefined) updateData.feeUnit = feeUnit;
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (isPaid !== undefined) {
      updateData.paidAt = isPaid ? new Date() : null;
    }

    // If extending endDate for an EXPIRED rental, reactivate it
    if (endDate && existing.status === "EXPIRED") {
      const newEnd = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newEnd >= today) {
        updateData.status = RentalStatus.ACTIVE;
      }
    }

    const rental = await getPrisma().lockerRental.update({
      where: { id },
      data: updateData,
      include: {
        locker: { select: { lockerNumber: true, zone: true } },
        student: { select: { name: true, examNumber: true } },
      },
    });

    return NextResponse.json({ rental });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
