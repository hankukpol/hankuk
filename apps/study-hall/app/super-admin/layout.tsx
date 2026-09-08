"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { AppSwitchMenu } from "@/components/layout/AppSwitchMenu";

type SuperAdminLayoutProps = {
  children: ReactNode;
};

const tabs = [
  { href: "/super-admin", label: "전체 현황", exact: true },
  { href: "/super-admin/manage", label: "지점별 계정 관리", exact: false },
  { href: "/super-admin/announcements", label: "전체 공지", exact: false },
];

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="admin-shell flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="admin-content-frame px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-admin-accent text-sm font-bold text-white">
                SA
              </div>
              <div className="min-w-0">
                <h1 className="admin-page-title">최고관리자</h1>
              </div>
            </div>
            <AppSwitchMenu role="super_admin" />
          </div>

          <nav className="admin-tabs" aria-label="최고관리자 메뉴">
            {tabs.map((tab) => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={false}
                  className="admin-tab"
                  data-active={isActive}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="admin-main admin-content-frame">{children}</main>
    </div>
  );
}
