import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerMapClient } from "./locker-map-client";

export const dynamic = "force-dynamic";

export type LockerWithRental = {
  id: string;
  zone: string;
  lockerNumber: string;
  row: number | null;
  col: number | null;
  status: string;
  note: string | null;
  rentals: Array<{
    id: string;
    examNumber: string;
    startDate: string;
    endDate: string | null;
    feeAmount: number;
    feeUnit: string;
    status: string;
    student: {
      name: string;
      examNumber: string;
      generation: number | null;
    };
  }>;
};

export default async function LockersPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const rawLockers = await getPrisma().locker.findMany({
    include: {
      rentals: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        include: {
          student: {
            select: { name: true, examNumber: true, generation: true },
          },
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  const lockers: LockerWithRental[] = rawLockers.map((locker) => ({
    ...locker,
    rentals: locker.rentals.map((rental) => ({
      id: rental.id,
      examNumber: rental.examNumber,
      startDate: rental.startDate.toISOString(),
      endDate: rental.endDate?.toISOString() ?? null,
      feeAmount: rental.feeAmount,
      feeUnit: rental.feeUnit,
      status: rental.status,
      student: rental.student,
    })),
  }));

  const total = lockers.length;
  const inUse = lockers.filter((locker) => locker.status === "IN_USE").length;
  const available = lockers.filter((locker) => locker.status === "AVAILABLE").length;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
            시설 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">사물함 배치도</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            구역별 사물함의 현재 상태를 배치도 형태로 확인하고, 선택한 사물함의 배정과 반납을 바로 처리합니다.
            총 <span className="font-semibold text-ink">{total}개</span> 중{" "}
            <span className="font-semibold text-ember">{inUse}개</span> 사용 중,{" "}
            <span className="font-semibold text-forest">{available}개</span>가 비어 있습니다.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/facilities/lockers/layout"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            배치도 편집
          </Link>
          <Link
            href="/admin/settings/lockers"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            초기 설정
          </Link>
        </div>
      </div>

      {total === 0 && (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          사물함이 없습니다.{" "}
          <Link
            href="/admin/settings/lockers"
            className="font-semibold underline underline-offset-2"
          >
            사물함 초기 설정
          </Link>
          에서 먼저 사물함을 생성해 주세요.
        </div>
      )}

      <div className="mt-8">
        <LockerMapClient initialLockers={lockers} />
      </div>
    </div>
  );
}
