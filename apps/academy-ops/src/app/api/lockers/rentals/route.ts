import { AdminRole, RentalFeeUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rentals = await getPrisma().lockerRental.findMany({
      include: {
        locker: { select: { lockerNumber: true, zone: true } },
        student: { select: { name: true, examNumber: true } },
      },
      orderBy: { endDate: "asc" },
    });

    return NextResponse.json({ data: rentals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { lockerId, examNumber, startDate, endDate, feeAmount, feeUnit, note } = body as {
      lockerId: string;
      examNumber: string;
      startDate: string;
      endDate?: string | null;
      feeAmount?: number;
      feeUnit?: RentalFeeUnit;
      note?: string | null;
    };

    if (!lockerId?.trim()) {
      return NextResponse.json({ error: "사물함을 선택하세요." }, { status: 400 });
    }
    if (!examNumber?.trim()) {
      return NextResponse.json({ error: "학생을 선택하세요." }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: "시작일을 입력하세요." }, { status: 400 });
    }

    const locker = await getPrisma().locker.findUnique({ where: { id: lockerId } });
    if (!locker) {
      return NextResponse.json({ error: "사물함을 찾을 수 없습니다." }, { status: 404 });
    }

    const student = await getPrisma().student.findUnique({ where: { examNumber } });
    if (!student) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    const rental = await getPrisma().$transaction(async (tx) => {
      const r = await tx.lockerRental.create({
        data: {
          lockerId,
          examNumber,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          feeUnit: feeUnit ?? RentalFeeUnit.MONTHLY,
          feeAmount: feeAmount ? Number(feeAmount) : 0,
          note: note?.trim() || null,
          createdBy: auth.context.adminUser.id,
        },
        include: {
          locker: { select: { lockerNumber: true, zone: true } },
          student: { select: { name: true, examNumber: true } },
        },
      });

      await tx.locker.update({
        where: { id: lockerId },
        data: { status: "IN_USE" },
      });

      return r;
    });

    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
