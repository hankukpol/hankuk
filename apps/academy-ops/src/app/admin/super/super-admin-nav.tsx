"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPER_ADMIN_TABS = [
  {
    href: "/admin/super/dashboard",
    label: "통합 대시보드",
    description: "전 지점 KPI 비교",
  },
  {
    href: "/admin/super/academies",
    label: "지점 관리",
    description: "지점 생성, 수정, 활성화",
  },
  {
    href: "/admin/super/users",
    label: "관리자 계정",
    description: "전 지점 관리자 초대 및 권한 관리",
  },
];

export function SuperAdminNav() {
  const pathname = usePathname();

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {SUPER_ADMIN_TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[24px] border px-5 py-4 transition ${
              isActive
                ? "border-ember/30 bg-ember/10 text-ink"
                : "border-ink/10 bg-white text-ink hover:border-ember/20 hover:bg-mist"
            }`}
          >
            <p className="text-sm font-semibold">{tab.label}</p>
            <p className="mt-1 text-xs leading-6 text-slate">{tab.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
