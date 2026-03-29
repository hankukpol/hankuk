import { AdminRole, LockerStatus, RentalFeeUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// POST /api/lockers/[id]/rentals
// Quick-assign a locker to a student from the locker grid.
// Body: { examNumber, startDate, endDate?, feeUnit?, feeAmount?, note? }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      examNumber: string;
      startDate: string;
      endDate?: string | null;
      feeUnit?: RentalFeeUnit;
      feeAmount?: number | null;
      note?: string | null;
    };

    const { examNumber, startDate, endDate, feeUnit, feeAmount, note } = body;

    if (!examNumber?.trim()) {
      return NextResponse.json({ error: "학생을 선택하세요." }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: "시작일을 입력하세요." }, { status: 400 });
    }

    const locker = await getPrisma().locker.findUnique({ where: { id: params.id } });
    if (!locker) {
      return NextResponse.json({ error: "사물함을 찾을 수 없습니다." }, { status: 404 });
    }
    if (
      locker.status !== LockerStatus.AVAILABLE &&
      locker.status !== LockerStatus.RESERVED
    ) {
      return NextResponse.json({ error: "사용 가능한 사물함이 아닙니다." }, { status: 400 });
    }

    const student = await getPrisma().student.findUnique({ where: { examNumber } });
    if (!student) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    const rental = await getPrisma().$transaction(async (tx) => {
      const r = await tx.lockerRental.create({
        data: {
          lockerId: params.id,
          examNumber,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          feeUnit: feeUnit ?? RentalFeeUnit.MONTHLY,
          feeAmount: feeAmount ? Number(feeAmount) : 0,
          note: note?.trim() || null,
          createdBy: auth.context.adminUser.id,
        },
        include: {
          student: { select: { name: true, examNumber: true, generation: true } },
          locker: { select: { lockerNumber: true, zone: true } },
        },
      });

      await tx.locker.update({
        where: { id: params.id },
        data: { status: LockerStatus.IN_USE },
      });

      return r;
    });

    return NextResponse.json({ data: rental }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배정 실패" },
      { status: 400 },
    );
  }
}

// GET /api/lockers/[id]/rentals
// List all rentals for a given locker (history).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rentals = await getPrisma().lockerRental.findMany({
      where: { lockerId: params.id },
      include: {
        student: { select: { name: true, examNumber: true, generation: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ data: rentals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
