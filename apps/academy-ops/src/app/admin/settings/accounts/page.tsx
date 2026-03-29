import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { roleAtLeast } from "@/lib/auth";
import { AccountsManager, type AdminUserRow } from "./accounts-manager";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const ctx = await requireAdminContext(AdminRole.DIRECTOR);

  const admins = await getPrisma().adminUser.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const rows: AdminUserRow[] = admins.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    phone: a.phone,
    role: a.role,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  }));

  const isDirectorPlus = roleAtLeast(ctx.adminUser.role, AdminRole.DIRECTOR);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">관리자 계정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Supabase Auth와 연동된 관리자 계정을 관리합니다. 원장(DIRECTOR) 이상만 이
        페이지에 접근할 수 있습니다.
      </p>

      <div className="mt-8">
        <AccountsManager
          initialAdmins={rows}
          currentUserId={ctx.adminUser.id}
          currentUserRole={ctx.adminUser.role}
          isDirectorPlus={isDirectorPlus}
        />
      </div>
    </div>
  );
}
