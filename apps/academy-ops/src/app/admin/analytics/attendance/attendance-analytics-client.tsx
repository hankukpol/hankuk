"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeeklyPoint = {
  week: string;
  label: string;
  attendRate: number;
  attend: number;
  total: number;
};

type SubjectStat = {
  subject: string;
  attendRate: number;
  attend: number;
  absent: number;
  late: number;
  makeup: number;
  total: number;
};

type DowStat = {
  dow: number;
  label: string;
  attendRate: number;
  attend: number;
  total: number;
};

type TopAbsent = {
  examNumber: string;
  name: string;
  absentCount: number;
};

type KPI = {
  avgAttendRate: number;
  totalAbsent: number;
  makeupCount: number;
  perfectAttendanceCount: number;
  total: number;
};

type AnalyticsData = {
  kpi: KPI;
  weeklyTrend: WeeklyPoint[];
  subjectStats: SubjectStat[];
  dowStats: DowStat[];
  topAbsent: TopAbsent[];
};

// ─── Subject label map ────────────────────────────────────────────────────────
const SUBJECT_LABELS: Record<string, string> = {
  KOREAN: "국어",
  ENGLISH: "영어",
  MATH: "수학",
  HISTORY: "한국사",
  SOCIETY: "사회",
  SCIENCE: "과학",
  LAW: "법학",
  ECONOMICS: "경제",
  POLICE_SCIENCE: "경찰학",
  CRIMINAL_LAW: "형사법",
  CONSTITUTION: "헌법",
};

