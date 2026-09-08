"use client";

import { LogOut, Menu } from "lucide-react";

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
};

export function MobileHeader({
  title,
  subtitle,
  onMenuClick,
  onLogout,
  isLoggingOut = false,
}: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-admin-line bg-white/90 px-4 py-3">
      <div className="flex items-center gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="admin-icon-button"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="admin-help">{subtitle}</p> : null}
        </div>
      </div>

      {onLogout ? (
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className="admin-button"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      ) : null}
    </header>
  );
}
