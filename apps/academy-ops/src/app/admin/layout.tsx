import Link from "next/link";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SetupPanel } from "@/components/setup-panel";
import { AdminShortcutReference } from "@/components/ui/admin-shortcut-reference";
import { ADMIN_NAV_ITEMS, ROLE_LABEL } from "@/lib/constants";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { GlobalSearchBar } from "@/components/admin/global-search-bar";
import { MobileNavWrapper } from "@/components/admin/mobile-nav-wrapper";
import { SidebarCollapseToggle } from "@/components/admin/sidebar-collapse-toggle";
import { TopModuleNav } from "@/components/admin/top-module-nav";
import { CommandPalette } from "@/components/ui/command-palette";
import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
  getServerErrorLogMessage,
} from "@/lib/error-display";
import { getSetupState } from "@/lib/env";
import { getAcademyLabel } from "@/lib/academy";
import { getCurrentAdminContext, getCurrentAuthUser, roleAtLeast } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const setup = getSetupState();

  if (!setup.supabaseReady || !setup.databaseReady) {
    return (
      <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <SetupPanel
            title="관리자 화면을 열기 전에 Supabase와 DB 연결이 필요합니다."
            description="환경 정보를 채우면 바로 동작하도록 준비되어 있습니다. 먼저 `.env.local`을 채운 뒤 다시 접속해 주세요."
            missingKeys={setup.missingKeys}
          />
        </div>
      </main>
    );
  }

  let context;
  try {
    context = await getCurrentAdminContext();
  } catch (err) {
    const details = getDisplayErrorDetails(err);
    console.error("[AdminLayout] getCurrentAdminContext error:", getServerErrorLogMessage(err));
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold text-red-700">레이아웃 오류</h1>
        <p className="mt-4 text-sm text-slate">
          {getDisplayErrorMessage(err, "관리자 화면을 불러오는 중 오류가 발생했습니다.")}
        </p>
        {details ? (
          <pre className="mt-4 whitespace-pre-wrap break-all rounded bg-red-50 p-4 text-sm text-red-800">
            {details}
          </pre>
        ) : null}
      </main>
    );
  }

  if (!context) {
    const user = await getCurrentAuthUser();

    if (user) {
      return (
        <main className="min-h-screen bg-gray-50 px-6 py-8 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-4xl card-border p-8">
            <div className="inline-flex border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
              Access Denied
            </div>
            <h1 className="mt-5 text-3xl font-semibold">관리자 권한이 연결되지 않았습니다.</h1>
            <p className="mt-4 text-sm leading-7 text-slate">
              Supabase Auth 로그인은 되어 있지만 `admin_users` 테이블에 현재 계정이 등록되어 있지 않거나
              비활성 상태입니다. 최고 관리자 계정으로 먼저 연결해 주세요.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login?error=unauthorized"
                className="inline-flex items-center border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                로그인 화면
              </Link>
              <SignOutButton />
            </div>
          </div>
        </main>
      );
    }
  }

  if (!context) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl card-border p-8">
          <p className="text-sm text-slate">로그인이 필요합니다.</p>
          <Link
            href="/login?redirectTo=/admin"
            className="mt-4 inline-flex items-center bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            로그인하러 가기
          </Link>
        </div>
      </main>
    );
  }

  const permittedItems = ADMIN_NAV_ITEMS.filter((item) =>
    roleAtLeast(context.adminUser.role, item.minRole),
  );

  const permittedModuleIds = [
    "dashboard",
    ...new Set(permittedItems.map((item) => item.module).filter((moduleId) => moduleId !== "dashboard")),
  ];

  const academyOptions = context.accessibleAcademies.map((academy) => ({
    id: academy.id,
    name: academy.name,
  }));
  const academyName = context.activeAcademyId === null ? "전체 지점" : getAcademyLabel(context.activeAcademy);
  const canSwitchAcademy = context.isSuperAdmin && academyOptions.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6]">
      <CommandPalette />
      <NextTopLoader color="#C55A11" showSpinner={false} height={2} />
      <a
        href="#main-content"
        className="left-4 top-4 z-[60] rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm sr-only focus:not-sr-only"
      >
        본문으로 건너뛰기
      </a>

      <TopModuleNav
        userName={context.adminUser.name}
        userRole={ROLE_LABEL[context.adminUser.role]}
        permittedModuleIds={permittedModuleIds}
        academyName={academyName}
        activeAcademyId={context.activeAcademyId}
        academyOptions={academyOptions}
        canSwitchAcademy={canSwitchAcademy}
      />

      <div className="flex flex-1">
        <MobileNavWrapper>
          <aside className="flex h-full min-h-[calc(100vh-3.5rem)] w-56 flex-shrink-0 flex-col bg-[#0B1120] text-gray-300 lg:sticky lg:top-14">
            <GlobalSearchBar />
            <AdminNavLinks items={permittedItems} />

            <div className="mt-auto space-y-2 border-t border-white/5 bg-[#0B1120] p-3">
              <AdminShortcutReference
                items={permittedItems.map((item) => ({
                  href: item.href,
                  label: item.label,
                  description: item.description,
                  group: item.group,
                }))}
              />
              <SignOutButton />
            </div>
          </aside>
        </MobileNavWrapper>

        <SidebarCollapseToggle />

        <main
          id="main-content"
          tabIndex={-1}
          className="w-full min-w-0 flex-1 bg-gray-50 p-4 sm:p-6 lg:p-8"
        >
          {children}
          <Toaster position="top-right" richColors closeButton />
        </main>
      </div>
    </div>
  );
}