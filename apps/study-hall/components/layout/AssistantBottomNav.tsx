"use client";

import Link from "next/link";
import { ClipboardCheck, House } from "lucide-react";
import { usePathname } from "next/navigation";

type AssistantBottomNavProps = {
  divisionSlug: string;
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
] as const;

export function AssistantBottomNav({ divisionSlug }: AssistantBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto max-w-3xl rounded-[10px] border border-black/5 bg-white p-2">
        <div className="grid grid-cols-2 gap-2">
          {NAV_ITEMS.map((item) => {
            const href = item.href(divisionSlug);
            const isActive = pathname === href;
            const Icon = item.icon;

            return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={`inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-[var(--division-color)] text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
