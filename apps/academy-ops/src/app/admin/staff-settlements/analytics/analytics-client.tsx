"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AnalyticsResponse, StaffTrendRow, SpecialLectureRevRow } from "@/app/api/staff-settlements/analytics/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthItem = { year: number; month: number; label: string };

export type AnalyticsClientProps = {
  initialFrom: string; // YYYY-MM
  initialTo: string;   // YYYY-MM
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatKRWShort(amount: number) {
  if (amount >= 100_000_000) {
    return (amount / 100_000_000).toFixed(1).replace(/\.0$/, "") + "억";
  }
  if (amount >= 10_000_000) {
    return (amount / 10_000_000).toFixed(1).replace(/\.0$/, "") + "천만";
  }
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1).replace(/\.0$/, "") + "백만";
  }
  if (amount >= 10_000) {
    return Math.floor(amount / 10_000) + "만";
  }
  return amount.toLocaleString("ko-KR");
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = (y - 1) * 12 + (m - 1) + delta;
  const newY = Math.floor(total / 12) + 1;
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

function isAfterToday(ym: string): boolean {
  const today = new Date();
  const curYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return ym > curYM;
}

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

// ─── CSS Bar Chart ────────────────────────────────────────────────────────────

function RevenueBarChart({ rows, months }: { rows: StaffTrendRow[]; months: MonthItem[] }) {
  // Show total per staff over the period
  const maxRevenue = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate">데이터 없음</p>
      ) : (
        rows
          .slice()
          .sort((a, b) => b.total - a.total)
          .map((row) => {
            const pct = Math.max(2, (row.total / maxRevenue) * 100);
            return (
              <div key={row.staffId} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-right text-sm font-medium text-ink">
                  {row.staffName}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-7 flex-1 overflow-hidden rounded-full bg-mist">
                      <div
                        className="h-full rounded-full bg-ember transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs text-slate">
                      {formatKRWShort(row.total)}
                    </span>
                  </div>
                </div>
                <div className="w-14 shrink-0 text-right text-xs text-slate">
                  {STAFF_ROLE_LABEL[row.staffRole] ?? row.staffRole}
                </div>
              </div>
            );
          })
      )}
      <p className="pt-1 text-right text-xs text-slate">
        기간: {months[0]?.label} ~ {months[months.length - 1]?.label} 누적
      </p>
    </div>
  );
}

// ─── Trend Table ──────────────────────────────────────────────────────────────

