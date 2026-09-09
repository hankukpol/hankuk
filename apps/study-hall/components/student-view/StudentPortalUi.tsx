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
 * DESIGN.md 8절 — 학생 포털은 관리자 화면과 같은 셸·규격을 쓴다.
 * 페이지 루트는 `.admin-shell`, 본문은 `.admin-main` + `.admin-content-frame`,
 * 세로 흐름은 `.admin-flat-page`(24px 간격)다.
 *
 * 요약은 테두리 상자가 아니라 얇은 선으로만 나눈 평면 격자(`.admin-portal-summary`)이고,
 * 목록은 폭에 상관없이 표다. 좁은 화면에서는 `.admin-table-frame` 안에서 가로 스크롤한다.
 * 화면을 카드로 덮지 않는다.
 */

/** 독립된 의미가 있는 패널에만 쓴다(DESIGN.md 5.3). 페이지 전체를 감싸지 않는다. */
export const portalSectionClass =
  "rounded-lg border border-admin-line bg-admin-surface p-4 md:p-5";

export const portalInsetClass =
  "rounded-lg border border-admin-line-soft bg-admin-surface-soft p-4";

export const portalCardClass = "admin-record-card";

export const portalChipClass = "admin-badge";

/** 평면 요약 격자. 모바일에서도 세로로 접지 않는다. */
export const portalMetricGridClass = "admin-portal-summary";

export const portalMetricGrid3Class = "admin-portal-summary admin-portal-summary-3";

/** 대시보드 지표는 관리자 KPI와 같은 32px 숫자를 쓴다. */
export const portalKpiGridClass = "admin-portal-summary admin-portal-summary-kpi";

/** 기록 카드 안의 항목 격자. 카드는 전체 폭을 유지하고 내부만 다열로 둔다. */
export const portalDetailsClass = "admin-portal-details";

export const portalDetails3Class = "admin-portal-details admin-portal-details-3";

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
    /* DESIGN.md 5.3 — 작업 행은 좁은 폭에서 줄바꿈한다.
       action 에 shrink-0 만 주면 제목이 한 글자 폭으로 붕괴한다. */
    <div className="admin-workspace-toolbar">
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center"
              style={{ color: "var(--admin-accent)" }}
            >
              {icon}
            </div>
          ) : null}
          <h2 className="admin-section-title">{title}</h2>
        </div>
        {description ? <p className="admin-help mt-1.5">{description}</p> : null}
      </div>
      {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
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
    /* 평면 요약 한 칸. 테두리 상자를 만들지 않는다. */
    <div>
      <p className="admin-portal-summary-label">{label}</p>
      <p className={`admin-portal-summary-value ${valueToneClassName}`}>{value}</p>
      <p className="admin-help mt-1">{caption}</p>
    </div>
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
    <div className={`min-w-0 ${className}`.trim()}>
      <p className="admin-portal-summary-label">{label}</p>
      <div className={`mt-1 min-w-0 break-keep [overflow-wrap:anywhere] ${titleClassName}`}>
        {title}
      </div>
      {description ? (
        <div className="admin-help mt-1 min-w-0 break-keep [overflow-wrap:anywhere]">
          {description}
        </div>
      ) : null}
    </div>
  );
}

export function PortalEmptyState({ title, description }: PortalEmptyStateProps) {
  return (
    /* DESIGN.md 5.3 — 빈 상태는 점선 상자가 아니라 평면 soft 영역이다. */
    <div className="admin-empty-state">
      <p className="text-[15px] font-semibold text-admin-text">{title}</p>
      <p className="admin-help mt-1.5">{description}</p>
    </div>
  );
}
