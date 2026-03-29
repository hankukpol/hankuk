"use client";

import { useState } from "react";

export type ProgressionPoint = {
  weekLabel: string;
  weekNum: number;
  avg: number;
  count: number;
};

export type ProgressionSeries = {
  id: string;
  label: string;
  examType: string;
  points: ProgressionPoint[];
};

export type SessionRow = {
  id: number;
  examDate: string;
  week: number;
  subject: string;
  examType: string;
  avgByType: Record<string, number>;
};

type ProgressionClientProps = {
  series: ProgressionSeries[];
  sessions: SessionRow[];
  subjectLabels: Record<string, string>;
  examTypeLabels: Record<string, string>;
};

const SERIES_COLORS: Record<string, { stroke: string; dot: string; label: string }> = {
  GONGCHAE: { stroke: "#1F4D3A", dot: "#1F4D3A", label: "text-forest" },
  GYEONGCHAE: { stroke: "#C55A11", dot: "#C55A11", label: "text-ember" },
};

const FALLBACK_COLORS = [
  { stroke: "#6366f1", dot: "#6366f1", label: "text-indigo-600" },
  { stroke: "#0ea5e9", dot: "#0ea5e9", label: "text-sky-600" },
  { stroke: "#8b5cf6", dot: "#8b5cf6", label: "text-violet-600" },
];

