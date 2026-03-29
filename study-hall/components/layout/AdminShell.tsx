"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import type { DivisionFeatureFlags } from "@/lib/division-features";

type AdminShellProps = {
  children: ReactNode;
  divisionSlug: string;
  divisionName: string;
  divisionColor: string;
  adminName: string;
  featureFlags: DivisionFeatureFlags;
};

export function AdminShell({
  children,
  divisionSlug,
  divisionName,
  divisionColor,
  adminName,
  featureFlags,
}: AdminShellProps) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const closeSidebar = () => setIsSidebarOpen(false);

  const handleLogout = () => {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:block md:border-r md:border-black/5">
        <AdminSidebar
          divisionSlug={divisionSlug}
          divisionName={divisionName}
          divisionColor={divisionColor}
          adminName={adminName}
          featureFlags={featureFlags}
          onLogout={handleLogout}
        />
      </aside>

      <div className="relative min-w-0">
        <div className="md:hidden">
          <MobileHeader
            title={divisionName}
            subtitle={adminName}
            onMenuClick={() => setIsSidebarOpen(true)}
            onLogout={handleLogout}
            isLoggingOut={isPending}
          />
        </div>

        {isSidebarOpen ? (
          <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm md:hidden">
            <div className="absolute inset-y-0 left-0 w-[86%] max-w-xs">
              <button
                type="button"
                onClick={closeSidebar}
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-white/10 bg-white text-white"
                aria-label="메뉴 닫기"
              >
                <X className="h-4 w-4" />
              </button>

              <AdminSidebar
                divisionSlug={divisionSlug}
                divisionName={divisionName}
                divisionColor={divisionColor}
                adminName={adminName}
                featureFlags={featureFlags}
                onNavigate={closeSidebar}
                onLogout={handleLogout}
              />
            </div>
          </div>
        ) : null}

        <main className="min-h-screen px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
