"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import NotificationBell from "@/components/layout/NotificationBell";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface SiteSettingsResponse {
  settings?: {
    "site.title"?: string;
  };
}

export default function Header() {
  const tenant = useTenantConfig();
  const { data: session, status } = useSession();
  const [siteTitleOverride, setSiteTitleOverride] = useState<string | null>(null);
  const siteTitle = siteTitleOverride ?? tenant.siteTitle;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/site-settings", {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as SiteSettingsResponse;
        const title = data.settings?.["site.title"];

        if (!cancelled && typeof title === "string" && title.trim()) {
          setSiteTitleOverride(title);
        } else if (!cancelled) {
          setSiteTitleOverride(null);
        }
      } catch {
        if (!cancelled) {
          setSiteTitleOverride(null);
        }
        // Keep the tenant default title when the public settings endpoint is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.type]);

  return (
    <header className="border-b border-[#111111] bg-[#111111] text-white">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-2">
        <Link
          href={withTenantPrefix("/", tenant.type)}
          className="text-base font-black tracking-tight text-white sm:text-lg"
        >
          {siteTitle}
        </Link>

        {status === "loading" ? (
          <p className="text-sm text-white/60">세션 확인 중...</p>
        ) : session?.user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right text-sm leading-tight text-white/80 sm:block">
              <p className="font-medium">{session.user.name}</p>
              <p>
                {tenant.authMode === "username"
                  ? `아이디 ${session.user.username ?? "-"}`
                  : session.user.phone ?? "-"}
              </p>
            </div>
            <NotificationBell />
            {session.user.role === "ADMIN" ? (
              <Link href={withTenantPrefix("/admin", tenant.type)}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  관리자
                </Button>
              </Link>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              onClick={() => signOut({ callbackUrl: withTenantPrefix("/login", tenant.type) })}
            >
              로그아웃
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link href={withTenantPrefix("/login", tenant.type)}>
              <Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700">
                로그인
              </Button>
            </Link>
            <Link href={withTenantPrefix("/register", tenant.type)}>
              <Button
                size="sm"
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              >
                회원가입
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
