import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerGrid } from "./locker-grid";

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
    student: { name: string; examNumber: string; generation: number | null };
  }>;
};

export default async function LockersPage() {
  await requireAdminContext(AdminRole.TEACHER);

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

  const lockers: LockerWithRental[] = rawLockers.map((l) => ({
    ...l,
    rentals: l.rentals.map((r) => ({
      id: r.id,
      examNumber: r.examNumber,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      feeAmount: r.feeAmount,
      feeUnit: r.feeUnit,
      status: r.status,
      student: r.student,
    })),
  }));

  const total = lockers.length;
  const inUse = lockers.filter((l) => l.status === "IN_USE").length;
  const available = lockers.filter((l) => l.status === "AVAILABLE").length;
  const broken = lockers.filter(
    (l) => l.status === "BROKEN" || l.status === "BLOCKED",
  ).length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 관리</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            구역별 사물함 현황을 조회하고 대여·반납을 처리합니다. 사물함을
            클릭하면 상세 정보와 배정 처리를 할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/lockers/analytics"
            className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
          >
            분석
          </Link>
          <Link
            href="/admin/lockers/expiring"
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            만료 임박
          </Link>
          <Link
            href="/admin/lockers/init"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-mist px-5 py-3 text-sm font-semibold text-ink transition hover:bg-ink/5"
          >
            일괄 초기화
          </Link>
          <Link
            href="/admin/lockers/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 새 사물함 등록
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center">
          <p className="text-2xl font-bold text-ink">{total}</p>
          <p className="mt-1 text-xs text-slate">전체</p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5 text-center">
          <p className="text-2xl font-bold text-ember">{inUse}</p>
          <p className="mt-1 text-xs text-slate">사용 중</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 text-center">
          <p className="text-2xl font-bold text-forest">{available}</p>
          <p className="mt-1 text-xs text-slate">공석</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 p-5 text-center">
          <p className="text-2xl font-bold text-slate">{broken}</p>
          <p className="mt-1 text-xs text-slate">사용 불가</p>
        </div>
      </div>

      {/* Grid component */}
      <div className="mt-8">
        <LockerGrid initialLockers={lockers} />
      </div>
    </div>
  );
}
