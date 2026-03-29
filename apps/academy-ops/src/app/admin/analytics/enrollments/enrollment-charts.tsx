"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthlyTrendPoint = {
  month: string;
  count: number;
};

export type ExamTypePoint = {
  examType: string;
  count: number;
  label: string;
};

export type StatusPoint = {
  status: string;
  count: number;
  label: string;
};

// ─── Color palette ────────────────────────────────────────────────────────────

const EXAM_TYPE_COLORS: Record<string, string> = {
  GONGCHAE: "#C55A11",   // ember
  GYEONGCHAE: "#1F4D3A", // forest
};

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "#D97706", // amber-600
  ACTIVE:    "#1F4D3A", // forest
  WAITING:   "#0284C7", // sky-600
  SUSPENDED: "#7C3AED", // purple-600
  COMPLETED: "#4B5563", // slate
  WITHDRAWN: "#9CA3AF", // gray-400
  CANCELLED: "#E5E7EB", // gray-200
};

const DEFAULT_COLOR = "#9CA3AF";

// ─── Monthly trend LineChart ──────────────────────────────────────────────────

export function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: "#4B5563" }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "#4B5563" }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            fontSize: 13,
          }}
          formatter={(value) => [`${value}건`, "신규 등록"]}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#C55A11"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#C55A11" }}
          activeDot={{ r: 6 }}
          name="신규 등록"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Exam type PieChart ───────────────────────────────────────────────────────

function renderPieLabel(props: PieLabelRenderProps & { label?: string; count?: number }, total: number) {
  const { label, count } = props as { label?: string; count?: number };
  if (!label || count === undefined) return null;
  return total > 0 ? `${label} ${((count / total) * 100).toFixed(1)}%` : label;
}

export function ExamTypePieChart({ data }: { data: ExamTypePoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={48}
          paddingAngle={3}
          label={(props: PieLabelRenderProps) => renderPieLabel(props, total)}
          labelLine={true}
        >
          {data.map((entry) => (
            <Cell
              key={entry.examType}
              fill={EXAM_TYPE_COLORS[entry.examType] ?? DEFAULT_COLOR}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
          formatter={(value) => [`${value}명`]}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Status BarChart ──────────────────────────────────────────────────────────

export function StatusBarChart({ data }: { data: StatusPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#4B5563" }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "#4B5563" }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
          formatter={(value, name) => [`${value}건`, String(name)]}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={STATUS_COLORS[entry.status] ?? DEFAULT_COLOR}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
