"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { AdminSidebar, getShellMenuLabel, getShellScreenLabel, type ShellRole } from "@/components/layout/AdminSidebar";
import { AppSwitchMenu } from "@/components/layout/AppSwitchMenu";
import { StaffChatDock } from "@/components/chat/StaffChatDock";
import type { DivisionFeatureFlags } from "@/lib/division-features";

type AdminShellProps = {
  children: ReactNode;
  divisionSlug: string;
  divisionName: string;
  divisionColor: string;
  adminName: string;
  viewerId: string;
  viewerRole: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  featureFlags: DivisionFeatureFlags;
  /** 조교도 같은 셸을 쓴다. 메뉴 목록과 경로만 달라진다. */
  role?: ShellRole;
};

/**
 * DESIGN.md 5.1 — 흰색 작업 화면 + 검은 좌측 메뉴.
 * 1024px 이상은 256px 사이드바, 미만은 검은 상단 헤더의 메뉴 버튼으로 펼친다.
 */
export function AdminShell({
  children,
  divisionSlug,
  divisionName,
  divisionColor,
  adminName,
  viewerId,
  viewerRole,
  featureFlags,
  role = "admin",
}: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuLabel = getShellMenuLabel(role);
  const screenLabel = getShellScreenLabel(role, divisionSlug, pathname ?? "");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      startTransition(() => {
        router.push("/login");
        router.refresh();
      });
    });
  };

  return (
    <div className="admin-shell" data-division={divisionSlug}>
      {/* 데스크톱 좌측 메뉴 */}
      <div className="admin-sidebar-rail hidden lg:block">
        <AdminSidebar
          divisionSlug={divisionSlug}
          divisionName={divisionName}
          divisionColor={divisionColor}
          adminName={adminName}
          featureFlags={featureFlags}
          onLogout={handleLogout}
          isLoggingOut={isPending}
          role={role}
        />
      </div>

      <div className="admin-workspace">
        {/* 1024px 미만 상단 헤더 */}
        {/* 검은 64px 헤더는 768~1023px 에만. 768 미만은 아래 52px 바가 헤더다 (MOBILE_DESIGN.md 2.1). */}
        <header className="admin-mobile-header hidden md:flex lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="admin-button"
              aria-expanded={isMenuOpen}
              aria-controls="admin-mobile-navigation"
            >
              <Menu className="h-5 w-5" />
              {menuLabel}
            </button>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight">{divisionName}</p>
              <p className="truncate text-[13px] text-white/60">{adminName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="admin-button shrink-0"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </header>

        {isMenuOpen ? (
          <div id="admin-mobile-navigation" className="admin-mobile-panel lg:hidden">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={closeMenu}
                className="admin-button admin-button-compact w-11 px-0"
                aria-label="메뉴 닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <AdminSidebar
              divisionSlug={divisionSlug}
              divisionName={divisionName}
              divisionColor={divisionColor}
              adminName={adminName}
              featureFlags={featureFlags}
              onNavigate={closeMenu}
              onLogout={handleLogout}
              isLoggingOut={isPending}
              variant="mobile"
              role={role}
            />
          </div>
        ) : null}

        <main className="admin-main">
          <div className="admin-content-frame">
            {/* 768px 미만에서 이 행이 그대로 52px 상단 바가 된다 (MOBILE_DESIGN.md 2.1).
                채팅 도크를 옮기지 않고 같은 요소를 다시 꾸미는 이유는 도크가 화면당 하나여야 하기 때문이다.
                두 벌을 렌더하면 열림 상태가 갈린다. */}
            <div className="admin-utility-row admin-mobile-topbar">
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className="admin-mobile-topbar-menu md:hidden"
                aria-expanded={isMenuOpen}
                aria-controls="admin-mobile-navigation"
                aria-label={menuLabel}
              >
                <Menu className="h-5 w-5" />
              </button>
              <p className="admin-mobile-topbar-title md:hidden">{screenLabel ?? divisionName}</p>
              <StaffChatDock
                divisionSlug={divisionSlug}
                divisionName={divisionName}
                viewerId={viewerId}
                viewerRole={viewerRole}
                enabled={featureFlags.staffChat}
              />
              <AppSwitchMenu role={role} divisionSlug={divisionSlug} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
