"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Presentation-only series: callers project the shared backend contract into
// labelled columns. Missing scores remain null rather than fabricated zeros.
type Props = {
  rows: Array<{ date: string; values: Record<string, number | null> }>;
  columns: Array<{ key: string; label: string }>;
  label: string;
};

const score = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "집계 불가" : `${Number(value.toFixed(1))}점`;

export function TrendLines({ rows, columns, label }: Props) {
  const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
  if (!sorted.length) return <p className="admin-empty-state">표시할 응시 기록이 없습니다.</p>;
  const colors = ["var(--admin-chart-1)", "var(--admin-chart-2)", "var(--admin-chart-3)"];
  const data = sorted.map((row) => ({ ...row.values, date: row.date }));
  return <div className="space-y-4">
    <div className="hidden md:block" role="img" aria-label={`${label}. 상세 수치는 아래 표 참고`}>
      <div className="h-80"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="var(--admin-grid)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }} />
          <YAxis tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }} />
          <Tooltip formatter={(value) => typeof value === "number" ? score(value) : "집계 불가"} contentStyle={{ fontSize: "var(--admin-type-caption)" }} />
          <Legend wrapperStyle={{ fontSize: "var(--admin-type-caption)" }} />
          {columns.map((column, index) => <Line key={column.key} dataKey={column.key} name={column.label} stroke={colors[index % colors.length]} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer></div>
    </div>
    <div className="admin-table-frame"><table><caption className="admin-help">{label}</caption><thead><tr><th scope="col">시험일</th>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>
      {sorted.map((row) => <tr key={row.date}><th scope="row">{row.date}</th>{columns.map((column) => <td key={column.key}>{score(row.values[column.key])}</td>)}</tr>)}
    </tbody></table></div>
  </div>;
}
