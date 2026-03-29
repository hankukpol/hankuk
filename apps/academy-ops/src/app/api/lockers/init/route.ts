import { AdminRole, LockerZone } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// ─── Locker layout ─────────────────────────────────────────────────────────────
// Zone CLASS_ROOM : 1강의실 방향, lockers 1 ~ 120
// Zone JIDEOK_LEFT: 지덕 좌, lockers A-1 ~ A-40
// Zone JIDEOK_RIGHT: 지덕 우, lockers 121 ~ 168

type LockerSeed = {
  zone: LockerZone;
  lockerNumber: string;
  row: number | null;
  col: number | null;
};

function buildSeeds(): LockerSeed[] {
  const seeds: LockerSeed[] = [];

  // CLASS_ROOM: 1 ~ 120, 12 columns × 10 rows
  for (let n = 1; n <= 120; n++) {
    const row = Math.ceil(n / 12);
    const col = ((n - 1) % 12) + 1;
    seeds.push({
      zone: LockerZone.CLASS_ROOM,
      lockerNumber: String(n),
      row,
      col,
    });
  }

  // JIDEOK_LEFT: A-1 ~ A-40, 8 columns × 5 rows
  for (let n = 1; n <= 40; n++) {
    const row = Math.ceil(n / 8);
    const col = ((n - 1) % 8) + 1;
    seeds.push({
      zone: LockerZone.JIDEOK_LEFT,
      lockerNumber: `A-${n}`,
      row,
      col,
    });
  }

  // JIDEOK_RIGHT: 121 ~ 168, 8 columns × 6 rows
  for (let n = 121; n <= 168; n++) {
    const offset = n - 121; // 0-based
    const row = Math.floor(offset / 8) + 1;
    const col = (offset % 8) + 1;
    seeds.push({
      zone: LockerZone.JIDEOK_RIGHT,
      lockerNumber: String(n),
      row,
      col,
    });
  }

  return seeds;
}

export async function POST(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const seeds = buildSeeds();
  const prisma = getPrisma();

  // Fetch already-existing locker keys to make this idempotent
  const existing = await prisma.locker.findMany({
    select: { zone: true, lockerNumber: true },
  });

  const existingKeys = new Set(
    existing.map((l) => `${l.zone}::${l.lockerNumber}`),
  );

  const toCreate = seeds.filter(
    (s) => !existingKeys.has(`${s.zone}::${s.lockerNumber}`),
  );

  let created = 0;
  const skipped = seeds.length - toCreate.length;

  if (toCreate.length > 0) {
    const result = await prisma.locker.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    created = result.count;
  }

  return NextResponse.json(
    { data: { created, skipped, total: seeds.length } },
    { status: 201 },
  );
}
