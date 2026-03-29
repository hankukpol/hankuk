import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerMaintenanceClient } from "./locker-maintenance-client";

export const dynamic = "force-dynamic";

export type LockerRow = {
  id: string;
  zone: string;
  lockerNumber: string;
  status: string;
  note: string | null;
  updatedAt: string;
};

const ZONE_LABEL: Record<string, string> = {
  CLASS_ROOM: "1강의실",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

export default async function LockerMaintenancePage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Broken and blocked lockers
  const [brokenLockers, blockedLockers, fixedThisMonth, allLockers] = await Promise.all([
    prisma.locker.findMany({
      where: { status: "BROKEN" },
      orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
      select: {
        id: true,
        zone: true,
        lockerNumber: true,
        status: true,
        note: true,
        updatedAt: true,
      },
    }),
    prisma.locker.findMany({
      where: { status: "BLOCKED" },
      orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
      select: {
        id: true,
        zone: true,
        lockerNumber: true,
        status: true,
        note: true,
        updatedAt: true,
      },
    }),
    prisma.locker.count({
      where: {
        status: "AVAILABLE",
        updatedAt: { gte: startOfMonth },
      },
    }),
    prisma.locker.findMany({
      where: { status: { in: ["AVAILABLE", "IN_USE", "RESERVED"] } },
      orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
      select: { id: true, zone: true, lockerNumber: true, status: true, note: true },
    }),
  ]);

  const toRow = (l: {
    id: string;
    zone: string;
    lockerNumber: string;
    status: string;
    note: string | null;
    updatedAt: Date;
  }): LockerRow => ({
    id: l.id,
    zone: l.zone,
    lockerNumber: l.lockerNumber,
    status: l.status,
    note: l.note,
    updatedAt: l.updatedAt.toISOString(),
  });

  const serializedBroken = brokenLockers.map(toRow);
  const serializedBlocked = blockedLockers.map(toRow);

  const availableLockers = allLockers.map((l) => ({
    id: l.id,
    zone: l.zone,
    lockerNumber: l.lockerNumber,
    zoneLabel: ZONE_LABEL[l.zone] ?? l.zone,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 유지보수</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            고장·폐쇄 사물함을 관리합니다. 수리 완료·폐쇄 유지 처리 및 신규 고장 등록을 수행하세요.
          </p>
        </div>
        <Link
          href="/admin/lockers"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 전체 사물함
        </Link>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-3xl font-bold text-red-700">{serializedBroken.length}</p>
          <p className="mt-1 text-xs text-slate">고장</p>
        </div>
        <div className="rounded-[20px] border border-ink/20 bg-ink/5 p-5 text-center">
          <p className="text-3xl font-bold text-ink">{serializedBlocked.length}</p>
          <p className="mt-1 text-xs text-slate">폐쇄</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 text-center">
          <p className="text-3xl font-bold text-forest">{fixedThisMonth}</p>
          <p className="mt-1 text-xs text-slate">이번달 수리 완료</p>
        </div>
      </div>

      {/* Interactive management */}
      <div className="mt-8">
        <LockerMaintenanceClient
          brokenLockers={serializedBroken}
          blockedLockers={serializedBlocked}
          availableLockers={availableLockers}
          zoneLabel={ZONE_LABEL}
        />
      </div>
    </div>
  );
}
