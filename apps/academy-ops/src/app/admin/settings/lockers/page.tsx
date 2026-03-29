import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerSettingsManager } from "./locker-settings-manager";

export const dynamic = "force-dynamic";

export type LockerRow = {
  id: string;
  zone: "CLASS_ROOM" | "JIDEOK_LEFT" | "JIDEOK_RIGHT";
  lockerNumber: string;
  status: "AVAILABLE" | "IN_USE" | "RESERVED" | "BROKEN" | "BLOCKED";
  note: string | null;
  hasActiveRental: boolean;
};

export default async function LockerSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const lockers = await getPrisma().locker.findMany({
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
    include: {
      rentals: {
        where: { status: "ACTIVE" },
        take: 1,
      },
    },
  });

  const rows: LockerRow[] = lockers.map((l) => ({
    id: l.id,
    zone: l.zone as LockerRow["zone"],
    lockerNumber: l.lockerNumber,
    status: l.status as LockerRow["status"],
    note: l.note,
    hasActiveRental: l.rentals.length > 0,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사물함 초기 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        사물함을 구역별로 일괄 생성합니다. 생성된 사물함은 사물함 현황판에서 배정·반납을 관리합니다.
        기본 예시: 1강의실 방향(1~120), 좌측 라인(A-1~A-40), 우측 라인(121~168) — 총 208개
      </p>
      <div className="mt-8">
        <LockerSettingsManager initialLockers={rows} />
      </div>
    </div>
  );
}
