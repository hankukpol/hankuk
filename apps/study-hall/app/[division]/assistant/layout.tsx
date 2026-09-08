import type { ReactNode } from "react";

import { AssistantBottomNav } from "@/components/layout/AssistantBottomNav";
import { AppSwitchMenu } from "@/components/layout/AppSwitchMenu";
import { requireDivisionAssistantAccess } from "@/lib/auth";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AssistantLayoutProps = {
  children: ReactNode;
  params: {
    division: string;
  };
};

export default async function AssistantLayout({ children, params }: AssistantLayoutProps) {
  const [session, division, featureSettings] = await Promise.all([
    requireDivisionAssistantAccess(params.division),
    getDivisionBySlug(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  return (
    <div className="admin-shell flex-col">
      {/* DESIGN.md 5.1 — 조교 화면도 같은 토큰을 쓰고 상단은 검은 헤더로 통일한다. */}
      <header className="admin-mobile-header">
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-bold leading-tight">
            {division?.name ?? params.division}
          </h1>
          <p className="truncate text-[13px] text-white/60">조교 · {session.name}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AppSwitchMenu role="assistant" divisionSlug={params.division} />
          <form action="/api/auth/logout" method="post" className="shrink-0">
            <button
              type="submit"
              className="admin-button"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <main className="admin-main mx-auto w-full max-w-4xl pb-24">{children}</main>

      <AssistantBottomNav
        divisionSlug={params.division}
        phoneSubmissionsEnabled={featureSettings.featureFlags.phoneSubmissions}
      />
    </div>
  );
}
