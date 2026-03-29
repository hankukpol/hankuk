"use client";

import { useState } from "react";

export type HeatmapCell = {
  subject: string;
  weekKey: string;
  avg: number;
  count: number;
};

type HeatmapClientProps = {
  weeks: string[];
  subjects: string[];
  data: HeatmapCell[];
  subjectLabels: Record<string, string>;
};

function getScoreColorClass(avg: number): string {
  if (avg >= 80) return "bg-green-500 text-white";
  if (avg >= 70) return "bg-green-300 text-green-900";
  if (avg >= 60) return "bg-yellow-300 text-yellow-900";
  if (avg >= 50) return "bg-amber-300 text-amber-900";
  if (avg >= 40) return "bg-orange-300 text-orange-900";
  return "bg-red-400 text-white";
}

function getScoreBgClass(avg: number): string {
  if (avg >= 80) return "bg-green-500";
  if (avg >= 70) return "bg-green-300";
  if (avg >= 60) return "bg-yellow-300";
  if (avg >= 50) return "bg-amber-300";
  if (avg >= 40) return "bg-orange-300";
  return "bg-red-400";
}

function formatWeekLabel(weekKey: string): string {
  // weekKey format: "2026-W01"
  const [year, weekPart] = weekKey.split("-");
  const week = weekPart?.replace("W", "") ?? "";
  return `${year}\n${week}주`;
}

function formatWeekShort(weekKey: string): string {
  const weekPart = weekKey.split("-")[1] ?? "";
  return weekPart.replace("W", "") + "주";
}

