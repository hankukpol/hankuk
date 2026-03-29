/**
 * 사물함 208개 시드 스크립트
 * 실행: cd web && npx tsx scripts/seed-lockers.ts
 *
 * 배치:
 * - 1강의실 방향: 1~120 (CLASS_ROOM)
 * - 지덕 좌: A-1~A-40 (JIDEOK_LEFT)
 * - 지덕 우: 121~168 (JIDEOK_RIGHT)
 */

import { getPrisma } from "../src/lib/prisma";
import { LockerZone } from "@prisma/client";

async function main() {
  const prisma = getPrisma();

  const lockers: Array<{
    zone: LockerZone;
    lockerNumber: string;
    row: number;
    col: number;
  }> = [];

  // 1강의실 방향: 1~120 (지그재그 배치, 10열 × 12행)
  for (let n = 1; n <= 120; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / 10) + 1;
    const col = (idx % 10) + 1;
    lockers.push({ zone: LockerZone.CLASS_ROOM, lockerNumber: String(n), row, col });
  }

  // 지덕 좌: A-1~A-40 (5열 × 8행)
  for (let n = 1; n <= 40; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / 5) + 1;
    const col = (idx % 5) + 1;
    lockers.push({ zone: LockerZone.JIDEOK_LEFT, lockerNumber: `A-${n}`, row, col });
  }

  // 지덕 우: 121~168 (6열 × 8행)
  for (let n = 121; n <= 168; n++) {
    const idx = n - 121;
    const row = Math.floor(idx / 6) + 1;
    const col = (idx % 6) + 1;
    lockers.push({ zone: LockerZone.JIDEOK_RIGHT, lockerNumber: String(n), row, col });
  }

  console.log(`총 ${lockers.length}개 사물함 시드 중...`);

  let created = 0;
  let skipped = 0;

  for (const locker of lockers) {
    const existing = await prisma.locker.findUnique({
      where: { zone_lockerNumber: { zone: locker.zone, lockerNumber: locker.lockerNumber } },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.locker.create({ data: locker });
    created++;
  }

  console.log(`완료: ${created}개 생성, ${skipped}개 이미 존재`);
}

main().catch(console.error);