function subjectLabel(s: string): string {
  return SUBJECT_LABELS[s] ?? s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateColor(rate: number): string {
  if (rate >= 90) return "#1F4D3A";
  if (rate >= 75) return "#16a34a";
  if (rate >= 60) return "#d97706";
  return "#dc2626";
}

function rateBg(rate: number): string {
  if (rate >= 90) return "bg-forest";
  if (rate >= 75) return "bg-green-500";
  if (rate >= 60) return "bg-amber-400";
  return "bg-red-500";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendanceAnalyticsClient() {
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/attendance?weeks=${weeks}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const json = await res.json() as { data: AnalyticsData };
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center py-20 text-slate text-sm">
        출결 분석 데이터를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
        <button
          onClick={fetchData}
          className="ml-4 text-xs underline hover:no-underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { kpi, weeklyTrend, subjectStats, dowStats, topAbsent } = data;

  return (
    <div>
      {/* Filter bar */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">기간 설정:</span>
        {[4, 8, 12, 24].map((w) => (
          <button
            key={w}
            onClick={() => setWeeks(w)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              weeks === w
                ? "border-forest bg-forest text-white"
                : "border-ink/20 bg-white text-slate hover:border-forest/40 hover:text-forest"
            }`}
          >
            최근 {w}주
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            평균 출석률
          </p>
          <p
            className="mt-3 text-3xl font-bold"
            style={{ color: rateColor(kpi.avgAttendRate) }}
          >
            {kpi.avgAttendRate}%
          </p>
          <p className="mt-1 text-xs text-slate">전체 {kpi.total.toLocaleString()}건</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50/60 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
            총 결석 건수
          </p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {kpi.totalAbsent.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-red-500">무단 결시 (ABSENT)</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50/60 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            라이브 응시
          </p>
          <p className="mt-3 text-3xl font-bold text-sky-700">
            {kpi.makeupCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-sky-600">LIVE 응시 건수</p>
        </div>
        <div className="rounded-[24px] border border-forest/30 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
            개근 학생
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {kpi.perfectAttendanceCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-forest/70">무결석 학생 수</p>
        </div>
      </div>

      {/* Chart 1: Weekly Trend Bar Chart */}
      {weeklyTrend.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">
            주차별 출석률 추이 (최근 {weeks}주)
          </h2>
          <p className="mt-1 text-xs text-slate">성적 응시 기준 출석률 — 녹색 바 높을수록 출석률 양호</p>
          <div className="mt-6 space-y-2.5">
            {weeklyTrend.map((w) => (
              <div key={w.week} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-right text-xs text-slate">
                  {w.label}
                </span>
                <div className="relative h-6 flex-1 rounded-md bg-gray-100 overflow-hidden">
                  <div
                    className={`h-6 rounded-md transition-all duration-300 ${rateBg(w.attendRate)}`}
                    style={{ width: `${w.attendRate}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-white mix-blend-luminosity">
                    {w.attendRate > 0 ? `${w.attendRate}%` : ""}
                  </span>
                </div>
                <span
                  className="w-10 shrink-0 text-right text-xs font-semibold"
                  style={{ color: rateColor(w.attendRate) }}
                >
                  {w.attendRate}%
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-slate">
                  {w.total}명
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart 2: Subject Comparison Horizontal Bar Chart */}
      {subjectStats.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">과목별 출석률 비교</h2>
          <p className="mt-1 text-xs text-slate">과목별 출석·결석 현황 (수평 막대)</p>
          <div className="mt-6 space-y-3">
            {subjectStats.map((s) => (
              <div key={s.subject}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-ink">
                    {subjectLabel(s.subject)}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: rateColor(s.attendRate) }}
                  >
                    {s.attendRate}%
                  </span>
                </div>
                <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                  {/* Stacked bar: attend (green) + late/excused (amber) + makeup/live (sky) + absent (red) */}
                  <div className="flex h-4">
                    <div
                      className="bg-forest/80 transition-all duration-300"
                      style={{
                        width: `${s.total > 0 ? (s.attend / s.total) * 100 : 0}%`,
                      }}
                    />
                    <div
                      className="bg-sky-400 transition-all duration-300"
                      style={{
                        width: `${s.total > 0 ? (s.makeup / s.total) * 100 : 0}%`,
                      }}
                    />
                    <div
                      className="bg-amber-300 transition-all duration-300"
                      style={{
                        width: `${s.total > 0 ? (s.late / s.total) * 100 : 0}%`,
                      }}
                    />
                    <div
                      className="bg-red-400 transition-all duration-300"
                      style={{
                        width: `${s.total > 0 ? (s.absent / s.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-1 flex gap-4 text-[10px] text-slate">
                  <span>출석 {s.attend}</span>
                  <span className="text-sky-600">라이브 {s.makeup}</span>
                  <span className="text-amber-600">사유결시 {s.late}</span>
                  <span className="text-red-600">결석 {s.absent}</span>
                  <span>/ 전체 {s.total}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-ink/10 pt-4 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-forest/80" /> 정상 출석
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-sky-400" /> 라이브
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-300" /> 사유 결시
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-400" /> 무단 결시
            </span>
          </div>
        </div>
      )}

      {/* Chart 3: Day-of-week Heatmap */}
      {dowStats.some((d) => d.total > 0) && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">요일별 출석 패턴</h2>
          <p className="mt-1 text-xs text-slate">요일별 출석률 — 색이 진할수록 출석률 높음</p>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {dowStats
              .filter((d) => d.total > 0)
              .map((d) => (
                <div key={d.dow} className="flex min-w-[64px] flex-col items-center gap-2">
                  <div
                    className="flex h-16 w-14 items-center justify-center rounded-[16px] text-lg font-bold text-white transition-all"
                    style={{
                      backgroundColor: rateColor(d.attendRate),
                      opacity: 0.4 + (d.attendRate / 100) * 0.6,
                    }}
                  >
                    {d.attendRate}%
                  </div>
                  <span className="text-xs font-semibold text-ink">{d.label}요일</span>
                  <span className="text-[10px] text-slate">{d.total}건</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Top 10 Most Absent Students Table */}
      {topAbsent.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">결석 多 학생 TOP 10</h2>
            <p className="mt-1 text-xs text-slate">기간 내 결석 횟수 기준 내림차순</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    순위
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    학번
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    이름
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                    결석 횟수
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {topAbsent.map((student, idx) => (
                  <tr key={student.examNumber} className="hover:bg-mist/50 transition">
                    <td className="px-6 py-3 text-sm font-medium text-slate">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${student.examNumber}`}
                        className="font-mono text-sm text-ember hover:underline"
                      >
                        {student.examNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${student.examNumber}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-bold text-red-700">
                        {student.absentCount}회
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpi.total === 0 && (
        <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 bg-white p-10 text-center text-sm text-slate shadow-panel">
          선택한 기간({weeks}주) 내 성적 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
