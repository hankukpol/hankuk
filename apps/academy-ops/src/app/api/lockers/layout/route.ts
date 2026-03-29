import { AdminRole, LockerZone } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type LayoutPlacement = {
  id: string;
  row: number | null;
  col: number | null;
};

function isPositiveInt(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const lockers = await getPrisma().locker.findMany({
    select: {
      id: true,
      zone: true,
      lockerNumber: true,
      row: true,
      col: true,
      status: true,
      note: true,
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  return NextResponse.json({ data: lockers });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      zone?: LockerZone;
      placements?: LayoutPlacement[];
    };

    const zone = body.zone;
    const placements = Array.isArray(body.placements) ? body.placements : [];

    if (!zone || !Object.values(LockerZone).includes(zone)) {
      return NextResponse.json({ error: "구역을 선택해 주세요." }, { status: 400 });
    }

    if (placements.length === 0) {
      return NextResponse.json({ error: "저장할 배치 정보가 없습니다." }, { status: 400 });
    }

    const lockers = await getPrisma().locker.findMany({
      where: { zone },
      select: {
        id: true,
        zone: true,
      },
    });

    const lockerIds = new Set(lockers.map((locker) => locker.id));
    const seenIds = new Set<string>();
    const seenCells = new Set<string>();

    for (const placement of placements) {
      if (!placement?.id || !lockerIds.has(placement.id)) {
        return NextResponse.json(
          { error: "선택한 구역에 없는 사물함이 포함되어 있습니다." },
          { status: 400 },
        );
      }

      if (seenIds.has(placement.id)) {
        return NextResponse.json({ error: "중복된 사물함 배치가 포함되어 있습니다." }, { status: 400 });
      }
      seenIds.add(placement.id);

      const row = placement.row;
      const col = placement.col;
      const hasRow = row !== null && row !== undefined;
      const hasCol = col !== null && col !== undefined;

      if (hasRow !== hasCol) {
        return NextResponse.json(
          { error: "행과 열은 함께 입력하거나 함께 비워야 합니다." },
          { status: 400 },
        );
      }

      if (!hasRow || !hasCol) {
        continue;
      }

      if (!isPositiveInt(row) || !isPositiveInt(col)) {
        return NextResponse.json(
          { error: "행과 열은 1 이상의 정수여야 합니다." },
          { status: 400 },
        );
      }

      const cellKey = `${row}:${col}`;
      if (seenCells.has(cellKey)) {
        return NextResponse.json(
          { error: "같은 구역 안에서는 좌표가 겹칠 수 없습니다." },
          { status: 400 },
        );
      }
      seenCells.add(cellKey);
    }

    await getPrisma().$transaction(
      placements.map((placement) =>
        getPrisma().locker.update({
          where: { id: placement.id },
          data: {
            row: placement.row,
            col: placement.col,
          },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배치 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
