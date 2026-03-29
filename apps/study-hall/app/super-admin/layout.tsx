"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

type SuperAdminLayoutProps = {
  children: ReactNode;
};

const tabs = [
  { href: "/super-admin", label: "전체 현황", exact: true },
  { href: "/super-admin/manage", label: "지점·계정 관리", exact: false },
  { href: "/super-admin/announcements", label: "전체 공지", exact: false },
];

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      {/* 상단 헤더 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-screen-2xl px-6 md:px-10">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-slate-900 text-white text-sm font-bold">
                SA
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  최고관리
                </p>
                <h1 className="text-lg font-extrabold leading-tight text-slate-950">최고관리자</h1>
              </div>
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <nav className="flex gap-1 border-t border-slate-100">
            {tabs.map((tab) => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={false}
                  className={`relative px-5 py-3 text-sm font-semibold transition ${
                    isActive
                      ? "text-slate-950 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-950 after:content-['']"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-6 md:px-10">{children}</main>
    </div>
  );
}
