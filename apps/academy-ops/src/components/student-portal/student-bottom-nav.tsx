"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, House, LockKeyhole, Settings, ShieldCheck } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/student",
    label: "홈",
    icon: House,
  },
  {
    href: "/student/scores",
    label: "성적",
    icon: BarChart3,
  },
  {
    href: "/student/attendance",
    label: "출결",
    icon: ShieldCheck,
  },
  {
    href: "/student/schedule",
    label: "시간표",
    icon: CalendarDays,
  },
  {
    href: "/student/civil-exams",
    label: "시험일정",
    icon: ClipboardList,
  },
  {
    href: "/student/locker",
    label: "사물함",
    icon: LockKeyhole,
  },
  {
    href: "/student/settings",
    label: "설정",
    icon: Settings,
  },
] as const;

export function StudentBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-7 gap-1 rounded-[24px] border border-ink/10 bg-mist/80 p-2 shadow-panel">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/student" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 text-[11px] font-semibold transition ${
                isActive
                  ? "bg-ember text-white shadow-sm"
                  : "text-slate hover:bg-white hover:text-ink"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}