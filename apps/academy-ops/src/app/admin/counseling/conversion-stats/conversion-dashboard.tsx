"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaffBreakdownEntry = {
  staffId: string;
  staffName: string;
  prospects: number;
  enrolled: number;
  conversionRate: number;
};

export type MonthlyTrendEntry = {
  month: string;
  newProspects: number;
  enrolled: number;
  conversionRate: number;
};

export type ConversionStats = {
  period: { from: string; to: string };
  totalProspects: number;
  visitedCount: number;
  decidingCount: number;
  enrolledCount: number;
  droppedCount: number;
  visitRate: number;
  enrollmentRate: number;
  overallConversionRate: number;
  staffBreakdown: StaffBreakdownEntry[];
  monthlyTrend: MonthlyTrendEntry[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rateColor(rate: number): string {
  if (rate >= 70) return "text-forest";
  if (rate >= 40) return "text-amber-600";
  return "text-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FunnelStep({
  label,
  count,
  total,
  rate,
  rateLabel,
  color,
  isFirst,
}: {
  label: string;
  count: number;
  total: number;
  rate: number | null;
  rateLabel: string;
  color: string;
  isFirst: boolean;
}) {
  const barPct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 4 : 0) : 0;

  return (
    <div className="flex items-center gap-4">
      {/* Arrow connector */}
      {!isFirst && (
        <div className="absolute -mt-3 ml-[88px] text-slate/30 select-none text-xs">▼</div>
      )}
      <div className="w-24 shrink-0 text-right text-sm font-semibold text-ink">{label}</div>
      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <div className="h-7 overflow-hidden rounded-full bg-ink/5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barPct}%`, backgroundColor: color }}
            />
          </div>
        </div>
        <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
          {count}명
        </span>
      </div>
      <div className="w-20 shrink-0 text-right text-xs">
        {rate !== null ? (
          <span className={`font-semibold ${rateColor(rate)}`}>
            {rateLabel}: {rate}%
          </span>
        ) : (
          <span className="text-slate/40">기준</span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  stats: ConversionStats;
  from: string;
  to: string;
}

export function ConversionDashboard({ stats, from, to }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (newFrom: string, newTo: string) => {
      startTransition(() => {
        router.push(
          `/admin/counseling/conversion-stats?from=${newFrom}&to=${newTo}`,
        );
      });
    },
    [router],
  );

  // Range navigation: shift both from and to by 6 months
  const prevFrom = shiftMonth(from, -6);
  const prevTo = shiftMonth(to, -6);
  const nextFrom = shiftMonth(from, 6);
  const nextTo = shiftMonth(to, 6);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isAtPresent = to >= currentMonthKey;

  const {
    totalProspects,
    visitedCount,
    decidingCount,
    enrolledCount,
    droppedCount,
    visitRate,
    enrollmentRate,
    overallConversionRate,
    staffBreakdown,
    monthlyTrend,
  } = stats;

  // Max for staff bar scaling
  const maxStaffProspects = Math.max(...staffBreakdown.map((s) => s.prospects), 1);

  return (
    <div className={`space-y-8 ${isPending ? "opacity-70 pointer-events-none" : ""} transition-opacity`}>
      {/* Period navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(prevFrom, prevTo)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white text-slate transition hover:border-ink/20 hover:text-ink"
          title="이전 6개월"
        >
          ‹
        </button>
        <div className="min-w-[220px] rounded-full border border-ink/10 bg-white px-5 py-2 text-center text-sm font-semibold text-ink">
          {monthLabel(from)} ~ {monthLabel(to)}
        </div>
        <button
          type="button"
          onClick={() => !isAtPresent && navigate(nextFrom, nextTo)}
          disabled={isAtPresent}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
            isAtPresent
              ? "cursor-default border-ink/5 bg-mist text-ink/30"
              : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
          }`}
          title="다음 6개월"
        >
          ›
        </button>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">전체 전환율</p>
          <p className={`mt-3 text-3xl font-bold ${rateColor(overallConversionRate)}`}>
            {overallConversionRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">등록 / 총 신규 상담</p>
        </div>

        <div className="rounded-[28px] border border-sky-200 bg-sky-50/50 p-5">
          <p className="text-xs font-semibold text-sky-700">방문률</p>
          <p className="mt-3 text-3xl font-bold text-sky-700">
            {visitRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">방문 / 총 신규 상담</p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold text-forest">방문후 등록률</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {enrollmentRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">등록 / 방문 이후 단계</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-mist p-5">
          <p className="text-xs font-semibold text-slate">총 신규 상담</p>
          <p className="mt-3 text-3xl font-bold">
            {totalProspects}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">{monthLabel(from)} ~ {monthLabel(to)}</p>
        </div>
      </div>

      {/* Funnel */}
      <article className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">상담 깔때기 (Funnel)</h2>
            <p className="mt-1 text-sm text-slate">
              총 신규 상담 → 방문/면담 → 검토 중 → 등록 완료
            </p>
          </div>
          {droppedCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
              <span className="text-slate">이탈</span>
              <span className="font-bold text-red-600">{droppedCount}명</span>
            </div>
          )}
        </div>

        {totalProspects === 0 ? (
          <p className="mt-8 text-center text-sm text-slate">해당 기간에 상담 데이터가 없습니다.</p>
        ) : (
          <div className="relative mt-8 space-y-5">
            <FunnelStep
              label="신규 상담"
              count={totalProspects}
              total={totalProspects}
              rate={null}
              rateLabel=""
              color="#4B5563"
              isFirst={true}
            />
            <FunnelStep
              label="방문/면담"
              count={visitedCount}
              total={totalProspects}
              rate={visitRate}
              rateLabel="방문률"
              color="#2563EB"
              isFirst={false}
            />
            <FunnelStep
              label="검토 중"
              count={decidingCount}
              total={totalProspects}
              rate={null}
              rateLabel=""
              color="#D97706"
              isFirst={false}
            />
            <FunnelStep
              label="등록 완료"
              count={enrolledCount}
              total={totalProspects}
              rate={overallConversionRate}
              rateLabel="전환율"
              color="#1F4D3A"
              isFirst={false}
            />
          </div>
        )}

        {totalProspects > 0 && (
          <div className="mt-6 flex flex-wrap gap-6 border-t border-ink/5 pt-5 text-sm">
            <div>
              <span className="text-slate">방문률</span>
              <span className={`ml-2 font-bold ${rateColor(visitRate)}`}>{visitRate}%</span>
            </div>
            <div>
              <span className="text-slate">방문후 등록률</span>
              <span className={`ml-2 font-bold ${rateColor(enrollmentRate)}`}>{enrollmentRate}%</span>
            </div>
            <div>
              <span className="text-slate">전체 전환율</span>
              <span className={`ml-2 font-bold ${rateColor(overallConversionRate)}`}>
                {overallConversionRate}%
              </span>
            </div>
          </div>
        )}
      </article>

      {/* Staff ranking */}
      <article className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">담당자별 전환율 랭킹</h2>
        <p className="mt-1 text-sm text-slate">
          담당 직원별 상담 건수 및 등록 전환 성과
        </p>

        {staffBreakdown.length === 0 ? (
          <p className="mt-6 text-sm text-slate">데이터 없음</p>
        ) : (
          <div className="mt-6 space-y-4">
            {staffBreakdown.map((s, idx) => {
              const barPct =
                maxStaffProspects > 0
                  ? Math.max((s.prospects / maxStaffProspects) * 100, s.prospects > 0 ? 4 : 0)
                  : 0;
              const enrolledBarPct =
                s.prospects > 0
                  ? Math.max((s.enrolled / s.prospects) * 100, s.enrolled > 0 ? 4 : 0)
                  : 0;

              return (
                <div key={s.staffId} className="flex items-center gap-4">
                  {/* Rank */}
                  <div
                    className={`w-6 shrink-0 text-center text-xs font-bold ${
                      idx === 0
                        ? "text-amber-500"
                        : idx === 1
                          ? "text-slate-400"
                          : idx === 2
                            ? "text-amber-700"
                            : "text-slate/50"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {/* Name */}
                  <div className="w-20 shrink-0 text-sm font-semibold text-ink">
                    {s.staffName}
                  </div>
                  {/* Double bar */}
                  <div className="flex flex-1 flex-col gap-1">
                    {/* Total bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-slate-300 transition-all duration-500"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs text-slate tabular-nums">
                        {s.prospects}명
                      </span>
                    </div>
                    {/* Enrolled bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-forest transition-all duration-500"
                            style={{ width: `${enrolledBarPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-forest tabular-nums">
                        {s.enrolled}명
                      </span>
                    </div>
                  </div>
                  {/* Rate */}
                  <div className="w-16 shrink-0 text-right">
                    <span className={`text-sm font-bold ${rateColor(s.conversionRate)}`}>
                      {s.conversionRate}%
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Legend */}
            <div className="flex items-center gap-4 border-t border-ink/5 pt-3 text-xs text-slate">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />
                총 상담
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest" />
                등록 완료
              </div>
            </div>
          </div>
        )}
      </article>

      {/* Monthly trend table */}
      <article className="rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-xl font-semibold">월별 추이</h2>
          <p className="mt-0.5 text-sm text-slate">기간 내 월별 신규 상담, 등록 전환 내역</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/50 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold text-ink">월</th>
                <th className="px-5 py-3 text-right font-semibold text-ink">신규 상담</th>
                <th className="px-5 py-3 text-right font-semibold text-ink">등록 완료</th>
                <th className="px-5 py-3 text-right font-semibold text-ink">전환율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {monthlyTrend.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                monthlyTrend.map((entry) => (
                  <tr key={entry.month} className="transition hover:bg-mist/20">
                    <td className="px-5 py-3 font-medium text-ink">{monthLabel(entry.month)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate">
                      {entry.newProspects}명
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-forest">
                      {entry.enrolled}명
                    </td>
                    <td className="px-5 py-3 text-right">
                      {entry.newProspects > 0 ? (
                        <span className={`font-semibold ${rateColor(entry.conversionRate)}`}>
                          {entry.conversionRate}%
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {monthlyTrend.length > 1 && (
              <tfoot className="border-t-2 border-ink/10 bg-mist/30">
                <tr>
                  <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    합계
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-ink">
                    {totalProspects}명
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-forest">
                    {enrolledCount}명
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-sm font-bold ${rateColor(overallConversionRate)}`}>
                      {overallConversionRate}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </article>

      {/* Bottom navigation */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/counseling"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 면담 지원으로
        </Link>
        <Link
          href="/admin/prospects"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          상담 방문자 목록 →
        </Link>
        <Link
          href="/admin/counseling/stats"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          월별 상담 통계 →
        </Link>
      </div>
    </div>
  );
}
