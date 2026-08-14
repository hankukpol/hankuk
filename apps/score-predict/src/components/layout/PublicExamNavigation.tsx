"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripTenantPrefix, withTenantPrefix, type TenantType } from "@/lib/tenant";

export type PublicExamNavigationKey = "main" | "notices" | "faq";

interface PublicExamNavigationProps {
  activeKey: PublicExamNavigationKey;
  tenantType: TenantType;
  preRegistrationEnabled: boolean;
  noticesEnabled: boolean;
  faqEnabled: boolean;
}

function navigationClassName(active: boolean): string {
  const base =
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold sm:min-w-[120px]";

  return active
    ? `${base} border-service-700 text-service-700`
    : `${base} border-transparent text-slate-500 transition-colors hover:border-service-300 hover:text-service-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600`;
}

export default function PublicExamNavigation({
  activeKey,
  tenantType,
  preRegistrationEnabled,
  noticesEnabled,
  faqEnabled,
}: PublicExamNavigationProps) {
  const pathname = usePathname();
  if (!noticesEnabled && !faqEnabled) return null;

  const normalizedPathname = stripTenantPrefix(pathname ?? "").replace(/\/+$/, "");
  const resolvedActiveKey: PublicExamNavigationKey =
    normalizedPathname === "/exam/notices"
      ? "notices"
      : normalizedPathname === "/exam/faq"
        ? "faq"
        : activeKey;

  const tabs = [
    {
      key: "main" as const,
      href: withTenantPrefix("/", tenantType),
      label: preRegistrationEnabled ? "사전등록" : "풀서비스 메인",
      visible: true,
    },
    {
      key: "notices" as const,
      href: withTenantPrefix("/exam/notices", tenantType),
      label: "공지사항",
      visible: noticesEnabled,
    },
    {
      key: "faq" as const,
      href: withTenantPrefix("/exam/faq", tenantType),
      label: "FAQ",
      visible: faqEnabled,
    },
  ];

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="공개 서비스 메뉴">
      <div className="mx-auto flex h-12 w-full max-w-7xl min-w-max items-stretch overflow-x-auto px-1 sm:px-4">
        {tabs
          .filter((tab) => tab.visible)
          .map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={resolvedActiveKey === tab.key ? "page" : undefined}
              className={navigationClassName(resolvedActiveKey === tab.key)}
            >
              {tab.label}
            </Link>
          ))}
      </div>
    </nav>
  );
}
