"use client";

import Link from "next/link";
import { ClipboardCheck, House, MessagesSquare, Smartphone } from "lucide-react";
import { usePathname } from "next/navigation";

import { StaffChatUnreadBadge } from "@/components/chat/StaffChatUnreadBadge";

type AssistantBottomNavProps = {
  divisionSlug: string;
  phoneSubmissionsEnabled?: boolean;
  staffChatEnabled?: boolean;
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
  {
    href: (divisionSlug: string) => `/${divisionSlug}/assistant/chat`,
    // 390px 4열이면 칸당 약 97px 이라 짧은 라벨을 쓴다.
    label: "채팅",
    icon: MessagesSquare,
    feature: "staffChat",
    showUnreadBadge: true,
  },
] as const;

/** Tailwind 는 동적으로 만든 클래스명을 볼 수 없어 미리 나열한다. */
const GRID_COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function AssistantBottomNav({
  divisionSlug,
  phoneSubmissionsEnabled = false,
  staffChatEnabled = false,
}: AssistantBottomNavProps) {
  const pathname = usePathname();

  const featureEnabled: Record<string, boolean> = {
    phoneSubmissions: phoneSubmissionsEnabled,
    staffChat: staffChatEnabled,
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => !("feature" in item) || featureEnabled[item.feature] === true,
  );

  return (
    /* DESIGN.md 5.5 — 하단 탐색도 밑줄형 선택 표시를 쓰고 배경을 박스로 채우지 않는다. */
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-admin-line bg-admin-surface">
      <div
        className={`mx-auto grid max-w-3xl ${GRID_COLUMN_CLASS[visibleItems.length] ?? "grid-cols-4"}`}
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
              className="admin-subtab relative justify-center border-b-0 border-t-2"
              data-active={isActive}
              style={
                isActive
                  ? { borderTopColor: "var(--admin-accent)", color: "var(--admin-accent)" }
                  : { borderTopColor: "transparent" }
              }
            >
              <Icon className="mr-2 h-5 w-5" />
              {item.label}
              {"showUnreadBadge" in item ? (
                <StaffChatUnreadBadge className="admin-nav-badge-floating" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
