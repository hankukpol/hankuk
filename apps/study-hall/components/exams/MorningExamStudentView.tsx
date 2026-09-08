"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StudentMorningExamWeekItem } from "@/lib/services/morning-exam.service";

type MorningExamStudentViewProps = {
  weeks: StudentMorningExamWeekItem[];
};

function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string | number;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border border-admin-line bg-white px-4 py-3">
      <p className="text-[13px] font-medium text-admin-text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-[20px] font-bold tracking-tight text-admin-text">
        {value}
      </p>
      {caption && <p className="mt-1 text-[13px] text-admin-text-muted">{caption}</p>}
    </div>
  );
}

export function MorningExamStudentView({ weeks }: MorningExamStudentViewProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const latestWeek = weeks[0] ?? null;

  const chartData = useMemo(() => {
    return [...weeks]
      .reverse()
      .map((w) => ({
        label: `${w.weekNumber}주`,
        total: w.weeklyTotal ?? 0,
        average: w.weeklyAverage ?? 0,
      }));
  }, [weeks]);

  function toggleWeek(key: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-admin-line bg-admin-surface-soft px-4 py-8 text-center text-[13px] text-admin-text-muted">
        아침모의고사 성적이 아직 없습니다. 시험 결과가 등록되면 주차별 성적이 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {latestWeek && (
        <section className="grid grid-cols-3 gap-3">
          <MetricCard
            label="이번주 총점"
            value={latestWeek.weeklyTotal ?? "-"}
            caption={`${latestWeek.weekYear}년 ${latestWeek.weekNumber}주차`}
          />
          <MetricCard
            label="이번주 평균"
            value={latestWeek.weeklyAverage ?? "-"}
            caption={`${latestWeek.dailyScores.length}과목 기준`}
          />
          <MetricCard
            label="이번주 석차"
            value={latestWeek.weeklyRank ? `${latestWeek.weeklyRank}등` : "-"}
          />
        </section>
      )}

      {latestWeek && (
        <section className="admin-section">
          <p className="text-[13px] font-medium text-admin-text-muted">
            이번 주 일별 성적
          </p>
          <p className="mt-1 text-[13px] text-admin-text-muted">
            {latestWeek.weekDateRange.start} ~ {latestWeek.weekDateRange.end}
          </p>
          <div className="mt-3">
            {latestWeek.dailyScores.map((ds) => (
              <div key={ds.date} className="admin-panel-row justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-admin-surface-soft text-xs font-bold text-admin-text">
                    {ds.dayOfWeek}
                  </span>
                  <span className="text-[15px] font-medium text-admin-text">{ds.subjectName}</span>
                </div>
                <span className="text-[16px] font-bold text-admin-text">
                  {ds.score !== null ? `${ds.score}점` : "-"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {chartData.length >= 2 && (
        <section className="admin-section">
          <p className="text-[15px] font-bold text-admin-text">주차별 총점 추이</p>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: "var(--admin-type-caption)" }} />
                <YAxis tick={{ fontSize: "var(--admin-type-caption)" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="주간합"
                  stroke="var(--division-color, #1B4FBB)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {weeks.length > 1 && (
        <section className="space-y-3">
          <p className="text-[15px] font-bold text-admin-text">과거 주차 기록</p>

          {weeks.slice(1).map((week) => {
            const key = `${week.weekYear}-${week.weekNumber}`;
            const isOpen = expandedWeeks.has(key);

            return (
              <div
                key={key}
                className="rounded-lg border border-admin-line bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleWeek(key)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-[15px] font-bold text-admin-text">
                      {week.weekYear}년 {week.weekNumber}주차
                    </p>
                    <p className="text-[13px] text-admin-text-muted">
                      {week.weekDateRange.start} ~ {week.weekDateRange.end}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[15px] font-bold text-admin-text">
                        {week.weeklyTotal ?? "-"}점
                      </p>
                      <p className="text-[13px] text-admin-text-muted">
                        평균 {week.weeklyAverage ?? "-"} · {week.weeklyRank ? `${week.weeklyRank}등` : "-"}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-admin-text-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-admin-text-muted" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-admin-line px-4 py-3">
                    <div>
                      {week.dailyScores.map((ds) => (
                        <div key={ds.date} className="admin-panel-row justify-between">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-admin-surface-soft text-xs font-bold text-admin-text">
                              {ds.dayOfWeek}
                            </span>
                            <span className="text-[13px] text-admin-text">{ds.subjectName}</span>
                          </div>
                          <span className="text-[15px] font-bold text-admin-text">
                            {ds.score !== null ? `${ds.score}점` : "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
