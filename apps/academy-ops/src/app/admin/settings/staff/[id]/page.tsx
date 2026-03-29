import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StaffDetailClient } from "./staff-detail-client";

export const dynamic = "force-dynamic";

export type StaffDetail = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  staffRole: string | null;
  staffMobile: string | null;
  staffNote: string | null;
  lastLoginAt: string | null;
};

export default async function StaffDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireAdminContext(AdminRole.MANAGER);
  const isSuperAdmin = ctx.adminUser.role === AdminRole.SUPER_ADMIN;

  const { id } = params;

  const adminUser = await getPrisma().adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      staff: {
        select: {
          role: true,
          mobile: true,
          note: true,
          lastLoginAt: true,
          isActive: true,
        },
      },
    },
  });

  if (!adminUser) notFound();

  const detail: StaffDetail = {
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    phone: adminUser.phone,
    role: adminUser.role,
    isActive: adminUser.isActive,
    createdAt: adminUser.createdAt.toISOString(),
    updatedAt: adminUser.updatedAt.toISOString(),
    staffRole: adminUser.staff?.role ?? null,
    staffMobile: adminUser.staff?.mobile ?? null,
    staffNote: adminUser.staff?.note ?? null,
    lastLoginAt: adminUser.staff?.lastLoginAt?.toISOString() ?? null,
  };

  return (
    <div className="p-8 sm:p-10">
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
        <span className="text-sm text-ink font-medium">{adminUser.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
            설정 · 직원 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">
            직원 상세: {adminUser.name}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            직원의 권한 역할, 직무, 계정 상태를 확인하고 변경합니다.
          </p>
        </div>
        {isSuperAdmin && ctx.adminUser.id !== id && (
          <a
            href={`/admin/settings/staff/${id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 mt-5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            수정
          </a>
        )}
      </div>

      <div className="mt-8">
        <StaffDetailClient
          detail={detail}
          isSuperAdmin={isSuperAdmin}
          isSelf={ctx.adminUser.id === id}
        />
      </div>
    </div>
  );
}
