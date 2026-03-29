"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  CalendarClock,
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
  Users,
} from "lucide-react";

import type { DivisionFeatureFlags, DivisionFeatureKey } from "@/lib/division-features";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  featureKey?: DivisionFeatureKey;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "\uC77C\uC0C1 \uC5C5\uBB34",
    items: [
      { href: "", label: "\uB300\uC2DC\uBCF4\uB4DC", icon: LayoutDashboard },
      {
        href: "attendance",
        label: "\uCD9C\uC11D \uAD00\uB9AC",
        icon: BookOpenCheck,
        featureKey: "attendanceManagement",
      },
      {
        href: "phone-submissions",
        label: "\uD734\uB300\uD3F0 \uAD00\uB9AC",
        icon: Smartphone,
        featureKey: "phoneSubmissions",
      },
      {
        href: "students",
        label: "\uD559\uC0DD \uBA85\uB2E8",
        icon: Users,
        featureKey: "studentManagement",
      },
      {
        href: "seats",
        label: "\uC88C\uC11D \uD604\uD669",
        icon: MapPin,
        featureKey: "seatManagement",
      },
    ],
  },
  {
    label: "\uD559\uC0DD \uAD00\uB9AC",
    items: [
      { href: "points", label: "\uC0C1\uBC8C\uC810", icon: Star, featureKey: "pointManagement" },
      {
        href: "leave",
        label: "\uC678\uCD9C/\uD734\uAC00",
        icon: CalendarClock,
        featureKey: "leaveManagement",
      },
      {
        href: "warnings",
        label: "\uACBD\uACE0 \uB300\uC0C1\uC790",
        icon: ShieldAlert,
        featureKey: "warningManagement",
      },
      {
        href: "interviews",
        label: "\uBA74\uB2F4 \uAE30\uB85D",
        icon: MessageSquareWarning,
        featureKey: "interviewManagement",
      },
    ],
  },
  {
    label: "\uC131\uC801\u00B7\uC218\uB0A9",
    items: [
      {
        href: "exams",
        label: "\uC2DC\uD5D8 \uC131\uC801",
        icon: GraduationCap,
        featureKey: "examManagement",
      },
      {
        href: "payments",
        label: "\uC218\uB0A9 \uAD00\uB9AC",
        icon: CreditCard,
        featureKey: "paymentManagement",
      },
    ],
  },
  {
    label: "\uAE30\uD0C0",
    items: [
      {
        href: "announcements",
        label: "\uACF5\uC9C0 \uC0AC\uD56D",
        icon: Megaphone,
        featureKey: "announcements",
      },
      {
        href: "reports",
        label: "\uD1B5\uACC4/\uBCF4\uACE0\uC11C",
        icon: FileSpreadsheet,
        featureKey: "reporting",
      },
      { href: "settings", label: "\uC124\uC815", icon: Settings },
    ],
  },
];

type AdminSidebarProps = {
  divisionSlug: string;
  divisionName: string;
  divisionColor: string;
  adminName: string;
  featureFlags: DivisionFeatureFlags;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function AdminSidebar({
  divisionSlug,
  divisionName,
  divisionColor,
  adminName,
  featureFlags,
  onNavigate,
  onLogout,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.featureKey || featureFlags[item.featureKey],
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div
        className="border-b border-white/10 px-5 py-6"
        style={{
          backgroundColor: `${divisionColor}`,
        }}
      >
        <p className="text-xs uppercase tracking-[0.24em] text-white/70">운영 대시보드</p>
        <h1 className="mt-3 text-xl font-bold">{divisionName}</h1>
        <p className="mt-1 text-sm text-white/70">{adminName}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.label} className={sectionIndex > 0 ? "mt-5" : ""}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const href = `/${divisionSlug}/admin${item.href ? `/${item.href}` : ""}`;
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
                    className={`flex items-center gap-3 rounded-[10px] px-3 py-3 text-sm transition ${
                      isActive
                        ? "bg-white text-slate-950 shadow-[0_16px_40px_rgba(255,255,255,0.16)]"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="rounded-[10px] bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/10">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">{adminName}</p>
              <p className="text-xs text-white/55">
                {"\uD604\uC7AC \uC9C0\uC810 \uAD8C\uD55C\uC73C\uB85C \uB85C\uADF8\uC778\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-4 w-full rounded-[10px] border border-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {"\uB85C\uADF8\uC544\uC6C3"}
          </button>
        </div>
      </div>
    </div>
  );
}