export function HeatmapClient({
  weeks,
  subjects,
  data,
  subjectLabels,
}: HeatmapClientProps) {
  const [tooltip, setTooltip] = useState<{
    subject: string;
    weekKey: string;
    avg: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  if (subjects.length === 0 || weeks.length === 0) {
    return (
      <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
        <p className="text-sm font-medium text-ink">데이터 없음</p>
        <p className="mt-1 text-xs text-slate">
          선택한 기간에 해당하는 성적 데이터가 없습니다.
        </p>
      </div>
    );
  }

  // Build lookup map for O(1) access
  const cellMap = new Map<string, HeatmapCell>();
  for (const cell of data) {
    cellMap.set(`${cell.subject}:::${cell.weekKey}`, cell);
  }

  // Compute subject averages for the row summary column
  const subjectAvgMap = new Map<string, { sum: number; count: number }>();
  for (const cell of data) {
    const prev = subjectAvgMap.get(cell.subject) ?? { sum: 0, count: 0 };
    subjectAvgMap.set(cell.subject, {
      sum: prev.sum + cell.avg * cell.count,
      count: prev.count + cell.count,
    });
  }

  // Compute week averages
  const weekAvgMap = new Map<string, { sum: number; count: number }>();
  for (const cell of data) {
    const prev = weekAvgMap.get(cell.weekKey) ?? { sum: 0, count: 0 };
    weekAvgMap.set(cell.weekKey, {
      sum: prev.sum + cell.avg * cell.count,
      count: prev.count + cell.count,
    });
  }

  const totalSum = data.reduce((s, c) => s + c.avg * c.count, 0);
  const totalCount = data.reduce((s, c) => s + c.count, 0);
  const overallAvg = totalCount > 0 ? totalSum / totalCount : null;

  return (
    <div className="relative space-y-6">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-2xl border border-ink/10 bg-ink px-4 py-3 text-sm text-white shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <p className="font-semibold">
            {subjectLabels[tooltip.subject] ?? tooltip.subject}
          </p>
          <p className="mt-0.5 text-xs text-white/80">
            {tooltip.weekKey.replace("-W", "년 ") + "주차"}
          </p>
          <p className="mt-1 text-base font-bold">{tooltip.avg.toFixed(1)}점</p>
          <p className="text-xs text-white/70">{tooltip.count}명 응시</p>
        </div>
      )}

      {/* Heatmap Grid */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">과목 × 주차 히트맵</h2>
        <p className="mt-1 text-xs text-slate">
          셀 색상: 빨강(낮음) → 주황 → 노랑 → 초록(높음). 빈 셀은 해당 주차 시험 없음.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {/* Subject header column */}
                <th className="sticky left-0 z-10 min-w-[120px] bg-white px-3 py-2 text-left text-xs font-semibold text-slate">
                  과목
                </th>
                {weeks.map((weekKey) => {
                  const weekAvg = weekAvgMap.get(weekKey);
                  const wa =
                    weekAvg && weekAvg.count > 0
                      ? weekAvg.sum / weekAvg.count
                      : null;
                  return (
                    <th
                      key={weekKey}
                      className="min-w-[56px] px-1 py-1 text-center text-xs font-medium text-slate"
                    >
                      <div>{formatWeekShort(weekKey)}</div>
                      {wa !== null && (
                        <div
                          className={`mx-auto mt-1 h-1.5 w-8 rounded-full ${getScoreBgClass(wa)}`}
                        />
                      )}
                    </th>
                  );
                })}
                <th className="min-w-[60px] px-2 py-2 text-center text-xs font-semibold text-slate">
                  평균
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {subjects.map((subject) => {
                const subjectLabel = subjectLabels[subject] ?? subject;
                const subjectAgg = subjectAvgMap.get(subject);
                const subjectAvg =
                  subjectAgg && subjectAgg.count > 0
                    ? subjectAgg.sum / subjectAgg.count
                    : null;

                return (
                  <tr key={subject} className="hover:bg-mist/40">
                    <td className="sticky left-0 z-10 min-w-[120px] bg-white px-3 py-2 font-medium text-ink">
                      {subjectLabel}
                    </td>
                    {weeks.map((weekKey) => {
                      const cell = cellMap.get(`${subject}:::${weekKey}`);
                      if (!cell) {
                        return (
                          <td
                            key={weekKey}
                            className="px-1 py-1 text-center"
                          >
                            <div className="mx-auto h-9 w-12 rounded-lg bg-ink/5" />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={weekKey}
                          className="px-1 py-1 text-center"
                          onMouseEnter={(e) => {
                            setTooltip({
                              subject: cell.subject,
                              weekKey: cell.weekKey,
                              avg: cell.avg,
                              count: cell.count,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onMouseMove={(e) => {
                            setTooltip((prev) =>
                              prev
                                ? { ...prev, x: e.clientX, y: e.clientY }
                                : null,
                            );
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <div
                            className={`mx-auto flex h-9 w-12 cursor-default items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-110 ${getScoreColorClass(cell.avg)}`}
                          >
                            {cell.avg.toFixed(0)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center">
                      {subjectAvg !== null ? (
                        <span
                          className={`inline-flex h-8 w-14 items-center justify-center rounded-lg text-xs font-bold ${getScoreColorClass(subjectAvg)}`}
                        >
                          {subjectAvg.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/60">
                <td className="sticky left-0 z-10 bg-mist/60 px-3 py-2 text-xs font-semibold text-slate">
                  주차 평균
                </td>
                {weeks.map((weekKey) => {
                  const weekAvg = weekAvgMap.get(weekKey);
                  const wa =
                    weekAvg && weekAvg.count > 0
                      ? weekAvg.sum / weekAvg.count
                      : null;
                  return (
                    <td
                      key={weekKey}
                      className="px-1 py-2 text-center text-xs font-semibold"
                    >
                      {wa !== null ? (
                        <span
                          className={`inline-flex h-7 w-12 items-center justify-center rounded-lg text-xs font-bold ${getScoreColorClass(wa)}`}
                        >
                          {wa.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center text-xs font-bold text-ink">
                  {overallAvg !== null ? overallAvg.toFixed(1) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-[24px] border border-ink/10 bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">범례</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-red-400" />
            0~40점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-orange-300" />
            40~50점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-amber-300" />
            50~60점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-yellow-300" />
            60~70점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-green-300" />
            70~80점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-green-500" />
            80점 이상
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-8 rounded bg-ink/5" />
            시험 없음
          </span>
        </div>
        <p className="mt-3 text-xs text-slate">
          * 각 셀의 숫자는 해당 주차·과목의 응시자 평균 점수입니다. 결시자(ABSENT)는 집계에서 제외됩니다.
        </p>
      </div>

      {/* Subject summary table */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">과목별 전체 평균 요약</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                <th className="pb-2 pr-4">과목</th>
                <th className="pb-2 pr-4 text-right">응시 건수</th>
                <th className="pb-2 pr-4 text-right">평균 점수</th>
                <th className="pb-2">점수 분포</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {subjects
                .map((subject) => {
                  const agg = subjectAvgMap.get(subject);
                  const avg =
                    agg && agg.count > 0 ? agg.sum / agg.count : null;
                  return { subject, avg, count: agg?.count ?? 0 };
                })
                .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
                .map(({ subject, avg, count }) => (
                  <tr key={subject} className="hover:bg-mist/40">
                    <td className="py-2 pr-4 font-medium text-ink">
                      {subjectLabels[subject] ?? subject}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-slate">
                      {count}건
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-semibold">
                      {avg !== null ? (
                        <span
                          className={
                            avg >= 70
                              ? "text-forest"
                              : avg >= 50
                                ? "text-amber-600"
                                : "text-red-600"
                          }
                        >
                          {avg.toFixed(1)}점
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {avg !== null && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full transition-all ${getScoreBgClass(avg)}`}
                              style={{ width: `${Math.min(avg, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate">
                            {avg.toFixed(0)}점
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
