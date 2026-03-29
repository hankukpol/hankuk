"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { withTenantPrefix } from "@/lib/tenant";
import { getVisibleSiteSettingsNavItems } from "../_lib/site-settings-sections";
import { useSiteSettingsState } from "../_lib/use-site-settings-manager";

export default function SiteSubTabNav() {
  const pathname = usePathname();
  const tenant = useTenantConfig();
  const { settings } = useSiteSettingsState("사이트 설정 메뉴를 불러오지 못했습니다.");
  const navItems = getVisibleSiteSettingsNavItems(settings).map((tab) => ({
    ...tab,
    href: withTenantPrefix(tab.href, tenant.type),
  }));

  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-2">
      <ul className="flex flex-wrap gap-2">
        {navItems.map((tab) => {
          const siteRoot = withTenantPrefix("/admin/site", tenant.type);
          const isActive = tab.href === siteRoot ? pathname === tab.href : pathname.startsWith(tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-fire-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
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
