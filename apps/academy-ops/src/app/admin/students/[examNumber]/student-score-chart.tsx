"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type ScoreChartPoint = {
  sessionId: number;
  week: number;
  subject: string;
  subjectLabel: string;
  examDate: string;
  finalScore: number | null;
};

type Props = {
  scores: ScoreChartPoint[];
};

// 과목별 색상 팔레트
const SUBJECT_COLORS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "#C55A11",   // 헌법 — ember
  CRIMINAL_LAW: "#1F4D3A",         // 형법 — forest
  CRIMINAL_PROCEDURE: "#0284C7",   // 형소법 — sky
  POLICE_SCIENCE: "#7C3AED",       // 경찰학 — purple
  CRIMINOLOGY: "#D97706",           // 범죄학 — amber
  CUMULATIVE: "#4B5563",            // 누적 — slate
};

const DEFAULT_COLOR = "#9CA3AF";

type TooltipPayload = {
  name: string;
  value: number | null;
  color: string;
  dataKey: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-3 shadow-lg text-sm min-w-[140px]">
      <p className="mb-2 font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums text-ink">
            {entry.value !== null && entry.value !== undefined ? `${entry.value}점` : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StudentScoreChart({ scores }: Props) {
  // 과목 목록 추출
  const subjects = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ key: string; label: string }> = [];
    for (const s of scores) {
      if (!seen.has(s.subject)) {
        seen.add(s.subject);
        result.push({ key: s.subject, label: s.subjectLabel });
      }
    }
    return result;
  }, [scores]);

  const [checkedSubjects, setCheckedSubjects] = useState<Set<string>>(
    () => new Set(subjects.map((s) => s.key)),
  );

  // 최근 30회차 — sessionId 오름차순 정렬 후 마지막 30개
  const chartData = useMemo(() => {
    if (scores.length === 0) return [];

    // 회차(sessionId + subject) 기준으로 X축 포인트 생성
    // X축 = "week-examDate" 단위로 그룹핑
    type PointKey = string;
    const pointMap = new Map<PointKey, Record<string, number | string | null>>();

    // 날짜 기준 오름차순 정렬
    const sorted = [...scores].sort(
      (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime(),
    );

    for (const s of sorted) {
      // 같은 날짜라도 과목마다 별도 세션이 있으므로 examDate+week 로 X 레이블 생성
      const dateStr = s.examDate.slice(0, 10); // "YYYY-MM-DD"
      const key = `${dateStr}__${s.week}`;

      if (!pointMap.has(key)) {
        const [y, mo, d] = dateStr.split("-");
        pointMap.set(key, {
          _key: key,
          _label: `${mo}/${d} (${s.week}회)`,
          _sort: new Date(s.examDate).getTime(),
        });
      }
      const point = pointMap.get(key)!;
      point[s.subject] = s.finalScore;
    }

    // 날짜 오름차순 정렬 후 최근 30 포인트
    const allPoints = Array.from(pointMap.values()).sort(
      (a, b) => (a._sort as number) - (b._sort as number),
    );

    return allPoints.slice(-30);
  }, [scores]);

  const toggleSubject = (key: string) => {
    setCheckedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // 최소 1개 유지
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (scores.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
        성적 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="text-xl font-semibold text-ink">성적 추이</h2>
        <span className="text-xs text-slate">최근 {Math.min(chartData.length, 30)}회차</span>
      </div>

      {/* 과목 필터 체크박스 */}
      <div className="mb-5 flex flex-wrap gap-3">
        {subjects.map((s) => {
          const color = SUBJECT_COLORS[s.key] ?? DEFAULT_COLOR;
          const checked = checkedSubjects.has(s.key);
          return (
            <label
              key={s.key}
              className={`flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                checked
                  ? "border-transparent text-white"
                  : "border-ink/10 bg-mist text-slate"
              }`}
              style={checked ? { backgroundColor: color, borderColor: color } : undefined}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => toggleSubject(s.key)}
              />
              {s.label}
            </label>
          );
        })}
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="_label"
            tick={{ fontSize: 11, fill: "#4B5563" }}
            tickLine={false}
            axisLine={{ stroke: "#E5E7EB" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#4B5563" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-slate">{value}</span>
            )}
          />
          {subjects
            .filter((s) => checkedSubjects.has(s.key))
            .map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={SUBJECT_COLORS[s.key] ?? DEFAULT_COLOR}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 1.5, fill: "#fff" }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
