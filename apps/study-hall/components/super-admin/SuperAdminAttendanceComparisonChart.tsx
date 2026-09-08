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
    <section className="admin-section">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="admin-section-title">지점별 출결률 비교</h3>
          <p className="admin-help mt-1">오늘 필수 교시 기준입니다.</p>
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
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--admin-line-soft)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fontSize: "var(--admin-type-caption)", fill: "var(--admin-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 13, fontWeight: 600, fill: "var(--admin-text-secondary)" }}
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
              contentStyle={{ borderRadius: "var(--admin-radius)", fontSize: 13, border: "1px solid var(--admin-grid)" }}
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
