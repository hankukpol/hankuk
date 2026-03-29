"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/constants";

type AdminNavLinksProps = {
  items: NavItem[];
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "대시보드",
  members: "수강관리",
  payments: "수납·결제",
  scores: "성적관리",
  attendance: "출결관리",
  facilities: "시설관리",
  system: "시스템",
};

const MODULE_PATHS: Record<string, string[]> = {
  members: [
    "/admin/students",
    "/admin/enrollments",
    "/admin/cohorts",
    "/admin/classrooms",
    "/admin/counseling",
    "/admin/prospects",
    "/admin/graduates",
    "/admin/leaves",
  ],
  payments: [
    "/admin/payments",
    "/admin/approvals",
    "/admin/settlements",
    "/admin/special-lectures",
    "/admin/staff-settlements",
    "/admin/reports",
    "/admin/payment-links",
  ],
  scores: [
    "/admin/analytics",
    "/admin/scores",
    "/admin/results",
    "/admin/exams",
    "/admin/periods",
    "/admin/query",
  ],
  attendance: ["/admin/attendance", "/admin/absence-notes", "/admin/dropout"],
  facilities: [
    "/admin/lockers",
    "/admin/facilities",
    "/admin/study-rooms",
    "/admin/textbooks",
    "/admin/points",
  ],
  system: [
    "/admin/settings",
    "/admin/notifications",
    "/admin/notices",
    "/admin/memos",
    "/admin/audit-log",
    "/admin/audit-logs",
    "/admin/migration",
    "/admin/export",
    "/admin/super",
  ],
};

const DASHBOARD_QUICK_LINKS: Array<{
  label: string;
  href: string;
  group: string;
}> = [
  { label: "전체 학생", href: "/admin/students", group: "수강관리" },
  { label: "수납 등록", href: "/admin/payments/new", group: "수납·결제" },
  { label: "성적 분석", href: "/admin/analytics", group: "성적관리" },
  {
    label: "출결 캘린더",
    href: "/admin/attendance/calendar",
    group: "출결관리",
  },
  { label: "경고·탈락", href: "/admin/dropout", group: "출결관리" },
  { label: "사유서", href: "/admin/absence-notes", group: "출결관리" },
  { label: "사물함", href: "/admin/lockers", group: "시설관리" },
  {
    label: "알림 발송",
    href: "/admin/notifications/send",
    group: "시스템",
  },
];

function getActiveModule(pathname: string): string {
  if (pathname === "/admin") {
    return "dashboard";
  }

  for (const [moduleId, paths] of Object.entries(MODULE_PATHS)) {
    for (const path of paths) {
      if (pathname === path || pathname.startsWith(`${path}/`)) {
        return moduleId;
      }
    }
  }

  return "dashboard";
}

export function AdminNavLinks({ items }: AdminNavLinksProps) {
  const pathname = usePathname();
  const activeModule = getActiveModule(pathname);

  function isActive(href: string): boolean {
    if (href === "/admin") {
      return pathname === "/admin";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const groupedItems: Record<string, Array<{ label: string; href: string }>> = {};

  if (activeModule === "dashboard") {
    for (const link of DASHBOARD_QUICK_LINKS) {
      if (!groupedItems[link.group]) {
        groupedItems[link.group] = [];
      }
      groupedItems[link.group].push({ label: link.label, href: link.href });
    }
  } else {
    const moduleItems = items.filter((item) => item.module === activeModule);
    for (const item of moduleItems) {
      if (!groupedItems[item.group]) {
        groupedItems[item.group] = [];
      }
      groupedItems[item.group].push({ label: item.label, href: item.href });
    }
  }

  return (
    <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-4 py-4">
      {activeModule !== "dashboard" ? (
        <div className="px-4 pb-3 pt-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            {MODULE_LABELS[activeModule]}
          </p>
        </div>
      ) : null}

      {Object.entries(groupedItems).map(([groupName, groupLinks]) => (
        <div key={groupName}>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {groupName}
          </h3>
          <div className="space-y-1">
            {groupLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group flex items-center border-l-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-white/10 text-white"
                      : "border-transparent text-gray-300 hover:border-primary hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex-1">
                    <div
                      className={
                        active
                          ? "font-semibold text-white"
                          : "text-gray-300 group-hover:text-white"
                      }
                    >
                      {link.label}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
