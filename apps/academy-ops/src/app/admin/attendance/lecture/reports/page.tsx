"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type StudentStat = {
  examNumber: string;
  name: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
};

type ReportData = {
  students: StudentStat[];
  cohortName: string;
  month: string;
  totalSessions: number;
};

type Cohort = {
  id: string;
  name: string;
};

function getStatusBadge(rate: number) {
  if (rate < 60) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        위험
      </span>
    );
  }
  if (rate < 80) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        주의
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
      정상
    </span>
  );
}

function getCurrentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function LectureAttendanceReportPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState<string>("");
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cohorts
  useEffect(() => {
    fetch("/api/cohorts?status=ACTIVE")
      .then((r) => r.json())
      .then((json: { data?: Cohort[] }) => {
        const list = json.data ?? [];
        setCohorts(list);
        if (list.length > 0 && !cohortId) setCohortId(list[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReport = useCallback(async () => {
    if (!cohortId || !month) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(
        `/api/attendance/lecture-report?cohortId=${encodeURIComponent(cohortId)}&month=${encodeURIComponent(month)}`
      );
      const json = (await res.json()) as { data?: ReportData; error?: string };
      if (!res.ok) {
        setError(json.error ?? "오류가 발생했습니다.");
      } else {
        setReport(json.data ?? null);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [cohortId, month]);

  // Auto-fetch when cohortId/month change
  useEffect(() => {
    if (cohortId && month) void fetchReport();
  }, [cohortId, month, fetchReport]);

  // Compute KPIs
  const belowEighty = report?.students.filter((s) => s.attendanceRate < 80).length ?? 0;
  const belowSixty = report?.students.filter((s) => s.attendanceRate < 60).length ?? 0;
  const avgRate =
    report && report.students.length > 0
      ? Math.round(
          report.students.reduce((acc, s) => acc + s.attendanceRate, 0) / report.students.length
        )
      : null;

  // CSV Export
  function exportCsv() {
    if (!report) return;
    const rows = [
      ["학번", "이름", "총수업", "출석", "결석", "지각", "공결", "출석률(%)"],
      ...report.students.map((s) => [
        s.examNumber,
        s.name,
        s.totalSessions,
        s.presentCount,
        s.absentCount,
        s.lateCount,
        s.excusedCount,
        s.attendanceRate,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `강의출결_${report.cohortName}_${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/attendance"
          className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          출결 관리
        </Link>
        <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          강의 출결
        </div>
      </div>

      <h1 className="mt-5 text-3xl font-semibold">강의 출결 월간 리포트</h1>
      <p className="mt-4 text-sm leading-7 text-slate">
        기수(반)과 월을 선택하여 학생별 강의 출결 현황을 확인합니다.
      </p>

      {/* Filters */}
      <section className="mt-8 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">기수 (반)</label>
          <select
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="h-10 rounded-xl border border-ink/20 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            {cohorts.length === 0 && <option value="">기수 없음</option>}
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">월 선택</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-xl border border-ink/20 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>

        <button
          onClick={() => void fetchReport()}
          disabled={loading || !cohortId}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-forest px-5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          )}
          조회
        </button>

        {report && report.students.length > 0 && (
          <button
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-forest/30 bg-forest/5 px-5 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            CSV 내보내기
          </button>
        )}
      </section>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {report && (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">분석 대상 학생</p>
              <p className="mt-3 text-3xl font-semibold text-ink">{report.students.length}</p>
              <p className="mt-1 text-xs text-slate">{report.cohortName} · {report.month}</p>
            </article>
            <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">총 강의 세션</p>
              <p className="mt-3 text-3xl font-semibold text-ink">{report.totalSessions}</p>
              <p className="mt-1 text-xs text-slate">해당 월 비취소 세션</p>
            </article>
            <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">평균 출석률</p>
              <p className="mt-3 text-3xl font-semibold text-forest">
                {avgRate !== null ? `${avgRate}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-forest/70">전체 학생 평균</p>
            </article>
            <article
              className={`rounded-[28px] border p-6 shadow-panel ${
                belowEighty > 0
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-ink/10 bg-white"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                  belowEighty > 0 ? "text-amber-700" : "text-slate"
                }`}
              >
                저출석 학생 (80% 미만)
              </p>
              <p
                className={`mt-3 text-3xl font-semibold ${
                  belowEighty > 0 ? "text-amber-700" : "text-ink"
                }`}
              >
                {belowEighty}
              </p>
              <p
                className={`mt-1 text-xs ${
                  belowSixty > 0 ? "text-red-600 font-semibold" : "text-slate"
                }`}
              >
                {belowSixty > 0 ? `위험(60% 미만): ${belowSixty}명` : "위험 학생 없음"}
              </p>
            </article>
          </section>

          {/* Table */}
          <section className="mt-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
              학생별 출결 현황
            </h2>
            {report.students.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
                해당 기간에 출결 데이터가 없습니다.
              </div>
            ) : (
              <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                          학번
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                          이름
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                          총수업
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-forest">
                          출석
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-red-600">
                          결석
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                          지각
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                          공결
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                          출석률
                        </th>
                        <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                          상태
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {report.students.map((s) => {
                        const isRed = s.attendanceRate < 60;
                        const isAmber = !isRed && s.attendanceRate < 80;
                        return (
                          <tr
                            key={s.examNumber}
                            className={
                              isRed
                                ? "bg-red-50/50 hover:bg-red-50 transition"
                                : isAmber
                                ? "bg-amber-50/50 hover:bg-amber-50 transition"
                                : "hover:bg-mist/60 transition"
                            }
                          >
                            <td className="px-6 py-3">
                              <Link
                                href={`/admin/students/${s.examNumber}`}
                                className="font-mono text-ember hover:underline"
                              >
                                {s.examNumber}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/students/${s.examNumber}`}
                                className="font-medium text-ink hover:underline"
                              >
                                {s.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-center text-slate">{s.totalSessions}</td>
                            <td className="px-4 py-3 text-center font-semibold text-forest">
                              {s.presentCount > 0 ? s.presentCount : <span className="text-slate/40">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-red-600">
                              {s.absentCount > 0 ? s.absentCount : <span className="text-slate/40">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-amber-700">
                              {s.lateCount > 0 ? s.lateCount : <span className="text-slate/40">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-sky-700">
                              {s.excusedCount > 0 ? s.excusedCount : <span className="text-slate/40">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`font-semibold ${
                                  isRed ? "text-red-600" : isAmber ? "text-amber-700" : "text-forest"
                                }`}
                              >
                                {s.attendanceRate}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">{getStatusBadge(s.attendanceRate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-ink/10 px-6 py-3 text-xs text-slate">
                  출석률 = (출석 + 지각 + 공결) / 총수업 × 100
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Loading skeleton */}
      {loading && !report && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-10 text-center text-sm text-slate shadow-panel">
          <svg className="mx-auto h-6 w-6 animate-spin text-forest" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="mt-3">데이터를 불러오는 중입니다...</p>
        </div>
      )}
    </div>
  );
}
