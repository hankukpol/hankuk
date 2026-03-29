"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type RadarScoreDataPoint = {
  subject: string;
  score: number;
  avg: number;
};

type RadarScoreChartProps = {
  data: RadarScoreDataPoint[];
};

export function RadarScoreChart({ data }: RadarScoreChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-[24px] border border-dashed border-ink/10 text-sm text-slate">
        차트 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-ink">과목별 점수 분포</h3>
      <p className="mb-4 text-xs text-slate">내 점수(주황) vs 전체 평균(회색 점선)</p>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 12, fill: "#4B5563" }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tickCount={5}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
          />
          <Radar
            name="내 점수"
            dataKey="score"
            stroke="#C55A11"
            fill="#C55A11"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Radar
            name="전체 평균"
            dataKey="avg"
            stroke="#4B5563"
            fill="none"
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
          <Tooltip
            formatter={(value, name) => [`${value}점`, name]}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
