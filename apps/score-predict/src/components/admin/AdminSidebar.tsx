"use client";

import {
  BarChart3,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Flag,
  Image,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  MessageSquare,
  Settings,
  TicketCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import { useAdminSiteFeatures } from "@/hooks/use-admin-site-features";
import { withTenantPrefix } from "@/lib/tenant";

import {
  adminDashboardItem,
  adminNavigationGroups,
  adminSystemItems,
  isAdminNavigationItemActive,
} from "./admin-navigation";

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  exam: FileText,
  answers: CheckCircle2,
  regions: MapPinned,
  release: Flag,
  participants: Users,
  registration: TicketCheck,
  submissions: ClipboardList,
  stats: BarChart3,
  visitors: BarChart3,
  comments: MessageSquare,
  content: Image,
  events: BellRing,
  settings: Settings,
  database: Database,
};

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { features } = useAdminSiteFeatures();
  const tenant = useTenantConfig();

  const visibleGroups = adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.feature || features[item.feature]) &&
          (!item.policeOnly || tenant.type === "police")
      ),
    }))
    .filter((group) => group.items.length > 0);
  const visibleSystemItems = adminSystemItems.filter(
    (item) => !item.feature || features[item.feature]
  );

  const closeMobileMenu = () => setMobileOpen(false);

  const navContent = (
    <>
      <div className="admin-sidebar-header">
        <p className="admin-sidebar-brand">합격예측</p>
        <p className="admin-sidebar-caption">관리자 운영</p>
      </div>

      <nav className="admin-sidebar-nav" aria-label="관리자 주요 메뉴">
        <AdminSidebarLink
          href={withTenantPrefix(adminDashboardItem.href, tenant.type)}
          label={adminDashboardItem.label}
          icon={iconMap[adminDashboardItem.icon]}
          active={pathname === withTenantPrefix(adminDashboardItem.href, tenant.type)}
          onNavigate={closeMobileMenu}
        />

        <div className="admin-sidebar-divider" />

        {visibleGroups.map((group) => {
          const visibleHrefs = group.items.map((item) =>
            withTenantPrefix(item.href, tenant.type)
          );
          const active = visibleHrefs.some((href) =>
            isAdminNavigationItemActive(pathname, href)
          );
          const Icon = iconMap[group.icon];

          return (
            <AdminSidebarLink
              key={group.key}
              href={visibleHrefs[0]}
              label={group.label}
              icon={Icon}
              active={active}
              onNavigate={closeMobileMenu}
            />
          );
        })}

        <div className="admin-sidebar-divider" />

        {visibleSystemItems.map((item) => (
          <AdminSidebarLink
            key={item.href}
            href={withTenantPrefix(item.href, tenant.type)}
            label={item.label}
            icon={iconMap[item.icon]}
            active={isAdminNavigationItemActive(
              pathname,
              withTenantPrefix(item.href, tenant.type)
            )}
            onNavigate={closeMobileMenu}
          />
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <Link
          href={withTenantPrefix("/", tenant.type)}
          className="admin-sidebar-exit"
          onClick={closeMobileMenu}
        >
          <LogOut aria-hidden="true" />
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
        className="admin-mobile-menu-button md:hidden"
        aria-label="메뉴 열기"
      >
        <Menu aria-hidden="true" />
      </button>

      {mobileOpen ? (
        <button
          type="button"
          className="admin-sidebar-overlay md:hidden"
          onClick={closeMobileMenu}
          aria-label="메뉴 바깥 영역 닫기"
        />
      ) : null}

      <aside
        className={`admin-sidebar admin-sidebar-mobile md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={closeMobileMenu}
          className="admin-sidebar-close"
          aria-label="메뉴 닫기"
        >
          <X aria-hidden="true" />
        </button>
        {navContent}
      </aside>

      <aside className="admin-sidebar hidden md:flex">{navContent}</aside>
    </>
  );
}

function AdminSidebarLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className="admin-sidebar-link"
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
