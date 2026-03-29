"use client";

import { useRef, useState, useEffect } from "react";

export interface PercentileSessionData {
  sessionLabel: string;
  examDate: string;
  rank: number;
  totalStudents: number;
  avgScore: number;
  percentile: number;
}

export interface PercentileChartProps {
  sessions: PercentileSessionData[];
  studentName: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: PercentileSessionData | null;
}

function computeTrend(sessions: PercentileSessionData[]): "up" | "down" | "flat" {
  const last3 = sessions.slice(-3);
  if (last3.length < 2) return "flat";
  // Higher percentile = higher = better (we inverted Y-axis: top = 100%)
  const delta = last3[last3.length - 1].percentile - last3[0].percentile;
  if (delta >= 3) return "up";
  if (delta <= -3) return "down";
  return "flat";
}

export function PercentileChart({ sessions, studentName }: PercentileChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      setContainerWidth(node.clientWidth);
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-[24px] border border-dashed border-ink/10 text-sm text-slate">
        백분위 데이터가 없습니다.
      </div>
    );
  }

  // Take last 12 sessions
  const displaySessions = sessions.slice(-12);

  // Chart dimensions
  const height = 200;
  const paddingLeft = 44;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 32;

  const chartWidth = Math.max(containerWidth - paddingLeft - paddingRight, 0);
  const chartHeight = height - paddingTop - paddingBottom;

  // Y: percentile 0-100, inverted: 100% at top, 0% at bottom
  function toY(pct: number) {
    // pct=100 → y=paddingTop, pct=0 → y=paddingTop+chartHeight
    return paddingTop + (1 - pct / 100) * chartHeight;
  }

  // X: evenly spaced
  function toX(index: number) {
    if (displaySessions.length === 1) {
      return paddingLeft + chartWidth / 2;
    }
    return paddingLeft + (index / (displaySessions.length - 1)) * chartWidth;
  }

  // Build path points
  const points = displaySessions.map((s, i) => ({
    x: toX(i),
    y: toY(s.percentile),
    data: s,
  }));

  // SVG path for line
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // SVG path for area fill (close to bottom)
  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)}` +
    ` L ${points[0].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} Z`;

  // Reference lines: 70% (상위30%), 50% (상위50%), 30% (상위70%)
  const refLines = [
    { pct: 70, label: "상위30%", color: "#1F4D3A" },
    { pct: 50, label: "상위50%", color: "#94A3B8" },
    { pct: 30, label: "상위70%", color: "#C55A11" },
  ];

  // Y-axis labels
  const yLabels = [100, 75, 50, 25, 0];

  // Computed stats
  const bestPercentile = Math.max(...displaySessions.map((s) => s.percentile));
  const last5 = displaySessions.slice(-5);
  const recentAvgPercentile =
    last5.length > 0
      ? Math.round(last5.reduce((acc, s) => acc + s.percentile, 0) / last5.length)
      : null;
  const trend = computeTrend(displaySessions);

  const trendBadge = () => {
    if (trend === "up")
      return (
        <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
          ▲ 상승 추세
        </span>
      );
    if (trend === "down")
      return (
        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
          ▼ 하락 추세
        </span>
      );
    return (
      <span className="inline-flex items-center rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
        ■ 유지 추세
      </span>
    );
  };

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <h2 className="text-xl font-semibold">
        백분위 추이
        <span className="ml-2 text-sm font-normal text-slate">(높을수록 상위권)</span>
      </h2>
      <p className="mt-1 text-sm text-slate">
        {studentName} 학생의 회차별 백분위를 시계열로 표시합니다.
        점선: 상위 30% / 50% / 70% 기준선
      </p>

      {/* SVG Chart */}
      <div ref={containerRef} className="relative mt-4 select-none" style={{ height }}>
        {containerWidth > 0 && (
          <svg
            width={containerWidth}
            height={height}
            className="overflow-visible"
            onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
          >
            {/* Gradient definition */}
            <defs>
              <linearGradient id="pct-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1F4D3A" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#1F4D3A" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Y-axis labels */}
            {yLabels.map((pct) => (
              <text
                key={pct}
                x={paddingLeft - 6}
                y={toY(pct) + 4}
                textAnchor="end"
                fontSize={10}
                fill="#4B5563"
              >
                {pct}%
              </text>
            ))}

            {/* Horizontal gridlines */}
            {yLabels.map((pct) => (
              <line
                key={`grid-${pct}`}
                x1={paddingLeft}
                y1={toY(pct)}
                x2={paddingLeft + chartWidth}
                y2={toY(pct)}
                stroke="#E5E7EB"
                strokeWidth={1}
              />
            ))}

            {/* Reference dashed lines */}
            {refLines.map((ref) => (
              <g key={ref.pct}>
                <line
                  x1={paddingLeft}
                  y1={toY(ref.pct)}
                  x2={paddingLeft + chartWidth}
                  y2={toY(ref.pct)}
                  stroke={ref.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  opacity={0.7}
                />
                <text
                  x={paddingLeft + chartWidth + 2}
                  y={toY(ref.pct) + 4}
                  fontSize={9}
                  fill={ref.color}
                  opacity={0.9}
                >
                  {ref.label}
                </text>
              </g>
            ))}

            {/* Area fill */}
            <path d={areaPath} fill="url(#pct-area-fill)" />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke="#1F4D3A"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Dots with hover zones */}
            {points.map((p, i) => (
              <g key={i}>
                {/* invisible hover zone */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill="transparent"
                  onMouseEnter={() =>
                    setTooltip({
                      visible: true,
                      x: p.x,
                      y: p.y,
                      data: p.data,
                    })
                  }
                />
                {/* visible dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill="#1F4D3A"
                  stroke="white"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              </g>
            ))}

            {/* X-axis labels — show only every Nth to prevent overlap */}
            {points.map((p, i) => {
              const step = displaySessions.length <= 6 ? 1 : displaySessions.length <= 9 ? 2 : 3;
              if (i % step !== 0 && i !== displaySessions.length - 1) return null;
              const label = p.data.sessionLabel;
              return (
                <text
                  key={`xlabel-${i}`}
                  x={p.x}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#4B5563"
                >
                  {label.length > 6 ? label.slice(0, 6) : label}
                </text>
              );
            })}

            {/* Tooltip */}
            {tooltip.visible && tooltip.data && (() => {
              const tw = 140;
              const th = 68;
              const margin = 8;
              let tx = tooltip.x - tw / 2;
              let ty = tooltip.y - th - margin;
              if (tx < paddingLeft) tx = paddingLeft;
              if (tx + tw > containerWidth) tx = containerWidth - tw;
              if (ty < 0) ty = tooltip.y + margin;

              return (
                <g>
                  <rect
                    x={tx}
                    y={ty}
                    width={tw}
                    height={th}
                    rx={10}
                    ry={10}
                    fill="white"
                    stroke="#E5E7EB"
                    strokeWidth={1}
                    filter="drop-shadow(0 2px 8px rgba(0,0,0,0.10))"
                  />
                  <text x={tx + 10} y={ty + 18} fontSize={11} fontWeight="600" fill="#111827">
                    {tooltip.data.sessionLabel}
                  </text>
                  <text x={tx + 10} y={ty + 33} fontSize={10} fill="#4B5563">
                    {`상위 ${(100 - tooltip.data.percentile).toFixed(1)}%`}
                    {` (백분위 ${tooltip.data.percentile.toFixed(1)}%)`}
                  </text>
                  <text x={tx + 10} y={ty + 48} fontSize={10} fill="#4B5563">
                    {`${tooltip.data.rank}위 / ${tooltip.data.totalStudents}명`}
                  </text>
                  <text x={tx + 10} y={ty + 62} fontSize={10} fill="#4B5563">
                    {`점수: ${tooltip.data.avgScore.toFixed(1)}점`}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Trend Summary */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate">최고 백분위</span>
          <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
            상위 {(100 - bestPercentile).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate">최근 추세</span>
          {trendBadge()}
        </div>
        {recentAvgPercentile !== null && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate">최근 5회 평균</span>
            <span className="text-xs font-semibold text-ink">
              백분위 {recentAvgPercentile}% (상위 {100 - recentAvgPercentile}%)
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
