"use client";

import { TrendLineChart } from "@/components/analytics/charts";

export type ScorePoint = { date: string; total: number; avg: number };

export function ScoreChart({ data }: { data: ScorePoint[] }) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-ink">성적 추이</h2>
      <p className="mb-4 text-xs text-slate">날짜별 평균 점수 변화 (60점 기준선)</p>
      <TrendLineChart
        data={data}
        xKey="date"
        className="h-56"
        lines={[
          { dataKey: "avg", color: "#1F4D3A", name: "일별 평균" },
        ]}
      />
    </div>
  );
}
