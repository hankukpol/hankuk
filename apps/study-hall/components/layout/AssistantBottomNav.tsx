"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, LayoutDashboard, Smartphone } from "lucide-react";

type AssistantBottomNavProps = {
  divisionSlug: string;
  phoneSubmissionsEnabled?: boolean;
};

const items = [
  { href: "", label: "홈", Icon: LayoutDashboard },
  { href: "check", label: "출석체크", Icon: ClipboardCheck },
  { href: "phones", label: "휴대폰", Icon: Smartphone },
] as const;

/**
 * 조교가 쓰는 화면은 셋뿐이다. 그때마다 서랍을 열어 고르는 것보다 아래 고정 바가 빠르고,
 * 현장에서 한 손으로 든 폰의 엄지가 닿는 자리다. 학생 포털과 같은 규격을 쓴다.
 */
export function AssistantBottomNav({ divisionSlug, phoneSubmissionsEnabled = true }: AssistantBottomNavProps) {
  const pathname = usePathname();
  const base = `/${divisionSlug}/assistant`;
  const visible = items.filter((item) => item.href !== "phones" || phoneSubmissionsEnabled);

  return (
    <nav className="admin-tabs admin-portal-nav lg:hidden" aria-label="조교 메뉴">
      {visible.map((item) => {
        const href = item.href ? `${base}/${item.href}` : base;
        // 홈은 정확히 일치할 때만 활성이다. 접두사로 보면 모든 화면에서 홈이 켜진다.
        const isActive = item.href ? pathname.startsWith(href) : pathname === base;

        return (
          <Link
            key={item.href || "home"}
            href={href}
            prefetch={false}
            className="admin-tab"
            data-active={isActive}
            aria-current={isActive ? "page" : undefined}
          >
            <item.Icon className="admin-portal-nav-icon" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
