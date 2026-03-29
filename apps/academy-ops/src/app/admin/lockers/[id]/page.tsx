import { AdminRole, LockerStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerDetailClient } from "./locker-detail-client";
import { LOCKER_ZONE_LABEL } from "@/lib/constants";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function LockerDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);
  const { id } = await params;

  const locker = await getPrisma().locker.findUnique({
    where: { id },
    include: {
      rentals: {
        include: {
          student: { select: { examNumber: true, name: true, phone: true } },
          creator: { select: { name: true } },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!locker) notFound();

  const activeRental = locker.rentals.find(
    (r) => r.status === "ACTIVE",
  );

  const zoneName = LOCKER_ZONE_LABEL[locker.zone] ?? locker.zone;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "시설 관리", href: "/admin/lockers" },
          { label: "사물함", href: "/admin/lockers" },
          { label: `${zoneName} ${locker.lockerNumber}번` },
        ]}
      />
      <Link href="/admin/lockers" className="text-sm text-slate hover:text-ink">
        ← 사물함 현황
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        시설 관리
      </div>
      <div className="mt-5 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            {zoneName} — {locker.lockerNumber}번
          </h1>
          <p className="mt-1 text-sm text-slate">사물함 상세</p>
        </div>
        <StatusBadge status={locker.status} />
      </div>

      <LockerDetailClient
        locker={{
          id: locker.id,
          zone: locker.zone,
          lockerNumber: locker.lockerNumber,
          status: locker.status,
          note: locker.note,
          row: locker.row,
          col: locker.col,
        }}
        activeRental={
          activeRental
            ? {
                id: activeRental.id,
                examNumber: activeRental.student.examNumber,
                studentName: activeRental.student.name,
                phone: activeRental.student.phone,
                startDate: activeRental.startDate.toISOString(),
                endDate: activeRental.endDate?.toISOString() ?? null,
                feeAmount: activeRental.feeAmount,
                feeUnit: activeRental.feeUnit,
                status: activeRental.status,
              }
            : null
        }
        rentalHistory={locker.rentals.slice(0, 20).map((r) => ({
          id: r.id,
          examNumber: r.student.examNumber,
          studentName: r.student.name,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate?.toISOString() ?? null,
          feeAmount: r.feeAmount,
          feeUnit: r.feeUnit,
          status: r.status,
          creatorName: r.creator.name,
        }))}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: LockerStatus }) {
  const map: Record<LockerStatus, { label: string; cls: string }> = {
    AVAILABLE: { label: "사용 가능", cls: "bg-green-100 text-green-700" },
    IN_USE: { label: "사용 중", cls: "bg-amber-100 text-amber-700" },
    RESERVED: { label: "예약됨", cls: "bg-sky-100 text-sky-700" },
    BROKEN: { label: "고장", cls: "bg-red-100 text-red-700" },
    BLOCKED: { label: "사용 불가", cls: "bg-gray-100 text-gray-500" },
  };
  const item = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${item.cls}`}
    >
      {item.label}
    </span>
  );
}
