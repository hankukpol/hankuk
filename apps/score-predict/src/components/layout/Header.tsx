"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import NotificationBell from "@/components/layout/NotificationBell";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";
import { ShieldCheck } from "lucide-react";

interface SiteSettingsResponse {
  settings?: {
    "site.title"?: string;
  };
}

export default function Header() {
  const tenant = useTenantConfig();
  const { data: session, status } = useSession();
  const [siteTitleOverride, setSiteTitleOverride] = useState<string | null>(null);
  const [recoveryEmailState, setRecoveryEmailState] = useState<{
    userId: string;
    needsVerification: boolean;
  } | null>(null);
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

  useEffect(() => {
    if (!session?.user) {
      return;
    }
    let cancelled = false;
    void fetch("/api/account/security", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { email?: string | null; emailVerifiedAt?: string | null };
      })
      .then((data) => {
        if (!cancelled) {
          setRecoveryEmailState({
            userId: session.user.id,
            needsVerification: Boolean(data && (!data.email || !data.emailVerifiedAt)),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecoveryEmailState({ userId: session.user.id, needsVerification: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user, tenant.type]);

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
            <Link
              href={withTenantPrefix("/account/security", tenant.type)}
              className="inline-flex h-11 items-center gap-1 rounded-md border border-white/40 bg-white/10 px-2 text-sm text-white hover:bg-white/20"
              aria-label="계정 보안"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">계정 보안</span>
            </Link>
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
              <Button size="sm" className="bg-service-600 text-white hover:bg-service-700">
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
      {session?.user &&
      recoveryEmailState?.userId === session.user.id &&
      recoveryEmailState.needsVerification ? (
        <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          비밀번호 분실에 대비해 복구 이메일 인증을 완료해 주세요.{" "}
          <Link href={withTenantPrefix("/account/security", tenant.type)} className="font-semibold underline underline-offset-4">
            지금 설정
          </Link>
        </div>
      ) : null}
    </header>
  );
}
