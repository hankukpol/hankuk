"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AttendType } from "@prisma/client";

interface SessionBreakdown {
  sessionId: number;
  subject: string;
  subjectKey: string;
  week: number;
  expected: number;
  present: number;
  absent: number;
  excused: number;
  attendanceRate: number | null;
}

interface RecentAbsence {
  examNumber: string;
  name: string;
  subject: string;
  attendType: AttendType;
  sessionId: number;
}

interface DailySummaryData {
  date: string;
  totalSessions: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  totalExcused: number;
  attendanceRate: number | null;
  sessionBreakdown: SessionBreakdown[];
  recentAbsences: RecentAbsence[];
}

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "생방",
  EXCUSED: "공결",
  ABSENT: "결석",
};

const ATTEND_TYPE_CLASS: Record<AttendType, string> = {
  NORMAL: "bg-forest/10 text-forest border-forest/20",
  LIVE: "bg-sky-50 text-sky-700 border-sky-200",
  EXCUSED: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-red-50 text-red-700 border-red-200",
};

export default function DailyAttendanceOverview() {
  const [data, setData] = useState<DailySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/daily-summary");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "데이터를 불러오지 못했습니다.");
      }
      const json = await res.json();
      setData(json.data as DailySummaryData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 날짜 포맷: "3/17(화)"
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["일", "월", "화", "수", "목", "금", "토"] as const;
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  };

  const formatTime = (d: Date) => {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  return (
    <section className="mt-8">
      {/* 섹션 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          오늘 시험 출결 현황
        </h2>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-xs text-slate/60">{formatTime(lastUpdated)} 기준</span>
          )}
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest disabled:opacity-40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            새로고침
          </button>
        </div>
      </div>

      {/* 오류 상태 */}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[28px] border border-ink/10 bg-white shadow-panel"
            />
          ))}
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && !error && data && data.totalSessions === 0 && (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          오늘 등록된 시험 세션이 없습니다.
        </div>
      )}

      {/* 실제 데이터 */}
      {!error && data && data.totalSessions > 0 && (
        <>
          {/* KPI 카드 4개 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 오늘 수업 */}
            <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                오늘 수업
              </p>
              <p className="mt-3 text-3xl font-semibold text-ink">
                {data.totalSessions}
                <span className="ml-1 text-lg font-normal text-slate">회</span>
              </p>
              <p className="mt-1 text-xs text-slate">
                총 응시 예정 {data.totalExpected}명
              </p>
            </article>

            {/* 출석 */}
            <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
                출석
              </p>
              <p className="mt-3 text-3xl font-semibold text-forest">
                {data.totalPresent}
                <span className="ml-1 text-lg font-normal">명</span>
              </p>
              <p className="mt-1 text-xs text-forest/70">정상 + 생방 출결</p>
            </article>

            {/* 결석 */}
            <article
              className={`rounded-[28px] border p-6 shadow-panel ${
                data.totalAbsent > 0
                  ? "border-red-200 bg-red-50/60"
                  : "border-ink/10 bg-white"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                  data.totalAbsent > 0 ? "text-red-600" : "text-slate"
                }`}
              >
                결석
              </p>
              <p
                className={`mt-3 text-3xl font-semibold ${
                  data.totalAbsent > 0 ? "text-red-600" : "text-ink"
                }`}
              >
                {data.totalAbsent}
                <span className="ml-1 text-lg font-normal">명</span>
              </p>
              <p className="mt-1 text-xs text-slate">
                공결 {data.totalExcused}명 포함
              </p>
            </article>

            {/* 출석률 */}
            <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                출석률
              </p>
              <p className="mt-3 text-3xl font-semibold text-ink">
                {data.attendanceRate !== null ? (
                  <>
                    {data.attendanceRate.toFixed(1)}
                    <span className="ml-0.5 text-xl font-normal">%</span>
                  </>
                ) : (
                  <span className="text-slate/40">—</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate">
                {data.date ? formatDate(data.date) : ""} 기준
              </p>
            </article>
          </div>

          {/* 세션별 상세 테이블 */}
          <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h3 className="text-sm font-semibold text-ink">세션별 출결 현황</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/5">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      주차
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      응시
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-forest">
                      출석
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-red-600">
                      결석
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                      공결
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      출석률
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {data.sessionBreakdown.map((row) => (
                    <tr key={row.sessionId} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3 font-medium text-ink">{row.subject}</td>
                      <td className="px-4 py-3 text-center text-slate">{row.week}주차</td>
                      <td className="px-4 py-3 text-center text-slate">{row.expected}</td>
                      <td className="px-4 py-3 text-center font-semibold text-forest">
                        {row.present > 0 ? row.present : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-red-600">
                        {row.absent > 0 ? row.absent : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-amber-700">
                        {row.excused > 0 ? row.excused : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.attendanceRate !== null ? (
                          <span
                            className={`font-semibold ${
                              row.attendanceRate >= 90
                                ? "text-forest"
                                : row.attendanceRate >= 70
                                  ? "text-amber-700"
                                  : "text-red-600"
                            }`}
                          >
                            {row.attendanceRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 오늘 결석·공결자 목록 */}
          {data.recentAbsences.length > 0 && (
            <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="border-b border-ink/10 px-6 py-4">
                <h3 className="text-sm font-semibold text-ink">
                  오늘 결석·공결자
                  <span className="ml-2 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                    {data.recentAbsences.length}건
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/5">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        학번
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        이름
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        과목
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        출결유형
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {data.recentAbsences.map((absence, idx) => (
                      <tr
                        key={`${absence.examNumber}-${absence.sessionId}-${idx}`}
                        className="transition hover:bg-mist/60"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/admin/students/${absence.examNumber}`}
                            className="font-mono text-ember hover:underline"
                          >
                            {absence.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${absence.examNumber}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {absence.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate">{absence.subject}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ATTEND_TYPE_CLASS[absence.attendType]}`}
                          >
                            {ATTEND_TYPE_LABEL[absence.attendType]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