function getSeriesColor(id: string, index: number) {
  return SERIES_COLORS[id] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const SVG_WIDTH = 800;
const SVG_HEIGHT = 320;
const PADDING = { top: 24, right: 32, bottom: 48, left: 52 };
const CHART_W = SVG_WIDTH - PADDING.left - PADDING.right;
const CHART_H = SVG_HEIGHT - PADDING.top - PADDING.bottom;

export function ProgressionClient({
  series,
  sessions,
  subjectLabels,
  examTypeLabels,
}: ProgressionClientProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [hoveredPoint, setHoveredPoint] = useState<{
    seriesId: string;
    point: ProgressionPoint;
    x: number;
    y: number;
  } | null>(null);

  const toggleSeries = (id: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (series.length === 0) {
    return (
      <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
        <p className="text-sm font-medium text-ink">데이터 없음</p>
        <p className="mt-1 text-xs text-slate">
          선택한 기간에 해당하는 성적 데이터가 없습니다.
        </p>
      </div>
    );
  }

  // Compute all week numbers across all series
  const allWeekNums = [
    ...new Set(
      series.flatMap((s) => s.points.map((p) => p.weekNum)),
    ),
  ].sort((a, b) => a - b);

  // Score domain
  const allAvgs = series.flatMap((s) => s.points.map((p) => p.avg));
  const minScore = Math.max(0, Math.floor((Math.min(...allAvgs) - 5) / 10) * 10);
  const maxScore = Math.min(100, Math.ceil((Math.max(...allAvgs) + 5) / 10) * 10);
  const scoreRange = maxScore - minScore || 10;

  // X scale: position by week number index
  const xScale = (weekNum: number): number => {
    const idx = allWeekNums.indexOf(weekNum);
    if (allWeekNums.length <= 1) return CHART_W / 2;
    return (idx / (allWeekNums.length - 1)) * CHART_W;
  };

  // Y scale: 0 top, 100 bottom (inverted)
  const yScale = (score: number): number => {
    return CHART_H - ((score - minScore) / scoreRange) * CHART_H;
  };

  // Y grid lines
  const yTicks: number[] = [];
  for (let v = minScore; v <= maxScore; v += 10) {
    yTicks.push(v);
  }

  // Build SVG paths for each series
  const paths = series.map((s, idx) => {
    const visible = s.points.filter(
      (p) => allWeekNums.includes(p.weekNum),
    );
    if (visible.length === 0) return null;
    const color = getSeriesColor(s.id, idx);
    const pathD = visible
      .map((p, i) => {
        const x = xScale(p.weekNum) + PADDING.left;
        const y = yScale(p.avg) + PADDING.top;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return { id: s.id, color, pathD, points: visible };
  });

  return (
    <div className="space-y-6">
      {/* Series Toggles */}
      <div className="flex flex-wrap gap-3">
        {series.map((s, idx) => {
          const color = getSeriesColor(s.id, idx);
          const hidden = hiddenSeries.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSeries(s.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                hidden
                  ? "border-ink/10 bg-ink/5 text-slate"
                  : "border-ink/20 bg-white text-ink"
              }`}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{
                  backgroundColor: hidden ? "#94a3b8" : color.dot,
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* SVG Line Chart */}
      <div className="relative rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">주차별 평균 점수 추이</h2>
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="h-auto w-full min-w-[480px]"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Y grid lines */}
            {yTicks.map((tick) => {
              const y = yScale(tick) + PADDING.top;
              return (
                <g key={tick}>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={PADDING.left + CHART_W}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth={1}
                  />
                  <text
                    x={PADDING.left - 6}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="#94a3b8"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* X axis labels */}
            {allWeekNums.map((weekNum) => {
              const x = xScale(weekNum) + PADDING.left;
              return (
                <text
                  key={weekNum}
                  x={x}
                  y={PADDING.top + CHART_H + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#94a3b8"
                >
                  {weekNum}주
                </text>
              );
            })}

            {/* Lines */}
            {paths.map(
              (pathInfo, idx) =>
                pathInfo && !hiddenSeries.has(pathInfo.id) && (
                  <path
                    key={pathInfo.id}
                    d={pathInfo.pathD}
                    fill="none"
                    stroke={pathInfo.color.stroke}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
            )}

            {/* Dots */}
            {paths.map((pathInfo, idx) => {
              if (!pathInfo || hiddenSeries.has(pathInfo.id)) return null;
              const color = getSeriesColor(pathInfo.id, idx);
              const seriesObj = series.find((s) => s.id === pathInfo.id)!;
              return pathInfo.points.map((p) => {
                const cx = xScale(p.weekNum) + PADDING.left;
                const cy = yScale(p.avg) + PADDING.top;
                const isHovered =
                  hoveredPoint?.seriesId === pathInfo.id &&
                  hoveredPoint?.point.weekNum === p.weekNum;
                return (
                  <circle
                    key={`${pathInfo.id}-${p.weekNum}`}
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 4}
                    fill={color.dot}
                    stroke="white"
                    strokeWidth={2}
                    className="cursor-pointer transition-all"
                    onMouseEnter={(e) => {
                      const rect = (
                        e.target as SVGCircleElement
                      ).closest("svg")!.getBoundingClientRect();
                      setHoveredPoint({
                        seriesId: pathInfo.id,
                        point: p,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  />
                );
              });
            })}
          </svg>
        </div>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="pointer-events-none fixed z-50 rounded-2xl border border-ink/10 bg-ink px-4 py-3 text-sm text-white shadow-xl"
            style={{
              left: hoveredPoint.x + 12,
              top: hoveredPoint.y - 60,
            }}
          >
            <p className="font-semibold">
              {series.find((s) => s.id === hoveredPoint.seriesId)?.label}
            </p>
            <p className="mt-0.5 text-xs text-white/80">
              {hoveredPoint.point.weekLabel}
            </p>
            <p className="mt-1 text-base font-bold">
              {hoveredPoint.point.avg.toFixed(1)}점
            </p>
            <p className="text-xs text-white/70">
              {hoveredPoint.point.count}명 응시
            </p>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">회차별 성적 상세</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                <th className="pb-2 pr-4">날짜</th>
                <th className="pb-2 pr-4">주차</th>
                <th className="pb-2 pr-4">과목</th>
                <th className="pb-2 pr-4">직렬</th>
                {series.map((s) => (
                  <th key={s.id} className="pb-2 pr-4 text-right">
                    {s.label} 평균
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {sessions.slice(0, 100).map((session) => (
                <tr key={session.id} className="hover:bg-mist/40">
                  <td className="py-2 pr-4 text-slate">
                    {new Date(session.examDate).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-ink">
                    {session.week}주
                  </td>
                  <td className="py-2 pr-4 text-slate">
                    {subjectLabels[session.subject] ?? session.subject}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        session.examType === "GONGCHAE"
                          ? "bg-forest/10 text-forest"
                          : "bg-ember/10 text-ember"
                      }`}
                    >
                      {examTypeLabels[session.examType] ?? session.examType}
                    </span>
                  </td>
                  {series.map((s) => {
                    const avg = session.avgByType[s.examType];
                    return (
                      <td
                        key={s.id}
                        className="py-2 pr-4 text-right font-mono"
                      >
                        {avg !== undefined ? (
                          <span
                            className={
                              avg >= 70
                                ? "text-forest font-semibold"
                                : avg >= 50
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {avg.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {sessions.length > 100 && (
            <p className="mt-2 text-xs text-slate">
              처음 100개 회차만 표시됩니다. 전체 {sessions.length}개.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
