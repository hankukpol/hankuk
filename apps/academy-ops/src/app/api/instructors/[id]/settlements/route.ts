import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({ where: { id } });
  if (!instructor) {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다." }, { status: 404 });
  }

  const settlements = await getPrisma().instructorSettlement.findMany({
    where: { instructorId: id },
    orderBy: { month: "desc" },
    take: 24,
  });

  return NextResponse.json({ data: settlements });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({ where: { id } });
  if (!instructor) {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { month, totalSessions, totalAmount, note } = body as {
      month: string;
      totalSessions: number;
      totalAmount: number;
      note?: string;
    };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "월 형식이 올바르지 않습니다. (YYYY-MM)" }, { status: 400 });
    }
    if (typeof totalSessions !== "number" || totalSessions < 0) {
      return NextResponse.json({ error: "수업 횟수를 올바르게 입력하세요." }, { status: 400 });
    }
    if (typeof totalAmount !== "number" || totalAmount < 0) {
      return NextResponse.json({ error: "정산 금액을 올바르게 입력하세요." }, { status: 400 });
    }

    const settlement = await getPrisma().instructorSettlement.upsert({
      where: { instructorId_month: { instructorId: id, month } },
      create: {
        instructorId: id,
        month,
        totalSessions,
        totalAmount,
        note: note ?? null,
      },
      update: {
        totalSessions,
        totalAmount,
        note: note ?? null,
      },
    });

    return NextResponse.json({ data: settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "정산 생성 실패" },
      { status: 400 },
    );
  }
}
