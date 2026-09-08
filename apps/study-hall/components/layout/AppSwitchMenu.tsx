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

export function AppSwitchMenu({ role, divisionSlug = null }: AppSwitchMenuProps) {
  const portalUrl = getPortalUrl();
  const quickTargets = getHankukPortalQuickSwitchTargets({
    currentAppKey: HANKUK_APP_KEYS.STUDY_HALL,
    role,
    divisionSlug,
  });

  return (
    /* DESIGN.md 5.12 — 드롭다운 항목은 버튼이 아니라 작업 메뉴 항목이다. */
    <details className="admin-action-menu">
      <summary className="admin-action-menu-trigger list-none cursor-pointer [&::-webkit-details-marker]:hidden">
        앱 전환
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="admin-action-menu-panel">
        <p className="admin-action-menu-description px-4 pb-2 pt-1">
          포털 로그인 상태를 유지한 채 다른 관리자 앱으로 바로 이동합니다.
        </p>

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
              className="admin-action-menu-item"
            >
              <span>{target.displayName}</span>
              <span className="admin-action-menu-description">
                {getRoleBadge(target.role)}
                {target.divisionSlug ? ` · ${target.divisionSlug}` : ""}
              </span>
            </a>
          ))
        ) : (
          <p className="admin-action-menu-description px-4 py-3">
            같은 권한으로 바로 이동할 수 있는 앱이 없습니다.
          </p>
        )}

        <a href={portalUrl} className="admin-action-menu-item border-t border-admin-line-soft">
          <span>포털 홈에서 전체 앱 보기 ↗</span>
        </a>
      </div>
    </details>
  );
}
