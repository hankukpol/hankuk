import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { SuperAdminNav } from "./super-admin-nav";

export default async function SuperAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await requireAdminContext(AdminRole.SUPER_ADMIN);
  const currentScopeLabel =
    context.activeAcademyId === null
      ? "전체 보기 모드"
      : `${context.activeAcademy?.name ?? "지점"} 선택 상태`;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
        슈퍼 관리자
      </div>
      <h1 className="mt-5 text-3xl font-semibold">멀티지점 통합 운영</h1>
      <p className="mt-4 max-w-4xl text-sm leading-8 text-slate sm:text-base">
        전체 지점 생성과 운영 상태, 전 지점 관리자 계정, 통합 KPI를 한 곳에서 관리합니다. 현재
        활성 컨텍스트는 <span className="font-semibold text-ink">{currentScopeLabel}</span>입니다.
      </p>

      <div className="mt-8">
        <SuperAdminNav />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
