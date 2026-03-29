import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/exams/monthly/[eventId]/registrations/[regId]
// 납부 여부 / 좌석번호 수정
export async function PATCH(
  request: NextRequest,
  context: { params: { eventId: string; regId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId, regId } = await context.params;

  try {
    const body = await request.json();
    const { isPaid, paidAmount, seatNumber } = body;

    const existing = await getPrisma().examRegistration.findFirst({
      where: { id: regId, examEventId: eventId },
    });
    if (!existing) throw new Error("접수 정보를 찾을 수 없습니다.");
    if (existing.cancelledAt) throw new Error("이미 취소된 접수입니다.");

    const updateData: {
      isPaid?: boolean;
      paidAmount?: number;
      paidAt?: Date | null;
      seatNumber?: string | null;
    } = {};

    if (typeof isPaid === "boolean") {
      updateData.isPaid = isPaid;
      if (isPaid && !existing.paidAt) {
        updateData.paidAt = new Date();
        updateData.paidAmount = paidAmount !== undefined ? Number(paidAmount) : existing.paidAmount;
      } else if (!isPaid) {
        updateData.paidAt = null;
      }
    }

    if (paidAmount !== undefined) {
      updateData.paidAmount = Number(paidAmount);
    }

    if (seatNumber !== undefined) {
      updateData.seatNumber = seatNumber?.trim() || null;
    }

    const registration = await getPrisma().examRegistration.update({
      where: { id: regId },
      data: updateData,
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
          },
        },
      },
    });

    return NextResponse.json({ registration });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

// DELETE /api/exams/monthly/[eventId]/registrations/[regId] — 취소
export async function DELETE(
  _request: NextRequest,
  context: { params: { eventId: string; regId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId, regId } = await context.params;

  try {
    const existing = await getPrisma().examRegistration.findFirst({
      where: { id: regId, examEventId: eventId },
    });
    if (!existing) throw new Error("접수 정보를 찾을 수 없습니다.");
    if (existing.cancelledAt) throw new Error("이미 취소된 접수입니다.");

    await getPrisma().examRegistration.update({
      where: { id: regId },
      data: { cancelledAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "취소 실패" },
      { status: 400 },
    );
  }
}
