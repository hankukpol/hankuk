"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AppSwitchMenu } from "@/components/layout/AppSwitchMenu";
import type { DivisionFeatureFlags } from "@/lib/division-features";

type AdminShellProps = {
  children: ReactNode;
  divisionSlug: string;
  divisionName: string;
  divisionColor: string;
  adminName: string;
  featureFlags: DivisionFeatureFlags;
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
  featureFlags,
}: AdminShellProps) {
  const router = useRouter();
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
        />
      </div>

      <div className="admin-workspace">
        {/* 1024px 미만 상단 헤더 */}
        <header className="admin-mobile-header lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="admin-button"
              aria-expanded={isMenuOpen}
              aria-controls="admin-mobile-navigation"
            >
              {isMenuOpen ? <Menu className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              관리자 메뉴
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
            />
          </div>
        ) : null}

        <main className="admin-main">
          <div className="admin-content-frame">
            <div className="admin-utility-row">
              <AppSwitchMenu role="admin" divisionSlug={divisionSlug} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
