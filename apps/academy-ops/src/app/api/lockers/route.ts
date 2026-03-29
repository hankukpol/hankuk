import { AdminRole, LockerStatus, LockerZone } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const lockers = await getPrisma().locker.findMany({
    include: {
      rentals: {
        where: { status: "ACTIVE" },
        include: {
          student: { select: { name: true, generation: true } },
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  return NextResponse.json({ lockers });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { zone, lockerNumber, row, col, note } = body as {
      zone: LockerZone;
      lockerNumber: string;
      row?: number;
      col?: number;
      note?: string;
    };

    if (!zone || !Object.values(LockerZone).includes(zone)) {
      return NextResponse.json({ error: "구역을 선택하세요." }, { status: 400 });
    }
    if (!lockerNumber?.trim()) {
      return NextResponse.json({ error: "사물함 번호를 입력하세요." }, { status: 400 });
    }

    const locker = await getPrisma().locker.create({
      data: {
        zone,
        lockerNumber: lockerNumber.trim(),
        row: row ?? null,
        col: col ?? null,
        note: note?.trim() || null,
      },
    });

    return NextResponse.json({ locker }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { id, status, note } = body as { id: string; status?: LockerStatus; note?: string };

    if (!id) return NextResponse.json({ error: "사물함 ID가 필요합니다." }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (note !== undefined) updateData.note = note?.trim() || null;

    const locker = await getPrisma().locker.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ locker });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
