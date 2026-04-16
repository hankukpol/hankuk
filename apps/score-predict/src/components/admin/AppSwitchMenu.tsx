"use client";

import {
  HANKUK_APP_KEYS,
  getHankukPortalLaunchUrl,
  getHankukPortalQuickSwitchTargets,
  type HankukPortalTargetRole,
} from "@hankuk/config";

import { getPortalUrl } from "@/lib/portal";

type AppSwitchMenuProps = {
  role: HankukPortalTargetRole;
  divisionSlug?: string | null;
};

function getRoleBadge(role: HankukPortalTargetRole) {
  switch (role) {
    case "super_admin":
      return "슈퍼 관리자";
    case "assistant":
      return "조교";
    case "staff":
      return "직원";
    default:
      return "관리자";
  }
}

export default function AppSwitchMenu({ role, divisionSlug = null }: AppSwitchMenuProps) {
  const portalUrl = getPortalUrl();
  const quickTargets = getHankukPortalQuickSwitchTargets({
    currentAppKey: HANKUK_APP_KEYS.SCORE_PREDICT,
    role,
    divisionSlug,
  });

  return (
    <details className="relative">
      <summary className="flex list-none cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 [&::-webkit-details-marker]:hidden">
        앱 전환
        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Quick Switch</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            포털 로그인 상태를 유지한 채 다른 관리자 앱으로 바로 이동합니다.
          </p>
        </div>

        <div className="space-y-1">
          {quickTargets.length > 0 ? (
            quickTargets.map((target) => (
              <a
                key={`${target.appKey}-${target.role}-${target.divisionSlug ?? "global"}`}
                href={getHankukPortalLaunchUrl({
                  portalUrl,
                  appKey: target.appKey,
                  role: target.role,
                  divisionSlug: target.divisionSlug,
                })}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                <span className="font-medium">{target.displayName}</span>
                <span className="text-[11px] text-slate-400">
                  {getRoleBadge(target.role)}
                  {target.divisionSlug ? ` · ${target.divisionSlug}` : ""}
                </span>
              </a>
            ))
          ) : (
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
              같은 권한으로 바로 이동할 수 있는 앱이 없습니다.
            </div>
          )}
        </div>

        <div className="mt-2 border-t border-slate-100 pt-2">
          <a
            href={portalUrl}
            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
          >
            <span>포털 홈에서 전체 앱 보기</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </details>
  );
}
