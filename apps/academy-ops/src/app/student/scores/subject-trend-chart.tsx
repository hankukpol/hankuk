"use client";

import { useState } from "react";
import { Subject } from "@prisma/client";
import { SUBJECT_LABEL } from "@/lib/constants";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SubjectPoint = {
  dateKey: string;
  score: number | null | undefined;
};

type SubjectRow = {
  subject: Subject;
  scores: SubjectPoint[];
};

type SubjectTrendChartProps = {
  crossTableDates: string[];
  subjectCrossTable: SubjectRow[];
};

const SUBJECT_COLORS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "#C55A11",
  CRIMINAL_LAW: "#1F4D3A",
  CRIMINAL_PROCEDURE: "#4B5563",
  POLICE_SCIENCE: "#0ea5e9",
  CRIMINOLOGY: "#8b5cf6",
  CUMULATIVE: "#f59e0b",
};

export function SubjectTrendChart({ crossTableDates, subjectCrossTable }: SubjectTrendChartProps) {
  const allSubjects = subjectCrossTable.map((row) => row.subject);
  const [activeSubjects, setActiveSubjects] = useState<Set<string>>(
    new Set(allSubjects.filter((s) => s !== Subject.CUMULATIVE)),
  );

  function toggleSubject(subject: string) {
    setActiveSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) {
        if (next.size > 1) next.delete(subject);
      } else {
        next.add(subject);
      }
      return next;
    });
  }

  // Build chart data: each point = one exam date, each line = one subject
  const chartData = [...crossTableDates].reverse().map((dateKey) => {
    const point: Record<string, string | number | null> = { dateKey };
    for (const row of subjectCrossTable) {
      const cell = row.scores.find((s) => s.dateKey === dateKey);
      point[row.subject] = cell?.score ?? null;
    }
    return point;
  });

  const activeRows = subjectCrossTable.filter((row) => activeSubjects.has(row.subject));

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-semibold">과목별 성적 추이</h2>
      <p className="mb-3 text-xs text-slate">과목 버튼을 눌러 표시할 과목을 선택하세요.</p>

      {/* 과목 토글 버튼 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {subjectCrossTable.map((row) => {
          const active = activeSubjects.has(row.subject);
          const color = SUBJECT_COLORS[row.subject] ?? "#4B5563";
          return (
            <button
              key={row.subject}
              type="button"
              onClick={() => toggleSubject(row.subject)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-ink/10 bg-mist text-slate hover:border-ink/20"
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? "#fff" : color }}
              />
              {SUBJECT_LABEL[row.subject] ?? row.subject}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="dateKey"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            width={28}
          />
          <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
          <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 3" strokeWidth={1} />
          <Tooltip
            formatter={(value, name) => [
              value !== null && value !== undefined ? `${value}점` : "미응시",
              SUBJECT_LABEL[name as Subject] ?? name,
            ]}
            contentStyle={{ borderRadius: "12px", fontSize: "12px" }}
          />
          <Legend
            formatter={(value: string) => SUBJECT_LABEL[value as Subject] ?? value}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px" }}
          />
          {activeRows.map((row) => (
            <Line
              key={row.subject}
              type="monotone"
              dataKey={row.subject}
              stroke={SUBJECT_COLORS[row.subject] ?? "#4B5563"}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              name={row.subject}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
