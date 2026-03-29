import { RentalStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

const VALID_MONTHS = [1, 3, 6] as const;
type ExtendMonths = (typeof VALID_MONTHS)[number];

export async function POST(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const examNumber = auth.student.examNumber;

  let months: ExtendMonths;
  try {
    const body = (await request.json()) as { months?: unknown };
    const raw = Number(body.months);
    if (!VALID_MONTHS.includes(raw as ExtendMonths)) {
      return NextResponse.json(
        { error: "연장 기간은 1, 3, 6개월 중 하나여야 합니다." },
        { status: 400 },
      );
    }
    months = raw as ExtendMonths;
  } catch {
    return NextResponse.json(
      { error: "요청 본문을 파싱할 수 없습니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Find the student's active locker rental
  const rental = await prisma.lockerRental.findFirst({
    where: {
      examNumber,
      status: RentalStatus.ACTIVE,
    },
    include: {
      locker: {
        select: { id: true, zone: true, lockerNumber: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  if (!rental) {
    return NextResponse.json(
      { error: "현재 대여 중인 사물함이 없습니다." },
      { status: 404 },
    );
  }

  // Compute new end date: extend from current endDate (or today if null)
  const base = rental.endDate ? new Date(rental.endDate) : new Date();
  base.setMonth(base.getMonth() + months);
  // Keep as date-only (midnight UTC) to match @db.Date semantics
  const newEndDate = new Date(
    Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()),
  );

  const updated = await prisma.lockerRental.update({
    where: { id: rental.id },
    data: { endDate: newEndDate },
    include: {
      locker: {
        select: { id: true, zone: true, lockerNumber: true },
      },
    },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      lockerId: updated.lockerId,
      lockerNumber: updated.locker.lockerNumber,
      zone: updated.locker.zone,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate?.toISOString() ?? null,
      status: updated.status,
      feeUnit: updated.feeUnit,
      feeAmount: updated.feeAmount,
      extendedMonths: months,
    },
  });
}
