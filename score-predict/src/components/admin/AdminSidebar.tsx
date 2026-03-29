"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import { withTenantPrefix } from "@/lib/tenant";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAdminSiteFeatures } from "@/hooks/use-admin-site-features";
import type { AdminSiteFeatureKey } from "@/lib/admin-site-features.shared";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: AdminSiteFeatureKey;
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
}

type SidebarEntry = NavItem | NavGroup;

function isGroup(entry: SidebarEntry): entry is NavGroup {
  return "items" in entry;
}

const sidebarEntries: SidebarEntry[] = [
  { href: "/admin", label: "대시보드", icon: "grid" },
  {
    key: "exam-ops",
    label: "시험 운영",
    icon: "file",
    items: [
      { href: "/admin/exams", label: "시험 관리", icon: "file", feature: "exams" },
      { href: "/admin/answers", label: "정답 관리", icon: "check", feature: "answers" },
      { href: "/admin/regions", label: "모집인원 관리", icon: "map", feature: "regions" },
      { href: "/admin/pass-cut", label: "합격컷 발표", icon: "flag", feature: "passCut" },
    ],
  },
  {
    key: "participants",
    label: "참여자 관리",
    icon: "users",
    items: [
      {
        href: "/admin/pre-registrations",
        label: "사전등록 관리",
        icon: "ticket",
        feature: "preRegistrations",
      },
      { href: "/admin/submissions", label: "제출 현황", icon: "list", feature: "submissions" },
      { href: "/admin/stats", label: "참여 통계", icon: "chart", feature: "stats" },
      { href: "/admin/visitors", label: "방문자 통계", icon: "eye", feature: "visitors" },
      { href: "/admin/users", label: "사용자 관리", icon: "users", feature: "users" },
      { href: "/admin/comments", label: "댓글 관리", icon: "message", feature: "comments" },
    ],
  },
  {
    key: "content",
    label: "콘텐츠 관리",
    icon: "image",
    items: [
      { href: "/admin/banners", label: "배너 관리", icon: "image", feature: "banners" },
      { href: "/admin/events", label: "이벤트 관리", icon: "calendar", feature: "events" },
      { href: "/admin/notices", label: "공지사항 관리", icon: "message", feature: "notices" },
      { href: "/admin/faqs", label: "FAQ 관리", icon: "list", feature: "faqs" },
    ],
  },
  {
    key: "system",
    label: "시스템",
    icon: "settings",
    items: [
      { href: "/admin/site", label: "사이트 설정", icon: "settings" },
      { href: "/admin/mock-data", label: "목업 데이터", icon: "database", feature: "mockData" },
    ],
  },
];

const iconMap: Record<string, ReactNode> = {
  grid: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  ),
  file: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  check: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  map: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  image: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  calendar: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  database: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  message: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  list: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  ticket: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 5V3H8v2H5a2 2 0 00-2 2v3a2 2 0 012 2 2 2 0 01-2 2v3a2 2 0 002 2h3v2h8v-2h3a2 2 0 002-2v-3a2 2 0 01-2-2 2 2 0 012-2V7a2 2 0 00-2-2h-3z" />
    </svg>
  ),
  flag: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18m0-13h9l-1.5 3L14 14H5" />
    </svg>
  ),
  chart: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  eye: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { features } = useAdminSiteFeatures();
  const tenant = useTenantConfig();

  const tenantEntries = sidebarEntries.map((entry) =>
    isGroup(entry)
      ? {
          ...entry,
          items: entry.items.map((child) => ({
            ...child,
            href: withTenantPrefix(child.href, tenant.type),
          })),
        }
      : {
          ...entry,
          href: withTenantPrefix(entry.href, tenant.type),
        }
  );

  function isActive(href: string): boolean {
    if (href === withTenantPrefix("/admin", tenant.type)) return pathname === href;
    return pathname.startsWith(href);
  }

  const visibleEntries = tenantEntries.reduce<SidebarEntry[]>((acc, entry) => {
    if (!isGroup(entry)) {
      if (!entry.feature || features[entry.feature]) {
        acc.push(entry);
      }
      return acc;
    }

    const visibleItems = entry.items.filter(
      (child) => !child.feature || features[child.feature]
    );
    if (visibleItems.length > 0) {
      acc.push({ ...entry, items: visibleItems });
    }

    return acc;
  }, []);

  const activeGroupKeys = new Set<string>();
  for (const entry of visibleEntries) {
    if (isGroup(entry) && entry.items.some((child) => isActive(child.href))) {
      activeGroupKeys.add(entry.key);
    }
  }

  const visibleExpandedGroups = new Set(expandedGroups);
  for (const key of activeGroupKeys) {
    visibleExpandedGroups.add(key);
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const navContent = (
    <>
      <div className="px-5 py-6">
        <p className="text-lg font-bold text-white">관리자</p>
        <p className="mt-0.5 text-xs text-fire-300">관리자 콘솔</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2">
        {visibleEntries.map((entry) => {
          if (!isGroup(entry)) {
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-fire-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className={active ? "text-fire-300" : "text-fire-400"}>
                  {iconMap[entry.icon]}
                </span>
                {entry.label}
              </Link>
            );
          }

          const expanded = visibleExpandedGroups.has(entry.key);
          const hasActiveChild = entry.items.some((child) => isActive(child.href));

          return (
            <div key={entry.key} className="mt-3 first:mt-0">
              <button
                type="button"
                onClick={() => toggleGroup(entry.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  hasActiveChild ? "text-white" : "text-fire-400 hover:text-fire-200"
                }`}
              >
                <span className={hasActiveChild ? "text-fire-300" : "text-fire-500"}>
                  {iconMap[entry.icon]}
                </span>
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronIcon expanded={expanded} />
              </button>

              {expanded ? (
                <div className="mt-0.5 space-y-0.5 pl-3">
                  {entry.items.map((child) => {
                    const active = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          active
                            ? "bg-white/15 text-white shadow-sm"
                            : "text-fire-200 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className={active ? "text-fire-300" : "text-fire-400"}>
                          {iconMap[child.icon]}
                        </span>
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 px-5 py-4">
        <Link
          href={withTenantPrefix("/", tenant.type)}
          className="flex items-center gap-2 text-xs text-fire-300 transition hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          사용자 페이지로 이동
        </Link>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg bg-fire-600 p-2 text-white shadow-lg md:hidden"
        aria-label="메뉴 열기"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-60 flex-col bg-fire-600 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-1 text-fire-300 hover:text-white"
          aria-label="메뉴 닫기"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {navContent}
      </aside>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-fire-700 md:flex">
        {navContent}
      </aside>
    </>
  );
}
