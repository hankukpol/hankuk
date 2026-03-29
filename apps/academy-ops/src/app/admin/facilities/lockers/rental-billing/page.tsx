import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerRentalBillingClient } from "./locker-rental-billing-client";

export const dynamic = "force-dynamic";

export type RentalRow = {
  id: string;
  lockerId: string;
  lockerNumber: string;
  zone: string;
  examNumber: string;
  studentName: string;
  startDate: string;
  endDate: string | null;
  feeAmount: number;
  feeUnit: string;
  status: string;
  paidAt: string | null;
  note: string | null;
};

export default async function LockerRentalBillingPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const [rentals, unpaidCount, expiringSoonCount, monthlyRevenue] = await Promise.all([
    getPrisma().lockerRental.findMany({
      where: {
        status: { in: ["ACTIVE", "EXPIRED"] },
      },
      include: {
        locker: { select: { lockerNumber: true, zone: true } },
        student: { select: { name: true, examNumber: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    getPrisma().lockerRental.count({
      where: {
        status: "ACTIVE",
        paidAt: null,
      },
    }),
    getPrisma().lockerRental.count({
      where: {
        status: "ACTIVE",
        endDate: { gte: today, lte: sevenDaysLater },
      },
    }),
    getPrisma().lockerRental.aggregate({
      where: {
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { feeAmount: true },
    }),
  ]);

  const rows: RentalRow[] = rentals.map((r) => ({
    id: r.id,
    lockerId: r.lockerId,
    lockerNumber: r.locker.lockerNumber,
    zone: r.locker.zone,
    examNumber: r.examNumber,
    studentName: r.student.name,
    startDate: r.startDate.toISOString().split("T")[0],
    endDate: r.endDate ? r.endDate.toISOString().split("T")[0] : null,
    feeAmount: r.feeAmount,
    feeUnit: r.feeUnit,
    status: r.status,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    note: r.note,
  }));

  const kpi = {
    totalRentals: rentals.length,
    expiringSoon: expiringSoonCount,
    unpaidCount,
    monthlyRevenue: monthlyRevenue._sum.feeAmount ?? 0,
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사물함 임대료 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        사물함 대여 현황과 임대료 납부 상태를 관리합니다. 만료 임박 및 미납 건을 확인하고 납부 처리 또는 연장할 수 있습니다.
      </p>

      <div className="mt-8">
        <LockerRentalBillingClient initialRentals={rows} kpi={kpi} />
      </div>
    </div>
  );
}
