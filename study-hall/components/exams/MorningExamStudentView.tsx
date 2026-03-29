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
    <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--foreground)]">
        {value}
      </p>
      {caption && <p className="mt-1 text-[12px] text-[var(--muted)]">{caption}</p>}
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
      <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[#F4F4F2] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
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
        <section className="rounded-[10px] border border-[var(--border)] bg-white p-4">
          <p className="text-[12px] font-medium text-[var(--muted)]">
            이번 주 일별 성적
          </p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {latestWeek.weekDateRange.start} ~ {latestWeek.weekDateRange.end}
          </p>
          <div className="mt-3 divide-y divide-slate-100">
            {latestWeek.dailyScores.map((ds) => (
              <div key={ds.date} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F4F4F2] text-xs font-bold text-[var(--foreground)]">
                    {ds.dayOfWeek}
                  </span>
                  <span className="text-[14px] font-medium text-[var(--foreground)]">{ds.subjectName}</span>
                </div>
                <span className="text-[16px] font-bold text-[var(--foreground)]">
                  {ds.score !== null ? `${ds.score}점` : "-"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {chartData.length >= 2 && (
        <section className="rounded-[10px] border border-[var(--border)] bg-white p-4">
          <p className="text-[14px] font-bold text-[var(--foreground)]">주차별 총점 추이</p>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
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
          <p className="text-[14px] font-bold text-[var(--foreground)]">과거 주차 기록</p>

          {weeks.slice(1).map((week) => {
            const key = `${week.weekYear}-${week.weekNumber}`;
            const isOpen = expandedWeeks.has(key);

            return (
              <div
                key={key}
                className="rounded-[10px] border border-[var(--border)] bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleWeek(key)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-[14px] font-bold text-[var(--foreground)]">
                      {week.weekYear}년 {week.weekNumber}주차
                    </p>
                    <p className="text-[12px] text-[var(--muted)]">
                      {week.weekDateRange.start} ~ {week.weekDateRange.end}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[14px] font-bold text-[var(--foreground)]">
                        {week.weeklyTotal ?? "-"}점
                      </p>
                      <p className="text-[12px] text-[var(--muted)]">
                        평균 {week.weeklyAverage ?? "-"} · {week.weeklyRank ? `${week.weeklyRank}등` : "-"}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-[var(--muted)]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    <div className="divide-y divide-slate-100">
                      {week.dailyScores.map((ds) => (
                        <div key={ds.date} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#F4F4F2] text-xs font-bold text-[var(--foreground)]">
                              {ds.dayOfWeek}
                            </span>
                            <span className="text-[13px] text-[var(--foreground)]">{ds.subjectName}</span>
                          </div>
                          <span className="text-[14px] font-bold text-[var(--foreground)]">
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
