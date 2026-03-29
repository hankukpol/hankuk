"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReportData } from "@/lib/services/report.service";

type ReportsTrendChartProps = {
  color: string;
  trend: ReportData["trend"];
};

export function ReportsTrendChart({ color, trend }: ReportsTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={trend} margin={{ top: 12, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#64748b", fontSize: 12 }}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) => {
            const rawValue = Array.isArray(value) ? value[0] : value;
            const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
            const metricName = String(name ?? "");

            if (metricName === "attendanceRate") {
              return [`${numericValue}%`, "출결률"];
            }

            if (metricName === "tardyCount") {
              return [numericValue, "지각"];
            }

            return [numericValue, "결석"];
          }}
        />
        <Line
          type="monotone"
          dataKey="attendanceRate"
          stroke={color}
          strokeWidth={3}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line type="monotone" dataKey="tardyCount" stroke="#f59e0b" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="absentCount" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
