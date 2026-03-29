import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import { StaffManager } from "./staff-manager";

export const dynamic = "force-dynamic";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  staffRole: string | null;
  lastLoginAt: string | null;
  shareRatio: number | null;
};

export type StaffKpi = {
  total: number;
  active: number;
  todayLogin: number;
  roleDistribution: { role: AdminRole; count: number }[];
};

export default async function StaffPage() {
  const ctx = await requireAdminContext(AdminRole.MANAGER);
  const isSuperAdmin = ctx.adminUser.role === AdminRole.SUPER_ADMIN;

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // AdminUser 목록 (Staff 연결 포함)
  const staffList = await prisma.adminUser.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      staff: {
        select: {
          role: true,
          lastLoginAt: true,
          note: true,
        },
      },
    },
    orderBy: [{ role: "desc" }, { name: "asc" }],
  });

  const rows: StaffRow[] = staffList.map((s) => {
    let shareRatio: number | null = null;
    if (s.staff?.note) {
      try {
        const noteData = JSON.parse(s.staff.note) as Record<string, unknown>;
        if (typeof noteData.shareRatio === "number") {
          shareRatio = noteData.shareRatio;
        }
      } catch {
        // ignore
      }
    }
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      role: s.role,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      staffRole: s.staff?.role ?? null,
      lastLoginAt: s.staff?.lastLoginAt?.toISOString() ?? null,
      shareRatio,
    };
  });

  // KPI
  const total = rows.length;
  const active = rows.filter((r) => r.isActive).length;
  const todayLogin = staffList.filter(
    (s) => s.staff?.lastLoginAt && s.staff.lastLoginAt >= todayStart,
  ).length;

  // Role distribution (active only)
  const roleMap: Partial<Record<AdminRole, number>> = {};
  rows
    .filter((r) => r.isActive)
    .forEach((r) => {
      roleMap[r.role] = (roleMap[r.role] ?? 0) + 1;
    });
  const roleDistribution = (Object.entries(roleMap) as [AdminRole, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));

  const kpi: StaffKpi = { total, active, todayLogin, roleDistribution };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">직원 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        직원 계정의 권한 역할, 직무, 연락처를 관리합니다. SUPER_ADMIN만 직원을
        이메일로 초대하거나 계정을 비활성화할 수 있습니다.
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">전체 직원</p>
          <p className="mt-2 text-3xl font-bold text-ink">{total}</p>
          <p className="mt-1 text-xs text-slate">등록된 계정 수</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-sm text-forest">활성 직원</p>
          <p className="mt-2 text-3xl font-bold text-forest">{active}</p>
          <p className="mt-1 text-xs text-forest/60">현재 로그인 가능</p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm text-sky-700">오늘 로그인</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{todayLogin}</p>
          <p className="mt-1 text-xs text-sky-600/70">오늘 접속한 직원</p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-sm text-ember">역할별 분포</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {roleDistribution.length === 0 ? (
              <p className="text-2xl font-bold text-ember">-</p>
            ) : (
              roleDistribution.slice(0, 3).map(({ role, count }) => (
                <span
                  key={role}
                  className="rounded-full border border-ember/20 bg-white px-2 py-0.5 text-xs font-medium text-ember"
                >
                  {ROLE_LABEL[role]} {count}
                </span>
              ))
            )}
          </div>
          <p className="mt-1 text-xs text-ember/60">활성 직원 기준</p>
        </div>
      </div>

      {/* Manager */}
      <div className="mt-8">
        <StaffManager
          initialStaff={rows}
          kpi={kpi}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </div>
  );
}
