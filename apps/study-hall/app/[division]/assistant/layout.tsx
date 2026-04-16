import type { ReactNode } from "react";

import { AssistantBottomNav } from "@/components/layout/AssistantBottomNav";
import { AppSwitchMenu } from "@/components/layout/AppSwitchMenu";
import { requireDivisionAssistantAccess } from "@/lib/auth";
import { getDivisionBySlug } from "@/lib/services/division.service";

type AssistantLayoutProps = {
  children: ReactNode;
  params: {
    division: string;
  };
};

export default async function AssistantLayout({ children, params }: AssistantLayoutProps) {
  const [session, division] = await Promise.all([
    requireDivisionAssistantAccess(params.division),
    getDivisionBySlug(params.division),
  ]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[rgb(238_243_248/0.9)] backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-black/5 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--division-color)]">
                조교 모드
              </p>
              <h1 className="mt-1 truncate text-base font-bold text-slate-950">
                {division?.name ?? params.division}
              </h1>
              <p className="text-xs text-slate-500">{session.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <AppSwitchMenu role="assistant" divisionSlug={params.division} />
              <form action="/api/auth/logout" method="post" className="shrink-0">
                <button
                  type="submit"
                  className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24 pt-4">{children}</main>

      <AssistantBottomNav divisionSlug={params.division} />
    </div>
  );
}
