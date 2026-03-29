"use client";

import { useState } from "react";
import Link from "next/link";
import type { DailyBreakdownData } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  data: DailyBreakdownData;
  staffRoleLabel: Record<string, string>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number) {
  if (amount === 0) return "-";
  return amount.toLocaleString("ko-KR") + "원";
}

function formatKRWFull(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyBreakdownClient({ data, staffRoleLabel }: Props) {
  const { year, month, staffList, days, grandTotal, grandCount } = data;

  // Track which day rows are expanded (showing per-staff breakdown)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  // Show method breakdown column
  const [showMethods, setShowMethods] = useState(false);

  function toggleDay(date: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function handleExpandAll() {
    if (expandedDays.size === days.length) {
      setExpandedDays(new Set());
    } else {
      setExpandedDays(new Set(days.map((d) => d.date)));
    }
  }

  const allExpanded = expandedDays.size === days.length && days.length > 0;

  // Running cumulative totals
  let runningTotal = 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExpandAll}
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
          >
            {allExpanded ? "전체 접기" : "전체 펼치기"}
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm text-slate shadow-sm transition hover:border-forest/30 hover:text-forest">
            <input
              type="checkbox"
              checked={showMethods}
              onChange={(e) => setShowMethods(e.target.checked)}
              className="h-3.5 w-3.5 accent-forest"
            />
            결제 수단 표시
          </label>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          인쇄
        </button>
      </div>

      {/* Print title */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold text-ink">
          {year}년 {month}월 직원 정산 일별 상세
        </h2>
        <p className="mt-1 text-sm text-slate">
          총 {days.length}일 · {grandCount}건 · {formatKRWFull(grandTotal)}
        </p>
      </div>

      {/* Main table */}
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-forest/5">
              <th className="px-4 py-3 text-left font-semibold text-forest print:hidden" />
              <th className="px-4 py-3 text-left font-semibold text-forest">날짜</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">건수</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">수납액</th>
              {showMethods && (
                <>
                  <th className="px-4 py-3 text-right font-semibold text-forest">현금</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">카드</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">계좌이체</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">기타</th>
                </>
              )}
              <th className="px-4 py-3 text-right font-semibold text-forest">누계</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              runningTotal += day.totalAmount;
              const isExpanded = expandedDays.has(day.date);

              return (
                <>
                  {/* Day row */}
                  <tr
                    key={day.date}
                    className="border-b border-ink/5 hover:bg-mist/50 transition-colors cursor-pointer"
                    onClick={() => toggleDay(day.date)}
                  >
                    {/* Expand/collapse toggle */}
                    <td className="px-4 py-3 text-center text-slate print:hidden">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{day.dayLabel}</td>
                    <td className="px-4 py-3 text-right text-slate">
                      {day.totalCount.toLocaleString("ko-KR")}건
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {formatKRWFull(day.totalAmount)}
                    </td>
                    {showMethods && (
                      <>
                        <td className="px-4 py-3 text-right text-slate">
                          {formatKRW(day.byCash)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate">
                          {formatKRW(day.byCard)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate">
                          {formatKRW(day.byTransfer)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate">
                          {formatKRW(day.byOther)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-forest font-medium">
                      {runningTotal.toLocaleString("ko-KR")}원
                    </td>
                  </tr>

                  {/* Expanded: per-staff breakdown rows */}
                  {isExpanded &&
                    day.byStaff.map((sr) => (
                      <tr
                        key={`${day.date}-${sr.staffId}`}
                        className="border-b border-ink/5 bg-mist/30"
                      >
                        <td className="print:hidden" />
                        <td className="py-2 pl-10 pr-4 text-slate">
                          <Link
                            href={`/admin/staff-settlements/${sr.staffId}?month=${year}-${String(month).padStart(2, "0")}`}
                            className="inline-flex items-center gap-1.5 text-xs hover:text-forest transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="font-medium text-ink">{sr.staffName}</span>
                            <span className="text-slate/70">
                              {staffRoleLabel[sr.staffRole] ?? sr.staffRole}
                            </span>
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-right text-xs text-slate">
                          {sr.paymentCount.toLocaleString("ko-KR")}건
                        </td>
                        <td className="py-2 px-4 text-right text-xs font-medium text-ember">
                          {formatKRWFull(sr.total)}
                        </td>
                        {showMethods && (
                          <>
                            <td colSpan={4} />
                          </>
                        )}
                        <td className="py-2 px-4 text-right text-xs text-slate">
                          {((sr.total / day.totalAmount) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                </>
              );
            })}
          </tbody>
          {/* Grand total footer */}
          <tfoot>
            <tr className="border-t-2 border-ink/20 bg-forest/5">
              <td className="print:hidden" />
              <td className="px-4 py-3 font-bold text-forest">
                {month}월 합계 ({days.length}일)
              </td>
              <td className="px-4 py-3 text-right font-bold text-forest">
                {grandCount.toLocaleString("ko-KR")}건
              </td>
              <td className="px-4 py-3 text-right font-bold text-ember">
                {formatKRWFull(grandTotal)}
              </td>
              {showMethods && (
                <>
                  <td className="px-4 py-3 text-right font-bold text-slate">
                    {formatKRW(days.reduce((s, d) => s + d.byCash, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate">
                    {formatKRW(days.reduce((s, d) => s + d.byCard, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate">
                    {formatKRW(days.reduce((s, d) => s + d.byTransfer, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate">
                    {formatKRW(days.reduce((s, d) => s + d.byOther, 0))}
                  </td>
                </>
              )}
              <td className="px-4 py-3 text-right font-bold text-forest">
                {formatKRWFull(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Staff summary section */}
      {staffList.length > 0 && days.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-ink">직원별 월 합계</h3>
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-forest/5">
                  <th className="px-4 py-3 text-left font-semibold text-forest">직원</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">역할</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">총 건수</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">총 수납액</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">비율</th>
                  <th className="px-4 py-3 text-center font-semibold text-forest print:hidden">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {(() => {
                  // Aggregate per-staff across all days
                  const staffTotals = new Map<
                    string,
                    { staffId: string; staffName: string; staffRole: string; count: number; total: number }
                  >();
                  for (const day of days) {
                    for (const sr of day.byStaff) {
                      const existing = staffTotals.get(sr.staffId);
                      if (existing) {
                        existing.count += sr.paymentCount;
                        existing.total += sr.total;
                      } else {
                        staffTotals.set(sr.staffId, {
                          staffId: sr.staffId,
                          staffName: sr.staffName,
                          staffRole: sr.staffRole,
                          count: sr.paymentCount,
                          total: sr.total,
                        });
                      }
                    }
                  }

                  const rows = Array.from(staffTotals.values()).sort(
                    (a, b) => b.total - a.total
                  );

                  return rows.map((row) => (
                    <tr key={row.staffId} className="hover:bg-mist/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">{row.staffName}</td>
                      <td className="px-4 py-3 text-slate">
                        {staffRoleLabel[row.staffRole] ?? row.staffRole}
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        {row.count.toLocaleString("ko-KR")}건
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink">
                        {formatKRWFull(row.total)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate">
                        {grandTotal > 0
                          ? ((row.total / grandTotal) * 100).toFixed(1) + "%"
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center print:hidden">
                        <Link
                          href={`/admin/staff-settlements/${row.staffId}?month=${year}-${String(month).padStart(2, "0")}`}
                          className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={2} className="px-4 py-3 font-bold text-forest">합계</td>
                  <td className="px-4 py-3 text-right font-bold text-forest">
                    {grandCount.toLocaleString("ko-KR")}건
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ember">
                    {formatKRWFull(grandTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-forest">100%</td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate print:hidden">
        * 취소 처리된 수납은 집계에서 제외됩니다. 직원과 관리자 계정이 연동된 경우만 집계됩니다.
      </p>
    </div>
  );
}
