"use client";

import {
  HANKUK_APP_KEYS,
  getHankukPortalLaunchUrl,
  getHankukPortalQuickSwitchTargets,
  type HankukPortalTargetRole,
} from "@hankuk/config";
import { ChevronDown, ExternalLink } from "lucide-react";

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
      <summary className="admin-app-switch-trigger [&::-webkit-details-marker]:hidden">
        앱 전환
        <ChevronDown aria-hidden="true" />
      </summary>

      <div className="admin-app-switch-panel">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">앱 바로가기</p>
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
                className="admin-app-switch-item"
              >
                <span className="font-medium">{target.displayName}</span>
                <span className="text-xs text-slate-400">
                  {getRoleBadge(target.role)}
                  {target.divisionSlug ? ` · ${target.divisionSlug}` : ""}
                </span>
              </a>
            ))
          ) : (
            <div className="bg-slate-50 px-3 py-3 text-sm text-slate-500">
              같은 권한으로 바로 이동할 수 있는 앱이 없습니다.
            </div>
          )}
        </div>

        <div className="mt-2 border-t border-slate-100 pt-2">
          <a
            href={portalUrl}
            className="admin-app-switch-item font-semibold"
          >
            <span>포털 홈에서 전체 앱 보기</span>
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>
    </details>
  );
}
