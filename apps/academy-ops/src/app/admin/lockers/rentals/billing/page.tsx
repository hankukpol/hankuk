import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerBillingClient, type BillingRentalRow } from "./locker-billing-client";

export const dynamic = "force-dynamic";

export default async function LockerRentalBillingPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const rawRentals = await prisma.lockerRental.findMany({
    where: { status: "ACTIVE" },
    include: {
      locker: {
        select: {
          id: true,
          lockerNumber: true,
          zone: true,
        },
      },
      student: {
        select: {
          examNumber: true,
          name: true,
        },
      },
    },
    orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
  });

  const rentals: BillingRentalRow[] = rawRentals.map((r) => ({
    id: r.id,
    lockerNumber: r.locker.lockerNumber,
    zone: r.locker.zone,
    lockerId: r.locker.id,
    examNumber: r.student.examNumber,
    studentName: r.student.name,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate ? r.endDate.toISOString() : null,
    feeAmount: r.feeAmount,
    feeUnit: r.feeUnit,
    status: r.status,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    note: r.note,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb badge */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 대여 수납</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            활성 사물함 대여 목록과 요금 납부 현황을 관리합니다. 연체 대여를 필터링하고 납부
            처리를 할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/lockers/expiring"
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            만료 임박
          </Link>
          <Link
            href="/admin/lockers"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            ← 사물함 전체
          </Link>
        </div>
      </div>

      {/* Client component with data */}
      <div className="mt-8">
        <LockerBillingClient initialRentals={rentals} />
      </div>
    </div>
  );
}
