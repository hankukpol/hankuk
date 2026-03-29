"use client";

export interface ScoreDistribution {
  s90: number;
  s80: number;
  s70: number;
  s60: number;
  sBelow60: number;
}

interface DistributionBarProps {
  distribution: ScoreDistribution;
}

export function DistributionBar({ distribution }: DistributionBarProps) {
  const { s90, s80, s70, s60, sBelow60 } = distribution;
  const total = s90 + s80 + s70 + s60 + sBelow60;

  if (total === 0) {
    return <span className="text-xs text-ink/25">데이터 없음</span>;
  }

  const pct = (count: number) => Math.round((count / total) * 100);
  const segments = [
    { value: s90, color: "#1F4D3A", label: "90+", pct: pct(s90) },
    { value: s80, color: "#4ADE80", label: "80-89", pct: pct(s80) },
    { value: s70, color: "#FCD34D", label: "70-79", pct: pct(s70) },
    { value: s60, color: "#FB923C", label: "60-69", pct: pct(s60) },
    { value: sBelow60, color: "#C55A11", label: "60 미만", pct: pct(sBelow60) },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className="flex h-2.5 w-20 overflow-hidden rounded-full"
        title={`90+:${s90} / 80-89:${s80} / 70-79:${s70} / 60-69:${s60} / 60 미만:${sBelow60}`}
      >
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${segment.pct}%`, backgroundColor: segment.color }}
            title={`${segment.label}: ${segment.value}명 (${segment.pct}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-0.5 text-[10px] text-slate">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label}:{segment.value}
          </span>
        ))}
      </div>
    </div>
  );
}

interface DeltaBadgeProps {
  delta: number | null;
}

export function DeltaBadge({ delta }: DeltaBadgeProps) {
  if (delta === null) {
    return <span className="text-xs text-ink/25">비교 없음</span>;
  }

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
        변화 없음 0.0
      </span>
    );
  }

  const isUp = delta > 0;
  return (
    <span
      className={
        isUp
          ? "inline-flex items-center gap-0.5 rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest"
          : "inline-flex items-center gap-0.5 rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-xs font-semibold text-ember"
      }
    >
      {isUp ? "상승" : "하락"} {Math.abs(delta).toFixed(1)}
    </span>
  );
}
