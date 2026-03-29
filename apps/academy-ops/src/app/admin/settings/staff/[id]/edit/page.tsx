import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StaffEditForm, type StaffEditData } from "./staff-edit-form";

export const dynamic = "force-dynamic";

export default async function StaffEditPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireAdminContext(AdminRole.DIRECTOR);

  const { id } = params;

  // Cannot edit own account via this page
  if (ctx.adminUser.id === id) {
    return (
      <div className="p-8 sm:p-10">
        <div className="rounded-[16px] bg-amber-50 border border-amber-200 px-6 py-5 text-amber-700 text-sm">
          본인 계정은 이 페이지에서 수정할 수 없습니다.
          <a
            href={`/admin/settings/staff/${id}`}
            className="ml-3 underline hover:no-underline"
          >
            돌아가기
          </a>
        </div>
      </div>
    );
  }

  const adminUser = await getPrisma().adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      staff: {
        select: {
          role: true,
          note: true,
        },
      },
    },
  });

  if (!adminUser) notFound();

  // Parse shareRatio from staff.note JSON
  let shareRatio: number | null = null;
  if (adminUser.staff?.note) {
    try {
      const noteData = JSON.parse(adminUser.staff.note) as Record<string, unknown>;
      if (typeof noteData.shareRatio === "number") {
        shareRatio = noteData.shareRatio;
      }
    } catch {
      // ignore parse error
    }
  }

  const data: StaffEditData = {
    id: adminUser.id,
    name: adminUser.name,
    phone: adminUser.phone,
    role: adminUser.role,
    isActive: adminUser.isActive,
    staffRole: adminUser.staff?.role ?? null,
    shareRatio,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/admin/settings/staff"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          직원 목록
        </a>
        <span className="text-ink/20">/</span>
        <a
          href={`/admin/settings/staff/${id}`}
          className="text-sm text-slate hover:text-ink transition"
        >
          {adminUser.name}
        </a>
        <span className="text-ink/20">/</span>
        <span className="text-sm text-ink font-medium">수정</span>
      </div>

      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정 · 직원 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">
        직원 수정: {adminUser.name}
      </h1>
      <p className="mt-2 text-sm text-slate">
        {adminUser.email}
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate sm:text-base">
        직원의 이름, 연락처, 권한 역할, 직무, 계정 상태를 수정합니다.
      </p>

      <div className="mt-8">
        <StaffEditForm data={data} />
      </div>
    </div>
  );
}
