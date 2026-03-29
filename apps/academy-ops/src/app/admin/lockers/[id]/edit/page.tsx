import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LOCKER_ZONE_LABEL } from "@/lib/constants";
import { LockerEditForm } from "./locker-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function LockerEditPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const locker = await getPrisma().locker.findUnique({
    where: { id },
    include: {
      rentals: {
        where: { status: "ACTIVE" },
        include: {
          student: { select: { examNumber: true, name: true, phone: true } },
        },
        take: 1,
      },
    },
  });

  if (!locker) notFound();

  const activeRental = locker.rentals[0] ?? null;
  const zoneName = LOCKER_ZONE_LABEL[locker.zone] ?? locker.zone;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/lockers" className="hover:text-ink">
          사물함 현황
        </Link>
        <span>/</span>
        <Link href={`/admin/lockers/${id}`} className="hover:text-ink">
          {zoneName} — {locker.lockerNumber}번
        </Link>
        <span>/</span>
        <span className="text-ink">수정</span>
      </nav>

      <div className="mt-4 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        시설 관리
      </div>

      <div className="mt-5">
        <h1 className="text-3xl font-semibold">
          {zoneName} — {locker.lockerNumber}번 수정
        </h1>
        <p className="mt-1 text-sm text-slate">사물함 상태 및 메모를 수정합니다.</p>
      </div>

      <LockerEditForm
        locker={{
          id: locker.id,
          lockerNumber: locker.lockerNumber,
          zone: locker.zone,
          zoneName,
          status: locker.status,
          note: locker.note,
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
              }
            : null
        }
      />
    </div>
  );
}
