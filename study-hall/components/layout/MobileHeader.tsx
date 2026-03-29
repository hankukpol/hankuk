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
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-black/10 text-slate-700 transition hover:bg-slate-50"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>

      {onLogout ? (
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200-black/10 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      ) : null}
    </header>
  );
}
