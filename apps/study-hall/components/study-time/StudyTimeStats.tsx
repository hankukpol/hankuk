"use client";

import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [month, setMonth] = useState(getKstMonth);
  const [stats, setStats] = useState<StudentStudyTimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const byDate = stats?.byDate ?? [];
  const activePeriods = useMemo(
    () => (stats?.byPeriod ?? []).filter((period) => period.avgMinutes > 0),
    [stats],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function fetchStats() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/${divisionSlug}/study-time?studentId=${studentId}&month=${month}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!res.ok) {
          toast.error("데이터를 불러오는 데 실패했습니다.");
          return;
        }
        const { stats: newStats } = await res.json();
        if (!controller.signal.aborted) setStats(newStats);
      } catch {
        if (!controller.signal.aborted) toast.error("데이터를 불러오는 데 실패했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void fetchStats();
    return () => controller.abort();
  }, [divisionSlug, studentId, month]);

  function handleMonthChange(newMonth: string) {
    setMonth(newMonth);
  }

  const { maxMinutes, avgMinutes, studyDays } = useMemo(() => {
    let maxMinutes = 1;
    let totalMinutes = 0;
    let studyDays = 0;
    for (const day of stats?.byDate ?? []) {
      maxMinutes = Math.max(maxMinutes, day.minutes);
      if (day.minutes > 0) {
        totalMinutes += day.minutes;
        studyDays++;
      }
    }
    return { maxMinutes, studyDays, avgMinutes: Math.round(totalMinutes / (studyDays || 1)) };
  }, [stats]);

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
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm transition"
          />
        </div>
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="admin-panel-row">
          <p className="admin-label">합계</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : stats ? formatMinutes(stats.totalMinutes) : "0분"}
          </p>
          <p className="admin-help mt-1">{month} 기준</p>
        </div>
        <div className="admin-panel-row">
          <p className="admin-label">학습일</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : `${studyDays}일`}
          </p>
          <p className="admin-help mt-1">출석 기록 있는 날</p>
        </div>
        <div className="admin-panel-row">
          <p className="admin-label">일평균</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">
            {isLoading ? "—" : formatMinutes(avgMinutes)}
          </p>
          <p className="admin-help mt-1">학습일 기준 평균</p>
        </div>
      </div>

      {/* 일별 막대 차트 */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
          <Clock className="h-7 w-7 animate-pulse" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : byDate.length === 0 ? (
        <div className="admin-help flex flex-col items-center gap-3 py-12">
          <Clock className="h-7 w-7" />
          <p className="text-sm">해당 월의 학습 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <p className="mb-4 text-xs font-semibold text-slate-500">
            일별 학습 시간
          </p>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ minHeight: "100px" }}>
            {byDate.map(({ date, minutes }) => {
              const heightPx = maxMinutes > 0 ? Math.max(Math.round((minutes / maxMinutes) * 80), minutes > 0 ? 4 : 2) : 2;
              return (
                <div key={date} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: "26px" }}>
                  {minutes > 0 && (
                    <span className="text-[13px] font-medium text-slate-500">{Math.floor(minutes / 60) > 0 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`}</span>
                  )}
                  <div
                    className={`w-4 rounded-t transition-all ${minutes > 0 ? "bg-[var(--division-color)]" : "bg-slate-100"}`}
                    style={{ height: `${heightPx}px` }}
                    title={`${date}: ${formatMinutes(minutes)}`}
                  />
                  <span className="text-[13px] text-slate-400">{date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 교시별 평균 */}
      {activePeriods.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <p className="mb-4 text-xs font-semibold text-slate-500">
            교시별 평균 학습 시간
          </p>
          <div className="space-y-3">
            {activePeriods.map((p) => (
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
