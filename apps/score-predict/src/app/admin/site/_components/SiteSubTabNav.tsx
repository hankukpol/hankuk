"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { withTenantPrefix } from "@/lib/tenant";
import { getVisibleSiteSettingsNavItems } from "../_lib/site-settings-sections";
import { useSiteSettingsState } from "../_lib/use-site-settings-manager";

function normalizeAdminPath(value: string) {
  return value.replace(/^\/(police|fire)(?=\/|$)/, "") || "/";
}

export default function SiteSubTabNav() {
  const pathname = usePathname();
  const tenant = useTenantConfig();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const { settings } = useSiteSettingsState("사이트 설정 메뉴를 불러오지 못했습니다.");
  const navItems = getVisibleSiteSettingsNavItems(settings).map((tab) => ({
    ...tab,
    href: withTenantPrefix(tab.href, tenant.type),
  }));

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, navItems.length]);

  return (
    <nav className="admin-content-tabs" aria-label="사이트 설정 세부 메뉴">
      <ul className="contents">
        {navItems.map((tab) => {
          const currentPath = normalizeAdminPath(pathname);
          const targetPath = normalizeAdminPath(tab.href);
          const isActive =
            targetPath === "/admin/site"
              ? currentPath === targetPath
              : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                ref={isActive ? activeTabRef : undefined}
                className="admin-content-tab"
                aria-current={isActive ? "page" : undefined}
                data-active={isActive ? "true" : "false"}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