function TrendTable({
  rows,
  months,
  currentMonthStr,
}: {
  rows: StaffTrendRow[];
  months: MonthItem[];
  currentMonthStr: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-forest/5">
            <th className="sticky left-0 bg-forest/5 px-4 py-3 text-left font-semibold text-forest">
              직원명
            </th>
            {months.map((m) => (
              <th
                key={`${m.year}-${m.month}`}
                className="px-3 py-3 text-right font-semibold text-forest"
              >
                {m.month}월
              </th>
            ))}
            <th className="px-4 py-3 text-right font-semibold text-ember">합계</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={months.length + 2}
                className="px-4 py-10 text-center text-slate"
              >
                직원 데이터 없음
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.staffId} className="transition-colors hover:bg-mist/50">
                <td className="sticky left-0 bg-white px-4 py-3">
                  <Link
                    href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                    className="font-medium text-ink hover:text-forest hover:underline underline-offset-2 transition-colors"
                  >
                    {row.staffName}
                  </Link>
                  <span className="ml-1.5 text-xs text-slate">
                    {STAFF_ROLE_LABEL[row.staffRole] ?? row.staffRole}
                  </span>
                </td>
                {row.months.map((cell) => {
                  const cellKey = `${cell.year}-${String(cell.month).padStart(2, "0")}`;
                  const isCurrentMonth = cellKey === currentMonthStr;
                  return (
                    <td
                      key={cellKey}
                      className={`px-3 py-3 text-right text-ink ${
                        isCurrentMonth ? "bg-ember/5 font-semibold" : ""
                      }`}
                    >
                      {cell.revenue > 0 ? (
                        <Link
                          href={`/admin/staff-settlements/${row.staffId}?month=${cellKey}`}
                          className="text-ink hover:text-ember transition-colors"
                          title={formatKRW(cell.revenue)}
                        >
                          {formatKRWShort(cell.revenue)}
                        </Link>
                      ) : (
                        <span className="text-slate/40">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-bold text-ember">
                  {row.total > 0 ? formatKRWShort(row.total) : "-"}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-ink/20 bg-forest/5">
              <td className="sticky left-0 bg-forest/5 px-4 py-3 font-bold text-forest">
                월 합계
              </td>
              {months.map((m) => {
                const cellKey = `${m.year}-${String(m.month).padStart(2, "0")}`;
                const monthTotal = rows.reduce(
                  (s, row) =>
                    s + (row.months.find((c) => c.year === m.year && c.month === m.month)?.revenue ?? 0),
                  0
                );
                return (
                  <td key={cellKey} className="px-3 py-3 text-right font-bold text-forest">
                    {monthTotal > 0 ? formatKRWShort(monthTotal) : "-"}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-bold text-ember">
                {formatKRWShort(rows.reduce((s, r) => s + r.total, 0))}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Special Lecture Section ──────────────────────────────────────────────────

function SpecialLectureSection({ rows }: { rows: SpecialLectureRevRow[] }) {
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalInstructor = rows.reduce((s, r) => s + r.instructorAmount, 0);

  return (
    <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-forest/5">
            <th className="px-4 py-3 text-left font-semibold text-forest">특강명</th>
            <th className="px-4 py-3 text-left font-semibold text-forest">담당 강사</th>
            <th className="px-4 py-3 text-right font-semibold text-forest">수강자수</th>
            <th className="px-4 py-3 text-right font-semibold text-forest">수강료 합계</th>
            <th className="px-4 py-3 text-right font-semibold text-forest">강사 배분율</th>
            <th className="px-4 py-3 text-right font-semibold text-forest">강사 지급액</th>
            <th className="px-4 py-3 text-right font-semibold text-forest">학원 수익</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate">
                해당 기간에 수강 등록이 있는 특강이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const academyAmount = row.totalRevenue - row.instructorAmount;
              return (
                <tr key={`${row.lectureId}-${i}`} className="transition-colors hover:bg-mist/50">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/special-lectures/${row.lectureId}`}
                      className="hover:text-forest hover:underline underline-offset-2 transition-colors"
                    >
                      {row.lectureName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">{row.instructorName}</td>
                  <td className="px-4 py-3 text-right text-ink">
                    {row.enrollCount.toLocaleString("ko-KR")}명
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">
                    {formatKRW(row.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {row.instructorRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ember">
                    {formatKRW(row.instructorAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-forest">
                    {formatKRW(academyAmount)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-ink/20 bg-forest/5">
              <td colSpan={3} className="px-4 py-3 font-bold text-forest">
                합계
              </td>
              <td className="px-4 py-3 text-right font-bold text-forest">
                {formatKRW(totalRevenue)}
              </td>
              <td />
              <td className="px-4 py-3 text-right font-bold text-ember">
                {formatKRW(totalInstructor)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-forest">
                {formatKRW(totalRevenue - totalInstructor)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function AnalyticsClient({ initialFrom, initialTo }: AnalyticsClientProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  const fetchData = useCallback(
    async (fromYM: string, toYM: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/staff-settlements/analytics?from=${fromYM}&to=${toYM}`
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(
            (json as { error?: string }).error ?? "데이터를 불러오지 못했습니다."
          );
          return;
        }
        const json = (await res.json()) as { data: AnalyticsResponse };
        setData(json.data);
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchData(from, to);
  }, [from, to, fetchData]);

  function shiftRange(delta: number) {
    const newFrom = addMonths(from, delta);
    const newTo = addMonths(to, delta);
    if (delta > 0 && isAfterToday(newTo)) return;
    setFrom(newFrom);
    setTo(newTo);
  }

  const canGoNext = !isAfterToday(addMonths(to, 1));

  const currentMonthStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  })();

  // KPI computations from data
  const staffCount = data?.staffTrend.length ?? 0;
  const grandTotal = data?.staffTrend.reduce((s, r) => s + r.total, 0) ?? 0;
  const avgPerStaff =
    staffCount > 0 ? Math.floor(grandTotal / staffCount) : 0;
  const topStaff =
    data?.staffTrend.reduce<StaffTrendRow | null>(
      (best, row) => (best === null || row.total > best.total ? row : best),
      null
    ) ?? null;

  // Current-month totals for KPI
  const currentMonthTotal =
    data?.staffTrend.reduce((s, row) => {
      const cell = row.months.find(
        (c) =>
          `${c.year}-${String(c.month).padStart(2, "0")}` === currentMonthStr
      );
      return s + (cell?.revenue ?? 0);
    }, 0) ?? 0;

  return (
    <div className="space-y-10">
      {/* Period Navigator */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftRange(-6)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 6개월"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-ink">
            {from.replace("-", "년 ").replace(/(\d+)$/, "$1월")} ~{" "}
            {to.replace("-", "년 ").replace(/(\d+)$/, "$1월")}
          </span>
          {canGoNext ? (
            <button
              onClick={() => shiftRange(6)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 6개월"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-forest/30 border-t-forest" />
            불러오는 중...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            정산 대상 직원
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">
            {staffCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            이번 달 수납액
          </p>
          <p className="mt-3 text-2xl font-bold text-ember">
            {loading ? (
              <span className="inline-block h-5 w-24 animate-pulse rounded bg-mist" />
            ) : (
              formatKRWShort(currentMonthTotal)
            )}
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            평균 직원당 ({from.split("-")[1]}~{to.split("-")[1]}월)
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">
            {loading ? (
              <span className="inline-block h-5 w-24 animate-pulse rounded bg-mist" />
            ) : (
              formatKRWShort(avgPerStaff)
            )}
          </p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            최고 수납자
          </p>
          {loading ? (
            <div className="mt-3 h-5 w-20 animate-pulse rounded bg-mist" />
          ) : topStaff && topStaff.total > 0 ? (
            <>
              <p className="mt-3 text-lg font-bold text-ink">{topStaff.staffName}</p>
              <p className="text-xs text-ember">{formatKRWShort(topStaff.total)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          )}
        </div>
      </div>

      {/* Revenue Bar Chart */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-ink">
          직원별 수납액 현황
          <span className="ml-2 text-sm font-normal text-slate">
            ({from} ~ {to} 누적)
          </span>
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-20 animate-pulse rounded bg-mist" />
                <div className="h-7 flex-1 animate-pulse rounded-full bg-mist" />
              </div>
            ))}
          </div>
        ) : (
          <RevenueBarChart
            rows={data?.staffTrend ?? []}
            months={data?.months ?? []}
          />
        )}
      </div>

      {/* Monthly Trend Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            직원별 월별 수납액 추이
          </h2>
          <p className="mt-0.5 text-xs text-slate">
            금액 클릭 시 해당 월 상세 페이지로 이동합니다.
          </p>
        </div>
        {loading ? (
          <div className="p-6">
            <div className="h-32 animate-pulse rounded-xl bg-mist" />
          </div>
        ) : (
          <TrendTable
            rows={data?.staffTrend ?? []}
            months={data?.months ?? []}
            currentMonthStr={currentMonthStr}
          />
        )}
      </div>

      {/* Special Lecture Revenue Section */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">특강별 강사 수입 현황</h2>
          <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-3 py-0.5 text-xs font-medium text-forest">
            {from} ~ {to}
          </span>
        </div>
        {loading ? (
          <div className="h-32 animate-pulse rounded-[28px] bg-mist" />
        ) : (
          <SpecialLectureSection rows={data?.specialLectures ?? []} />
        )}
        <p className="mt-3 text-xs text-slate">
          * 수강 등록 건 기준 (CANCELLED/WITHDRAWN 제외). 강사 배분율은 과목별 계약 비율.
        </p>
      </div>
    </div>
  );
}
