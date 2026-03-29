"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DivisionOverviewSummary } from "@/lib/services/super-admin-overview.service";

type SuperAdminAttendanceComparisonChartProps = {
  divisions: DivisionOverviewSummary[];
};

export function SuperAdminAttendanceComparisonChart({
  divisions,
}: SuperAdminAttendanceComparisonChartProps) {
  const activeDivisions = divisions.filter(
    (division) => division.isActive && division.featureFlags.attendanceManagement,
  );

  if (activeDivisions.length < 2) {
    return null;
  }

  const chartData = activeDivisions.map((division) => ({
    name: division.name,
    rate: division.attendanceRate,
    color: division.color,
    attended: division.attendedCount,
    expected: division.expectedCount,
  }));

  return (
    <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            출결 비교
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">지점별 출결률 비교</h3>
          <p className="mt-1 text-sm text-slate-500">오늘 필수 교시 기준입니다.</p>
        </div>
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            barSize={32}
            margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 13, fontWeight: 600, fill: "#334155" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, _name, props) => [
                `${value}% (${
                  (props as { payload?: { attended?: number; expected?: number } }).payload
                    ?.attended ?? 0
                }/${
                  (props as { payload?: { attended?: number; expected?: number } }).payload
                    ?.expected ?? 0
                }명)`,
                "출결률",
              ]}
              contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
