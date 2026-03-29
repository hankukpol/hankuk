"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SubmissionTrendItem {
  date: string;
  count: number;
}

interface DashboardSubmissionTrendChartProps {
  data: SubmissionTrendItem[];
}

export default function DashboardSubmissionTrendChart({
  data,
}: DashboardSubmissionTrendChartProps) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3a66f5" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3a66f5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              fontSize: "13px",
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#3a66f5"
            strokeWidth={2.5}
            fill="url(#colorCount)"
            dot={{ r: 4, fill: "#3a66f5", stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "#3a66f5", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {data.length === 0 ? (
        <p className="mt-2 text-center text-xs text-slate-400">
          최근 제출 데이터가 없습니다.
        </p>
      ) : null}
    </div>
  );
}
