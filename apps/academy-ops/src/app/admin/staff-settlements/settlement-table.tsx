"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SettlementExcelButton } from "./settlement-excel-button";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

type SettlementRow = {
  staffId: string;
  staffName: string;
  staffRole: string;
  adminUserId: string;
  paymentCount: number;
  totalRevenue: number;
};

type Props = {
  year: number;
  month: number;
  currentMonthStr: string;
  settlements: SettlementRow[];
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function SettlementTable({ year, month, currentMonthStr, settlements }: Props) {
  const router = useRouter();

  // year/month selectors state
  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);

  // Per-row commission rates, keyed by adminUserId
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const row of settlements) {
      init[row.adminUserId] = "";
    }
    return init;
  });

  function handleRateChange(adminUserId: string, value: string) {
    // Allow only numeric input 0-100
    if (value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setRates((prev) => ({ ...prev, [adminUserId]: value }));
    }
  }

  // Computed rows with commission
  const computedRows = useMemo(() => {
    return settlements.map((row) => {
      const rateStr = rates[row.adminUserId] ?? "";
      const rate = rateStr === "" ? 0 : parseFloat(rateStr);
      const commissionAmount = isNaN(rate) ? 0 : Math.floor(row.totalRevenue * (rate / 100));
      return { ...row, commissionRate: isNaN(rate) ? 0 : rate, commissionAmount };
    });
  }, [settlements, rates]);

  const grandTotal = useMemo(() => {
    return {
      paymentCount: computedRows.reduce((s, r) => s + r.paymentCount, 0),
      totalRevenue: computedRows.reduce((s, r) => s + r.totalRevenue, 0),
      commissionAmount: computedRows.reduce((s, r) => s + r.commissionAmount, 0),
    };
  }, [computedRows]);

  // Excel rates payload
  const excelRates = computedRows.map((r) => ({
    adminUserId: r.adminUserId,
    rate: r.commissionRate,
  }));

  function handleSearch() {
    router.push(
      `/admin/staff-settlements?month=${formatYearMonth(selectedYear, selectedMonth)}`
    );
  }

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  function prevMonthPath() {
    if (selectedMonth === 1)
      return `/admin/staff-settlements?month=${formatYearMonth(selectedYear - 1, 12)}`;
    return `/admin/staff-settlements?month=${formatYearMonth(selectedYear, selectedMonth - 1)}`;
  }

  function nextMonthPath() {
    if (selectedMonth === 12)
      return `/admin/staff-settlements?month=${formatYearMonth(selectedYear + 1, 1)}`;
    return `/admin/staff-settlements?month=${formatYearMonth(selectedYear, selectedMonth + 1)}`;
  }

  const isNextFuture =
    selectedYear > currentYear ||
    (selectedYear === currentYear && selectedMonth >= currentMonth);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Prev/Next month navigation */}
        <Link
          href={prevMonthPath()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
          aria-label="이전 달"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">년도</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">월</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSearch}
          className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 transition"
        >
          조회
        </button>

        {isNextFuture ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40 cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : (
          <Link
            href={nextMonthPath()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="다음 달"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/admin/staff-settlements/analytics?month=${formatYearMonth(year, month)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ember/30 hover:text-ember"
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            성과 분석
          </Link>
          <Link
            href={`/admin/staff-settlements/daily?month=${formatYearMonth(year, month)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
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
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            일별 상세
          </Link>
          <SettlementExcelButton year={year} month={month} rates={excelRates} />
        </div>
      </div>

      {/* Notice about commission rates */}
      <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        배분율(%)은 직접 입력하세요. 입력된 배분율은 저장되지 않으며 엑셀 출력 시 반영됩니다.
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-forest/5">
              <th className="px-4 py-3 text-left font-semibold text-forest">직원명</th>
              <th className="px-4 py-3 text-left font-semibold text-forest">역할</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">담당 수납건</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">수납 총액</th>
              <th className="px-4 py-3 text-center font-semibold text-forest">배분율(%)</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">정산 금액</th>
              <th className="px-4 py-3 text-center font-semibold text-forest">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {computedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate">
                  이 기간에 수납을 처리한 직원이 없습니다.
                </td>
              </tr>
            ) : (
              computedRows.map((row) => (
                <tr key={row.staffId} className="hover:bg-mist/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                      className="hover:text-forest transition-colors underline-offset-2 hover:underline"
                    >
                      {row.staffName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {STAFF_ROLE_LABEL[row.staffRole] ?? row.staffRole}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {row.paymentCount.toLocaleString("ko-KR")}건
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">
                    {formatKRW(row.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rates[row.adminUserId] ?? ""}
                        onChange={(e) => handleRateChange(row.adminUserId, e.target.value)}
                        placeholder="0"
                        className="w-16 rounded-lg border border-ink/20 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
                      />
                      <span className="text-slate text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ember">
                    {row.commissionRate > 0 ? formatKRW(row.commissionAmount) : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/admin/staff-settlements/${row.staffId}?month=${currentMonthStr}`}
                      className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {computedRows.length > 0 && (
            <tfoot>
              <tr className="border-t border-ink/20 bg-forest/5">
                <td colSpan={2} className="px-4 py-3 font-bold text-forest">
                  합계
                </td>
                <td className="px-4 py-3 text-right font-bold text-forest">
                  {grandTotal.paymentCount.toLocaleString("ko-KR")}건
                </td>
                <td className="px-4 py-3 text-right font-bold text-forest">
                  {formatKRW(grandTotal.totalRevenue)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-bold text-ember">
                  {grandTotal.commissionAmount > 0
                    ? formatKRW(grandTotal.commissionAmount)
                    : "-"}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate">
        * 수납 건수와 총액은 해당 월 처리된 수납 중 취소 제외 건 기준입니다. 직원과 AdminUser가
        연동되어 있는 경우만 집계됩니다.
      </p>
    </div>
  );
}
