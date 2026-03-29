import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPeriodWithSessions } from "@/lib/periods/service";
import { PeriodEditForm } from "./period-edit-form";

export const dynamic = "force-dynamic";

export default async function PeriodEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const { id: rawId } = await params;
  const periodId = Number(rawId);
  if (isNaN(periodId)) notFound();

  const period = await getPeriodWithSessions(periodId);
  if (!period) notFound();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/periods" className="transition hover:text-ember">
          시험 기간 관리
        </Link>
        <span>/</span>
        <Link
          href={`/admin/periods/${period.id}`}
          className="transition hover:text-ember"
        >
          {period.name}
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">수정</span>
      </div>

      <div className="mt-6">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          시험 기간 수정
        </div>
        <h1 className="mt-3 text-3xl font-semibold">{period.name} 수정</h1>
        <p className="mt-2 text-sm text-slate">
          기간의 기본 정보를 수정합니다. 회차 일정은 기간 관리 페이지에서 변경하세요.
        </p>
      </div>

      <PeriodEditForm
        period={{
          id: period.id,
          name: period.name,
          startDate: period.startDate.toISOString(),
          endDate: period.endDate.toISOString(),
          totalWeeks: period.totalWeeks,
          isActive: period.isActive,
          isGongchaeEnabled: period.isGongchaeEnabled,
          isGyeongchaeEnabled: period.isGyeongchaeEnabled,
        }}
      />
    </div>
  );
}
