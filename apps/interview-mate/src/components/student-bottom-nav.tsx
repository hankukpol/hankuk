"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Home,
  MessageCircle,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "home", href: "/student", icon: Home, label: "홈" },
  { key: "reservation", href: "/reservation", icon: CalendarDays, label: "예약" },
  { key: "apply", href: "/apply", icon: Users, label: "지원" },
  { key: "my-reservation", href: "/my-reservation", icon: ClipboardList, label: "내 예약" },
  { key: "room", href: "/room", icon: MessageCircle, label: "조 방" },
] as const;

function resolveHref(baseHref: string, track: string | null) {
  if (!track) return baseHref;
  if (baseHref === "/room") return baseHref;
  if (baseHref === "/student") return baseHref;
  return `${baseHref}?track=${track}`;
}

function matchTab(pathname: string): string {
  if (pathname === "/student") return "home";
  if (pathname.startsWith("/reservation")) return "reservation";
  if (pathname.startsWith("/apply")) return "apply";
  if (pathname.startsWith("/my-reservation")) return "my-reservation";
  if (pathname.startsWith("/status")) return "apply";
  if (pathname.startsWith("/room")) return "room";
  return "home";
}

export function StudentBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const track = searchParams.get("track");
  const activeTab = matchTab(pathname);

  return (
    <nav className="student-bottom-nav">
      <div className="flex items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeTab;
          const Icon = item.icon;
          const href = resolveHref(item.href, track);

          return (
            <Link
              key={item.key}
              href={href}
              className={`group relative flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2 transition-colors ${
                isActive
                  ? "text-[var(--division-color)]"
                  : "text-slate-400 active:text-slate-600"
              }`}
            >
              {isActive && (
                <span className="absolute inset-x-3 top-0 h-[2.5px] rounded-full bg-[var(--division-color)]" />
              )}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                  isActive
                    ? "scale-105"
                    : "group-active:scale-95"
                }`}
              >
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={isActive ? 2.2 : 1.6}
                />
              </span>
              <span
                className={`text-[10px] leading-tight ${
                  isActive ? "font-bold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
