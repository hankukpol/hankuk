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

export const portalPageClass =
  "min-h-[100dvh] w-full overflow-x-hidden bg-[var(--background)] px-3 py-3 md:px-5 md:py-5";

export const portalContainerClass =
  "mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-3 md:gap-4";

export const portalSectionClass =
  "rounded-[10px] border border-[var(--border)] bg-white p-4 shadow-card md:p-6";

export const portalInsetClass =
  "rounded-[10px] border border-[var(--border)] bg-[#F4F4F2] p-3.5 md:p-4";

export const portalCardClass =
  "rounded-[10px] border border-[var(--border)] bg-white shadow-card";

export const portalChipClass =
  "inline-flex items-center rounded-[10px] border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--foreground)]";

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
          <h2 className="text-[17px] font-bold text-[var(--foreground)] md:text-[20px]">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--muted)] md:text-sm">
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
  valueToneClassName = "text-[var(--foreground)]",
}: PortalMetricCardProps) {
  return (
    <article className={`${portalSectionClass} flex min-h-[88px] flex-col justify-between md:min-h-[110px]`}>
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-2 text-[24px] font-bold tracking-tight md:text-[28px] ${valueToneClassName}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--muted)] md:text-[13px]">
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
  titleClassName = "text-[14px] font-bold text-[var(--foreground)] md:text-[16px]",
  className = "",
}: PortalMiniTileProps) {
  return (
    <article className={`${portalInsetClass} min-w-0 ${className}`.trim()}>
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>
      <div className={`mt-1.5 min-w-0 break-keep [overflow-wrap:anywhere] ${titleClassName}`}>
        {title}
      </div>
      {description ? (
        <div className="mt-1 min-w-0 break-keep text-[13px] leading-[1.5] text-[var(--muted)] [overflow-wrap:anywhere] md:text-sm">
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
    <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[#F4F4F2] px-4 py-5 md:px-5 md:py-6">
      <p className="text-[14px] font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--muted)]">{description}</p>
    </div>
  );
}
