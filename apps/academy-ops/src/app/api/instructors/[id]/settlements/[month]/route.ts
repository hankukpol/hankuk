import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; month: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, month } = await params;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "월 형식이 올바르지 않습니다. (YYYY-MM)" }, { status: 400 });
  }

  const instructor = await getPrisma().instructor.findUnique({ where: { id } });
  if (!instructor) {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다." }, { status: 404 });
  }

  // Fetch stored settlement if exists
  const settlement = await getPrisma().instructorSettlement.findUnique({
    where: { instructorId_month: { instructorId: id, month } },
  });

  // Auto-calculate from SpecialLectureSubject + SpecialLecture for the given month
  // Find lectures that overlap with the target month
  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 0, 23, 59, 59);

  const subjects = await getPrisma().specialLectureSubject.findMany({
    where: { instructorId: id },
    include: {
      lecture: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Sessions = subjects whose parent lecture falls in the month
  const sessions = subjects
    .filter((s) => {
      const start = s.lecture.startDate;
      const end = s.lecture.endDate;
      return start <= monthEnd && end >= monthStart;
    })
    .map((s) => ({
      subjectId: s.id,
      subjectName: s.subjectName,
      lectureName: s.lecture.name,
      price: s.price,
      instructorRate: s.instructorRate,
      amount: Math.floor((s.price * s.instructorRate) / 100),
    }));

  const calculatedAmount = sessions.reduce((sum, s) => sum + s.amount, 0);

  return NextResponse.json({
    data: {
      settlement,
      calculatedAmount,
      calculatedSessions: sessions.length,
      sessions,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, month } = await params;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "월 형식이 올바르지 않습니다. (YYYY-MM)" }, { status: 400 });
  }

  const existing = await getPrisma().instructorSettlement.findUnique({
    where: { instructorId_month: { instructorId: id, month } },
  });
  if (!existing) {
    return NextResponse.json({ error: "정산 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { isPaid, paidAt, note } = body as {
      isPaid?: boolean;
      paidAt?: string;
      note?: string;
    };

    const data: {
      isPaid?: boolean;
      paidAt?: Date | null;
      note?: string | null;
    } = {};

    if (isPaid !== undefined) {
      data.isPaid = isPaid;
      if (isPaid) {
        data.paidAt = paidAt ? new Date(paidAt) : new Date();
      } else {
        data.paidAt = null;
      }
    }
    if (note !== undefined) data.note = note || null;

    const settlement = await getPrisma().instructorSettlement.update({
      where: { instructorId_month: { instructorId: id, month } },
      data,
    });

    return NextResponse.json({ data: settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
