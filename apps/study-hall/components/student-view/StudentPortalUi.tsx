import type { CSSProperties, ReactNode } from "react";

type PortalSectionHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

type PortalMetricCardProps = {
  label: string;
  value: string | number;
  caption: string;
  valueToneClassName?: string;
};

type PortalEmptyStateProps = {
  title: string;
  description: string;
};

/**
 * DESIGN.md 8절 — 학생 포털은 관리자와 같은 토큰·타입·모서리를 쓰되,
 * 모바일 우선 레이아웃(카드형, 넓은 터치 영역)은 유지한다.
 */
export const portalPageClass =
  "min-h-[100dvh] w-full overflow-x-hidden bg-admin-surface px-4 py-4 md:px-6 md:py-6";

export const portalContainerClass =
  "mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4";

export const portalSectionClass =
  "rounded-lg border border-admin-line bg-admin-surface p-4 md:p-5";

export const portalInsetClass =
  "rounded-lg border border-admin-line-soft bg-admin-surface-soft p-4";

export const portalCardClass = "rounded-lg border border-admin-line bg-admin-surface";

export const portalChipClass = "admin-badge";

export function getBrandSurfaceStyle(alpha = 0.12): CSSProperties {
  return {
    backgroundColor: `rgb(var(--division-color-rgb) / ${alpha})`,
  };
}

export function getBrandBorderStyle(alpha = 0.2): CSSProperties {
  return {
    borderColor: `rgb(var(--division-color-rgb) / ${alpha})`,
  };
}

export function PortalSectionHeader({
  title,
  description,
  icon,
  action,
}: PortalSectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center"
              style={{ color: "var(--division-color)" }}
            >
              {icon}
            </div>
          ) : null}
          <h2 className="admin-section-title">{title}</h2>
        </div>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-[1.5] text-admin-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PortalMetricCard({
  label,
  value,
  caption,
  valueToneClassName = "text-admin-text",
}: PortalMetricCardProps) {
  return (
    <article className={`${portalSectionClass} flex min-h-[88px] flex-col justify-between md:min-h-[110px]`}>
      <p className="text-[13px] font-medium text-admin-text-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-[20px] font-bold tracking-tight md:text-[20px] ${valueToneClassName}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-admin-text-muted md:text-[13px]">
        {caption}
      </p>
    </article>
  );
}

type PortalMiniTileProps = {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  titleClassName?: string;
  className?: string;
};

export function PortalMiniTile({
  label,
  title,
  description,
  titleClassName = "text-[15px] font-bold text-admin-text md:text-[16px]",
  className = "",
}: PortalMiniTileProps) {
  return (
    <article className={`${portalInsetClass} min-w-0 ${className}`.trim()}>
      <p className="text-[13px] font-medium text-admin-text-muted">
        {label}
      </p>
      <div className={`mt-1.5 min-w-0 break-keep [overflow-wrap:anywhere] ${titleClassName}`}>
        {title}
      </div>
      {description ? (
        <div className="mt-1 min-w-0 break-keep text-[13px] leading-[1.5] text-admin-text-muted [overflow-wrap:anywhere] md:text-sm">
          {description}
        </div>
      ) : null}
    </article>
  );
}

export function PortalEmptyState({
  title,
  description,
}: PortalEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-admin-line bg-admin-surface-soft px-4 py-5 md:px-5 md:py-6">
      <p className="text-[15px] font-semibold text-admin-text">{title}</p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-admin-text-muted">{description}</p>
    </div>
  );
}
