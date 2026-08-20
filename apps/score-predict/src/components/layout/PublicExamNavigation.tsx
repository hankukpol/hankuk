"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import GuestLoginDialog from "@/components/landing/GuestLoginDialog";
import { stripTenantPrefix, withTenantPrefix, type TenantType } from "@/lib/tenant";

export type PublicExamNavigationKey = "main" | "notices" | "faq";

interface PublicExamNavigationItem {
  key: PublicExamNavigationKey;
  href: string;
  label: string;
  visible: boolean;
}

interface PublicExamNavigationProps {
  activeKey: PublicExamNavigationKey;
  tenantType: TenantType;
  preRegistrationEnabled: boolean;
  noticesEnabled: boolean;
  faqEnabled: boolean;
  isAuthenticated: boolean;
}

function navigationClassName(active: boolean): string {
  const base =
    "user-navigation-tab inline-flex h-16 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 text-[15px] font-bold sm:min-w-[120px]";

  return active
    ? `${base} border-service-400 bg-white/10 text-white`
    : `${base} border-transparent text-white/70 transition-colors hover:border-service-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-400`;
}

export default function PublicExamNavigation({
  activeKey,
  tenantType,
  preRegistrationEnabled,
  noticesEnabled,
  faqEnabled,
  isAuthenticated,
}: PublicExamNavigationProps) {
  const [guestLoginDialogOpen, setGuestLoginDialogOpen] = useState(false);
  const [requestedTab, setRequestedTab] = useState<PublicExamNavigationItem | null>(null);
  const pathname = usePathname();
  if (!noticesEnabled && !faqEnabled) return null;

  const normalizedPathname = stripTenantPrefix(pathname ?? "").replace(/\/+$/, "");
  const resolvedActiveKey: PublicExamNavigationKey =
    normalizedPathname === "/exam/notices"
      ? "notices"
      : normalizedPathname === "/exam/faq"
        ? "faq"
        : activeKey;

  const tabs: PublicExamNavigationItem[] = [
    {
      key: "main",
      href: withTenantPrefix("/", tenantType),
      label: preRegistrationEnabled ? "사전등록" : "풀서비스 메인",
      visible: true,
    },
    {
      key: "notices",
      href: withTenantPrefix("/exam/notices", tenantType),
      label: "공지사항",
      visible: noticesEnabled,
    },
    {
      key: "faq",
      href: withTenantPrefix("/exam/faq", tenantType),
      label: "FAQ",
      visible: faqEnabled,
    },
  ];

  return (
    <>
      <div className="user-sticky-navigation">
        <nav className="user-navigation-surface user-content-frame overflow-hidden" aria-label="공개 서비스 메뉴">
          <div className="flex min-h-16 w-full min-w-max items-stretch overflow-x-auto px-1 sm:px-4">
            {tabs
              .filter((tab) => tab.visible)
              .map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={resolvedActiveKey === tab.key ? "page" : undefined}
                  className={navigationClassName(resolvedActiveKey === tab.key)}
                  onClick={(event) => {
                    if (isAuthenticated || tab.key === "main") return;
                    event.preventDefault();
                    setRequestedTab(tab);
                    setGuestLoginDialogOpen(true);
                  }}
                >
                  {tab.label}
                </Link>
              ))}
          </div>
        </nav>
      </div>
      <GuestLoginDialog
        open={guestLoginDialogOpen}
        onOpenChange={setGuestLoginDialogOpen}
        requestedLabel={requestedTab?.label}
        callbackHref={requestedTab?.href ?? "/"}
      />
    </>
  );
}
