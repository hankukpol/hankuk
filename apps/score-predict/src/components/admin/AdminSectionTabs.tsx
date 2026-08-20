"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import { useAdminSiteFeatures } from "@/hooks/use-admin-site-features";
import { withTenantPrefix } from "@/lib/tenant";

import {
  adminNavigationGroups,
  isAdminNavigationItemActive,
} from "./admin-navigation";

export default function AdminSectionTabs() {
  const pathname = usePathname();
  const tenant = useTenantConfig();
  const { features } = useAdminSiteFeatures();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const group = adminNavigationGroups.find((entry) =>
    entry.items.some((item) =>
      (!item.feature || features[item.feature]) &&
      (!item.policeOnly || tenant.type === "police") &&
      isAdminNavigationItemActive(pathname, withTenantPrefix(item.href, tenant.type))
    )
  );

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, group?.key]);

  if (!group) return null;

  const items = group.items.filter(
    (item) =>
      (!item.feature || features[item.feature]) &&
      (!item.policeOnly || tenant.type === "police")
  );

  return (
    <nav className="admin-content-tabs" aria-label={`${group.label} 세부 메뉴`}>
      {items.map((item) => {
        const href = withTenantPrefix(item.href, tenant.type);
        const active = isAdminNavigationItemActive(pathname, href);

        return (
          <Link
            key={item.href}
            href={href}
            ref={active ? activeTabRef : undefined}
            className="admin-content-tab"
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
