"use client";

import Link from "next/link";
import { ClipboardCheck, House, Smartphone } from "lucide-react";
import { usePathname } from "next/navigation";

type AssistantBottomNavProps = {
  divisionSlug: string;
  phoneSubmissionsEnabled?: boolean;
};

const NAV_ITEMS = [
  {
    href: (divisionSlug: string) => `/${divisionSlug}/assistant`,
    label: "홈",
    icon: House,
  },
  {
    href: (divisionSlug: string) => `/${divisionSlug}/assistant/check`,
    label: "출석체크",
    icon: ClipboardCheck,
  },
  {
    href: (divisionSlug: string) => `/${divisionSlug}/assistant/phones`,
    label: "휴대폰",
    icon: Smartphone,
    feature: "phoneSubmissions",
  },
] as const;

export function AssistantBottomNav({
  divisionSlug,
  phoneSubmissionsEnabled = false,
}: AssistantBottomNavProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      !("feature" in item) || item.feature !== "phoneSubmissions" || phoneSubmissionsEnabled,
  );

  return (
    /* DESIGN.md 5.5 — 하단 탐색도 밑줄형 선택 표시를 쓰고 배경을 박스로 채우지 않는다. */
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-admin-line bg-admin-surface">
      <div
        className={`mx-auto grid max-w-3xl ${ visibleItems.length === 3 ? "grid-cols-3" : "grid-cols-2" }`}
      >
        {visibleItems.map((item) => {
          const href = item.href(divisionSlug);
          const isActive = pathname === href;
          const Icon = item.icon;

          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className="admin-subtab justify-center border-b-0 border-t-2"
              data-active={isActive}
              style={
                isActive
                  ? { borderTopColor: "var(--admin-accent)", color: "var(--admin-accent)" }
                  : { borderTopColor: "transparent" }
              }
            >
              <Icon className="mr-2 h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
