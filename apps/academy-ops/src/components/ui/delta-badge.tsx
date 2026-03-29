"use client";

type DeltaBadgeProps = {
  /** Pass either (current + previous) pair or a pre-computed delta value */
  current?: number | null;
  previous?: number | null;
  /** Pre-computed delta (current − previous). Used when current/previous are not available separately. */
  delta?: number | null;
  decimals?: number;
  size?: "sm" | "md";
  className?: string;
};

export function DeltaBadge({
  current,
  previous,
  delta: deltaProp,
  decimals = 1,
  size = "sm",
  className = "",
}: DeltaBadgeProps) {
  // Compute effective delta
  let diff: number | null = null;
  if (deltaProp !== undefined && deltaProp !== null) {
    diff = Math.round(deltaProp * Math.pow(10, decimals + 1)) / Math.pow(10, decimals + 1);
  } else if (
    current !== null &&
    current !== undefined &&
    previous !== null &&
    previous !== undefined
  ) {
    diff = Math.round((current - previous) * Math.pow(10, decimals + 1)) / Math.pow(10, decimals + 1);
  }

  const sizeClass = size === "md" ? "text-sm" : "text-xs";

  if (diff === null) {
    return (
      <span
        className={`inline-flex items-center text-slate ${sizeClass} font-medium ${className}`.trim()}
        role="status"
        aria-label="이전 기록 없음"
      >
        —
      </span>
    );
  }

  const absDiff = Math.abs(diff);
  const isNeutral = absDiff < 0.05;

  if (isNeutral) {
    return (
      <span
        className={`inline-flex items-center text-slate ${sizeClass} font-semibold ${className}`.trim()}
        role="status"
        aria-label="이전 대비 변화 없음"
      >
        —
      </span>
    );
  }

  const isUp = diff > 0;
  const toneClass = isUp ? "text-forest" : "text-red-600";
  const arrow = isUp ? "▲" : "▼";
  const label = `${arrow}${absDiff.toFixed(decimals)}`;
  const ariaLabel = isUp
    ? `이전 대비 상승 ${absDiff.toFixed(decimals)}점`
    : `이전 대비 하락 ${absDiff.toFixed(decimals)}점`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${toneClass} ${sizeClass} font-semibold ${className}`.trim()}
      role="status"
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}
