"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageSquareWarning,
  Settings,
  ShieldAlert,
  Smartphone,
  Star,
  Trophy,
  Users,
} from "lucide-react";

import type { DivisionFeatureFlags, DivisionFeatureKey } from "@/lib/division-features";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  featureKey?: DivisionFeatureKey;
  divisionOnly?: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export type ShellRole = "admin" | "assistant";

const navSections: NavSection[] = [
  {
    label: "일상 업무",
    items: [
      { href: "", label: "대시보드", icon: LayoutDashboard },
      {
        href: "attendance",
        label: "출석 관리",
        icon: BookOpenCheck,
        featureKey: "attendanceManagement",
      },
      {
        href: "phone-submissions",
        label: "휴대폰 관리",
        icon: Smartphone,
        featureKey: "phoneSubmissions",
      },
      {
        href: "students",
        label: "학생 명단",
        icon: Users,
        featureKey: "studentManagement",
      },
      {
        href: "seats",
        label: "좌석 현황",
        icon: MapPin,
        featureKey: "seatManagement",
      },
    ],
  },
  {
    label: "학생 관리",
    items: [
      { href: "points", label: "상벌점", icon: Star, featureKey: "pointManagement" },
      {
        href: "study-ranking",
        label: "학습 랭킹",
        icon: Trophy,
        featureKey: "studentManagement",
      },
      {
        href: "leave",
        label: "외출/휴가",
        icon: CalendarClock,
        featureKey: "leaveManagement",
      },
      {
        href: "warnings",
        label: "경고 대상자",
        icon: ShieldAlert,
        featureKey: "warningManagement",
      },
      {
        href: "interviews",
        label: "면담 기록",
        icon: MessageSquareWarning,
        featureKey: "interviewManagement",
      },
    ],
  },
  {
    label: "성적·수납",
    items: [
      {
        href: "exams",
        label: "시험 성적",
        icon: GraduationCap,
        featureKey: "examManagement",
      },
      {
        href: "payments",
        label: "수납 관리",
        icon: CreditCard,
        featureKey: "paymentManagement",
      },
    ],
  },
  {
    label: "기타",
    items: [
      {
        href: "announcements",
        label: "공지 사항",
        icon: Megaphone,
        featureKey: "announcements",
      },
      {
        href: "reports",
        label: "통계/보고서",
        icon: FileSpreadsheet,
        featureKey: "reporting",
      },
      { href: "settings", label: "설정", icon: Settings },
    ],
  },
];

/* 조교는 현장 처리 화면만 쓴다. 관리자 메뉴를 권한으로 가리는 대신
   애초에 조교용 목록을 따로 둔다. 껍데기와 규격은 관리자와 같다. */
const assistantNavSections: NavSection[] = [
  {
    label: "조교 업무",
    items: [
      { href: "", label: "조교 홈", icon: LayoutDashboard },
      {
        href: "check",
        label: "출석체크",
        icon: ClipboardCheck,
        featureKey: "attendanceManagement",
      },
      {
        href: "phones",
        label: "휴대폰 체크",
        icon: Smartphone,
        featureKey: "phoneSubmissions",
      },
    ],
  },
];

const shellNav: Record<ShellRole, { sections: NavSection[]; basePath: string; menuLabel: string }> = {
  admin: { sections: navSections, basePath: "admin", menuLabel: "관리자 메뉴" },
  assistant: { sections: assistantNavSections, basePath: "assistant", menuLabel: "조교 메뉴" },
};

export function getShellMenuLabel(role: ShellRole) {
  return shellNav[role].menuLabel;
}

type AdminSidebarProps = {
  divisionSlug: string;
  divisionName: string;
  divisionColor: string;
  adminName: string;
  featureFlags: DivisionFeatureFlags;
  onNavigate?: () => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
  variant?: "desktop" | "mobile";
  role?: ShellRole;
};

/**
 * DESIGN.md 5.1 — 검은 rail, 메뉴 글자 15px/600, 아이콘 20px,
 * 최소 높이 44px, 활성 항목은 왼쪽 4px 강조색.
 */
export function AdminSidebar({
  divisionSlug,
  divisionName,
  adminName,
  featureFlags,
  onNavigate,
  onLogout,
  isLoggingOut = false,
  variant = "desktop",
  role = "admin",
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { sections, basePath, menuLabel } = shellNav[role];
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (!item.divisionOnly || item.divisionOnly === divisionSlug) && (!item.featureKey || featureFlags[item.featureKey])),
    }))
    .filter((section) => section.items.length > 0);

  const isMobile = variant === "mobile";

  return (
    <div className={isMobile ? "flex flex-col" : "admin-sidebar"}>
      {!isMobile ? (
        <div className="admin-sidebar-header">
          <p className="admin-sidebar-brand">{divisionName}</p>
          <p className="admin-sidebar-caption">{adminName}</p>
        </div>
      ) : null}

      <nav className="admin-sidebar-nav" aria-label={menuLabel}>
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="admin-sidebar-group">{section.label}</p>
            {section.items.map((item) => {
              const href = `/${divisionSlug}/${basePath}${item.href ? `/${item.href}` : ""}`;
              const isActive =
                item.href === ""
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  onClick={onNavigate}
                  className="admin-sidebar-link"
                  data-active={isActive}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {onLogout && !isMobile ? (
        <div className="admin-sidebar-footer">
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-[15px] font-semibold text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}
