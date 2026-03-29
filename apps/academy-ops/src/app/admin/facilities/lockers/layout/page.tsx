import { AdminRole, LockerStatus, LockerZone } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerLayoutEditor } from "./locker-layout-editor";

export const dynamic = "force-dynamic";

export type LockerLayoutRow = {
  id: string;
  zone: LockerZone;
  lockerNumber: string;
  row: number | null;
  col: number | null;
  status: LockerStatus;
};

export default async function LockerLayoutPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const rawLockers = await getPrisma().locker.findMany({
    select: {
      id: true,
      zone: true,
      lockerNumber: true,
      row: true,
      col: true,
      status: true,
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  const lockers: LockerLayoutRow[] = rawLockers.map((locker) => ({
    id: locker.id,
    zone: locker.zone,
    lockerNumber: locker.lockerNumber,
    row: locker.row,
    col: locker.col,
    status: locker.status,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
            시설 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">사물함 배치도 편집</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            구역별 사물함의 행과 열 좌표를 조정하고, 실제 배치도를 미리보며 저장합니다.
            비어 있는 좌표는 배치도에 표시되지 않으며, 같은 구역 안에서 좌표가 겹치면 저장할 수 없습니다.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/settings/lockers"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            초기 설정
          </Link>
          <Link
            href="/admin/facilities/lockers"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            운영 화면
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <LockerLayoutEditor initialLockers={lockers} />
      </div>
    </div>
  );
}
