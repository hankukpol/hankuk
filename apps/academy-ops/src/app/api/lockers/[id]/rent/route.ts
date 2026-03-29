import { AdminRole, LockerStatus, RentalFeeUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, startDate, endDate, feeUnit, feeAmount, note } = body;

    if (!examNumber || !startDate) {
      return NextResponse.json({ error: "학생과 시작일을 입력하세요." }, { status: 400 });
    }

    const locker = await getPrisma().locker.findUnique({ where: { id: params.id } });
    if (!locker) {
      return NextResponse.json({ error: "사물함을 찾을 수 없습니다." }, { status: 404 });
    }
    if (locker.status !== LockerStatus.AVAILABLE && locker.status !== LockerStatus.RESERVED) {
      return NextResponse.json({ error: "사용 가능한 사물함이 아닙니다." }, { status: 400 });
    }

    const rental = await getPrisma().$transaction(async (tx) => {
      const r = await tx.lockerRental.create({
        data: {
          lockerId: params.id,
          examNumber,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          feeUnit: (feeUnit as RentalFeeUnit) ?? RentalFeeUnit.MONTHLY,
          feeAmount: feeAmount ? Number(feeAmount) : 0,
          note: note?.trim() || null,
          createdBy: auth.context.adminUser.id,
        },
        include: {
          student: { select: { name: true, generation: true } },
        },
      });

      await tx.locker.update({
        where: { id: params.id },
        data: { status: LockerStatus.IN_USE },
      });

      return r;
    });

    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "대여 처리 실패" },
      { status: 400 },
    );
  }
}
