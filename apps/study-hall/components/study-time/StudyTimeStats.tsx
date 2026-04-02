"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/sonner";

import type { StudentStudyTimeStats } from "@/lib/services/study-time.service";

type StudyTimeStatsProps = {
  divisionSlug: string;
  studentId: string;
};

function getKstMonth() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return today.slice(0, 7);
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function StudyTimeStats({ divisionSlug, studentId }: StudyTimeStatsProps) {
  const [month, setMonth] = useState(getKstMonth());
  const [stats, setStats] = useState<StudentStudyTimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const byDate = stats?.byDate ?? [];
  const byPeriod = stats?.byPeriod ?? [];

  async function fetchStats(targetMonth: string) {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/${divisionSlug}/study-time?studentId=${studentId}&month=${targetMonth}`,
      );
      if (!res.ok) {
        toast.error("데이터를 불러오는 데 실패했습니다.");
        return;
      }
      const { stats: newStats } = await res.json();
      setStats(newStats);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchStats(month);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMonthChange(newMonth: string) {
    setMonth(newMonth);
    await fetchStats(newMonth);
  }

  const maxMinutes = Math.max(...byDate.map((d) => d.minutes), 1);
  const avgMinutes = byDate.length > 0
    ? Math.round(byDate.filter((d) => d.minutes > 0).reduce((acc, d) => acc + d.minutes, 0) / (byDate.filter((d) => d.minutes > 0).length || 1))
    : 0;
  const studyDays = byDate.filter((d) => d.minutes > 0).length;

  return (
    <div className="space-y-5">
      {/* 헤더: 월 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">조회 월</label>
          <input
            type="month"
            value={month}
            max={getKstMonth()}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="mt-1 block rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[10px] border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">합계</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : stats ? formatMinutes(stats.totalMinutes) : "0분"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{month} 기준</p>
        </div>
        <div className="rounded-[10px] border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">학습일</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : `${studyDays}일`}
          </p>
          <p className="mt-1 text-xs text-slate-500">출석 기록 있는 날</p>
        </div>
        <div className="rounded-[10px] border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">일평균</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : formatMinutes(avgMinutes)}
          </p>
          <p className="mt-1 text-xs text-slate-500">학습일 기준 평균</p>
        </div>
      </div>

      {/* 일별 막대 차트 */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
          <Clock className="h-7 w-7 animate-pulse" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : byDate.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-slate-300 py-12 text-slate-400">
          <Clock className="h-7 w-7" />
          <p className="text-sm">해당 월의 학습 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-slate-100 bg-white p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            일별 학습 시간
          </p>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ minHeight: "100px" }}>
            {byDate.map(({ date, minutes }) => {
              const heightPx = maxMinutes > 0 ? Math.max(Math.round((minutes / maxMinutes) * 80), minutes > 0 ? 4 : 2) : 2;
              return (
                <div key={date} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: "26px" }}>
                  {minutes > 0 && (
                    <span className="text-[9px] font-medium text-slate-500">{Math.floor(minutes / 60) > 0 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`}</span>
                  )}
                  <div
                    className={`w-4 rounded-t transition-all ${minutes > 0 ? "bg-[var(--division-color)]" : "bg-slate-100"}`}
                    style={{ height: `${heightPx}px` }}
                    title={`${date}: ${formatMinutes(minutes)}`}
                  />
                  <span className="text-[9px] text-slate-400">{date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 교시별 평균 */}
      {byPeriod.filter((p) => p.avgMinutes > 0).length > 0 && (
        <div className="rounded-[10px] border border-slate-100 bg-white p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            교시별 평균 학습 시간
          </p>
          <div className="space-y-3">
            {byPeriod
              .filter((p) => p.avgMinutes > 0)
              .map((p) => (
                <div key={p.periodId} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs font-medium text-slate-600">{p.periodName}</span>
                  <div className="flex-1 rounded-full bg-slate-100 h-2">
                    <div
                      className="h-2 rounded-full bg-[var(--division-color)] opacity-70"
                      style={{
                        width: `${Math.min(100, Math.round((p.avgMinutes / 300) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-medium text-slate-700">
                    {formatMinutes(p.avgMinutes)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
