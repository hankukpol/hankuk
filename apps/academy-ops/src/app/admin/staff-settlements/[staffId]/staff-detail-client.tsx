"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyHistoryRow } from "@/app/api/staff-settlements/[staffId]/history/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentRow = {
  id: string;
  processedAt: string;
  categoryLabel: string;
  methodLabel: string;
  netAmount: number;
  studentName: string | null;
  examNumber: string | null;
  itemSummary: string;
};

type CategoryBreakdown = {
  category: string;
  label: string;
  count: number;
  total: number;
};

export type Props = {
  staffId: string;
  adminUserId: string;
  year: number;
  month: number;
  totalRevenue: number;
  paymentRows: PaymentRow[];
  categoryBreakdown: CategoryBreakdown[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatYearMonth(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ─── Commission panel (shared across tabs) ───────────────────────────────────

function CommissionPanel({
  staffId,
  adminUserId,
  year,
  month,
  totalRevenue,
}: {
  staffId: string;
  adminUserId: string;
  year: number;
  month: number;
  totalRevenue: number;
}) {
  const [rateStr, setRateStr] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);

  const rate = rateStr === "" ? 0 : parseFloat(rateStr);
  const validRate = isNaN(rate) ? 0 : Math.max(0, Math.min(100, rate));
  const commissionAmount = Math.floor(totalRevenue * (validRate / 100));

  function handleRateChange(value: string) {
    if (value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setRateStr(value);
    }
  }

  async function handleExcelDownload() {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(year));
      params.set("month", String(month));
      if (validRate > 0) {
        params.set(`rates[${adminUserId}]`, String(validRate));
      }
      const res = await fetch(`/api/staff-settlements/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "엑셀 다운로드에 실패했습니다.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `직원정산_${year}년${String(month).padStart(2, "0")}월.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleCsvDownload() {
    setCsvDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", `${year}-${String(month).padStart(2, "0")}`);
      if (validRate > 0) {
        params.set("rate", String(validRate));
      }
      const res = await fetch(
        `/api/staff-settlements/${staffId}/export?${params.toString()}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "CSV 다운로드에 실패했습니다.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `직원정산상세_${year}년${String(month).padStart(2, "0")}월.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setCsvDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Commission rate input */}
      <div className="flex items-center gap-2 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-2">
        <span className="text-sm text-amber-800">배분율</span>
        <input
          type="text"
          inputMode="decimal"
          value={rateStr}
          onChange={(e) => handleRateChange(e.target.value)}
          placeholder="0"
          className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        />
        <span className="text-sm text-amber-800">%</span>
        {validRate > 0 && (
          <span className="ml-1 text-sm font-semibold text-ember">
            = {formatKRW(commissionAmount)}
          </span>
        )}
      </div>

      {/* CSV export (per-staff detail) */}
      <button
        onClick={handleCsvDownload}
        disabled={csvDownloading}
        className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition hover:bg-ember/20 disabled:opacity-50"
      >
        {csvDownloading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ember/40 border-t-ember" />
            다운로드 중...
          </>
        ) : (
          <>
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            CSV 내보내기
          </>
        )}
      </button>

      {/* Excel download */}
      <button
        onClick={handleExcelDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20 disabled:opacity-50"
      >
        {downloading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-forest/40 border-t-forest" />
            다운로드 중...
          </>
        ) : (
          <>
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            엑셀 다운로드
          </>
        )}
      </button>
    </div>
  );
}

// ─── Settlement history tab ───────────────────────────────────────────────────

type HistoryRowWithRate = MonthlyHistoryRow & {
  rateStr: string;
  commissionAmount: number;
};

function SettlementHistoryTab({ staffId, currentYear }: { staffId: string; currentYear: number }) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRowWithRate[]>([]);
  const [yearTotal, setYearTotal] = useState(0);
  const [globalRateStr, setGlobalRateStr] = useState("");

  // Per-row override rates (month index 1..12)
  const [rowRates, setRowRates] = useState<Record<number, string>>({});

  const availableYears = Array.from(
    { length: 3 },
    (_, i) => today.getFullYear() + 1 - i
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/staff-settlements/${staffId}/history?year=${selectedYear}`
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError((json as { error?: string }).error ?? "데이터를 불러오지 못했습니다.");
          return;
        }
        const json = (await res.json()) as {
          data: {
            months: MonthlyHistoryRow[];
            yearTotal: number;
          };
        };
        if (!cancelled) {
          setRows(
            json.data.months.map((m) => ({
              ...m,
              rateStr: "",
              commissionAmount: 0,
            }))
          );
          setYearTotal(json.data.yearTotal);
        }
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [staffId, selectedYear]);

  // When global rate changes, recalculate all rows that don't have a per-row override
  useEffect(() => {
    const globalRate = parseFloat(globalRateStr);
    const validGlobal = isNaN(globalRate) ? 0 : Math.max(0, Math.min(100, globalRate));
    setRows((prev) =>
      prev.map((r) => {
        const perRow = rowRates[r.month];
        const rateToUse = perRow !== undefined && perRow !== ""
          ? Math.max(0, Math.min(100, parseFloat(perRow) || 0))
          : validGlobal;
        return {
          ...r,
          rateStr: perRow !== undefined ? perRow : r.rateStr,
          commissionAmount: Math.floor(r.totalRevenue * (rateToUse / 100)),
        };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalRateStr, rowRates]);

  function handleGlobalRate(value: string) {
    if (value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setGlobalRateStr(value);
    }
  }

  function handleRowRate(month: number, value: string) {
    if (value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setRowRates((prev) => ({ ...prev, [month]: value }));
    }
  }

  const totalCommission = rows.reduce((s, r) => s + r.commissionAmount, 0);

  const chartData = rows
    .filter((r) => r.totalRevenue > 0 || r.commissionAmount > 0)
    .map((r) => ({
      name: `${r.month}월`,
      수납액: r.totalRevenue,
      정산액: r.commissionAmount,
    }));

  const activeMonths = rows.filter((r) => r.totalRevenue > 0);

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Year selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">연도</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>

        {/* Global rate input */}
        <div className="flex items-center gap-2 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-2">
          <span className="text-sm text-amber-800">일괄 배분율</span>
          <input
            type="text"
            inputMode="decimal"
            value={globalRateStr}
            onChange={(e) => handleGlobalRate(e.target.value)}
            placeholder="0"
            className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
          <span className="text-sm text-amber-800">%</span>
          {parseFloat(globalRateStr) > 0 && (
            <span className="ml-1 text-sm font-semibold text-ember">
              적용
            </span>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            활동 월수
          </p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {activeMonths.length}
            <span className="ml-1 text-sm font-normal text-slate">개월</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            연간 수납 총액
          </p>
          <p className="mt-2 text-2xl font-bold text-ember">
            {formatKRW(yearTotal)}
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            월평균 수납
          </p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {activeMonths.length > 0
              ? formatKRW(Math.floor(yearTotal / activeMonths.length))
              : "-"}
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            연간 정산 합계
          </p>
          <p className="mt-2 text-2xl font-bold text-forest">
            {totalCommission > 0 ? formatKRW(totalCommission) : "-"}
          </p>
        </div>
      </div>

      {/* Loading / error state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-forest/30 border-t-forest" />
          <span className="ml-3 text-sm text-slate">불러오는 중...</span>
        </div>
      )}
      {!loading && error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Bar chart */}
      {!loading && !error && chartData.length > 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-ink">
            {selectedYear}년 월별 수납·정산 추이
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#4B5563" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 10000
                    ? `${Math.floor(v / 10000)}만`
                    : v.toLocaleString("ko-KR")
                }
                tick={{ fontSize: 11, fill: "#4B5563" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(value) => [formatKRW(value as number), ""]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="수납액" fill="#C55A11" radius={[4, 4, 0, 0]} />
              <Bar dataKey="정산액" fill="#1F4D3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly history table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-5 py-3 text-left font-semibold text-forest">월</th>
                <th className="px-5 py-3 text-right font-semibold text-forest">수납 건수</th>
                <th className="px-5 py-3 text-right font-semibold text-forest">총 수납액</th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  배분율 (%)
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">정산액</th>
                <th className="px-5 py-3 text-center font-semibold text-forest">바로가기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((row) => {
                const hasActivity = row.totalRevenue > 0;
                const effectiveRateStr =
                  rowRates[row.month] !== undefined
                    ? rowRates[row.month]
                    : globalRateStr;
                const effectiveRate = parseFloat(effectiveRateStr) || 0;

                return (
                  <tr
                    key={row.month}
                    className={
                      hasActivity
                        ? "hover:bg-mist/50 transition-colors"
                        : "opacity-50"
                    }
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      {row.monthLabel}
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {hasActivity
                        ? row.paymentCount.toLocaleString("ko-KR") + "건"
                        : "-"}
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {hasActivity ? formatKRW(row.totalRevenue) : "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {hasActivity ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            rowRates[row.month] !== undefined
                              ? rowRates[row.month]
                              : globalRateStr
                          }
                          onChange={(e) => handleRowRate(row.month, e.target.value)}
                          placeholder={globalRateStr || "0"}
                          className="w-16 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                        />
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {hasActivity && effectiveRate > 0 ? (
                        <span className="text-forest">
                          {formatKRW(
                            Math.floor(
                              row.totalRevenue * (effectiveRate / 100)
                            )
                          )}
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {hasActivity ? (
                        <Link
                          href={`/admin/staff-settlements/${staffId}?month=${formatYearMonth(
                            row.year,
                            row.month
                          )}`}
                          className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                        >
                          보기
                        </Link>
                      ) : (
                        <span className="text-slate/40 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totalCommission > 0 && (
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={2} className="px-5 py-3 font-bold text-forest">
                    {selectedYear}년 합계
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {formatKRW(yearTotal)}
                  </td>
                  <td />
                  <td className="px-5 py-3 text-right font-bold text-forest">
                    {formatKRW(totalCommission)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!loading && !error && activeMonths.length === 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center text-slate shadow-sm">
          {selectedYear}년에 수납 처리 내역이 없습니다.
        </div>
      )}
    </div>
  );
}

// ─── Main tabbed client component ────────────────────────────────────────────

type Tab = "current" | "history";

export function StaffDetailClient({
  staffId,
  adminUserId,
  year,
  month,
  totalRevenue,
  paymentRows,
  categoryBreakdown,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("current");

  const currentMonthStr = formatYearMonth(year, month);

  return (
    <div>
      {/* Tab bar */}
      <div className="mt-8 flex gap-1 border-b border-ink/10">
        <button
          onClick={() => setActiveTab("current")}
          className={`rounded-t-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "current"
              ? "border border-b-white border-ink/10 -mb-px bg-white text-forest"
              : "text-slate hover:text-ink"
          }`}
        >
          {year}년 {month}월 수납 내역
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`rounded-t-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border border-b-white border-ink/10 -mb-px bg-white text-forest"
              : "text-slate hover:text-ink"
          }`}
        >
          정산 이력
        </button>
      </div>

      {/* Tab panels */}
      <div className="mt-6">
        {activeTab === "current" && (
          <div className="space-y-6">
            {/* Commission panel */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">
                {year}년 {month}월 수납 내역
                <span className="ml-2 text-sm font-normal text-slate">
                  ({paymentRows.length}건)
                </span>
              </h2>
              <CommissionPanel
                staffId={staffId}
                adminUserId={adminUserId}
                year={year}
                month={month}
                totalRevenue={totalRevenue}
              />
            </div>

            {/* Category breakdown */}
            {categoryBreakdown.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">수납 유형별 분류</h3>
                <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-forest/5">
                        <th className="px-5 py-3 text-left font-semibold text-forest">유형</th>
                        <th className="px-5 py-3 text-right font-semibold text-forest">건수</th>
                        <th className="px-5 py-3 text-right font-semibold text-forest">합계</th>
                        <th className="px-5 py-3 text-right font-semibold text-forest">비율</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {categoryBreakdown.map((row) => (
                        <tr key={row.category} className="hover:bg-mist/50 transition-colors">
                          <td className="px-5 py-3 font-medium text-ink">{row.label}</td>
                          <td className="px-5 py-3 text-right text-ink">
                            {row.count.toLocaleString("ko-KR")}건
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-ink">
                            {formatKRW(row.total)}
                          </td>
                          <td className="px-5 py-3 text-right text-slate">
                            {totalRevenue > 0
                              ? ((row.total / totalRevenue) * 100).toFixed(1) + "%"
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-ink/20 bg-forest/5">
                        <td colSpan={2} className="px-5 py-3 font-bold text-forest">
                          합계
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-forest">
                          {formatKRW(totalRevenue)}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-forest">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Payment list */}
            {paymentRows.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center text-slate shadow-sm">
                이 기간에 처리한 수납 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-forest/5">
                      <th className="px-4 py-3 text-left font-semibold text-forest">처리일시</th>
                      <th className="px-4 py-3 text-left font-semibold text-forest">학생</th>
                      <th className="px-4 py-3 text-left font-semibold text-forest">유형</th>
                      <th className="px-4 py-3 text-left font-semibold text-forest">결제방법</th>
                      <th className="px-4 py-3 text-left font-semibold text-forest">항목</th>
                      <th className="px-4 py-3 text-right font-semibold text-forest">금액</th>
                      <th className="px-4 py-3 text-center font-semibold text-forest">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {paymentRows.map((row) => (
                      <tr key={row.id} className="hover:bg-mist/50 transition-colors">
                        <td className="px-4 py-3 text-slate">
                          {new Date(row.processedAt).toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })}{" "}
                          {new Date(row.processedAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {row.examNumber ? (
                            <Link
                              href={`/admin/students/${row.examNumber}`}
                              className="font-medium text-ink hover:text-forest transition-colors"
                            >
                              {row.studentName}
                            </Link>
                          ) : (
                            <span className="text-slate">{row.studentName ?? "-"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate">{row.categoryLabel}</td>
                        <td className="px-4 py-3 text-slate">{row.methodLabel}</td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 text-slate"
                          title={row.itemSummary}
                        >
                          {row.itemSummary}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-ink">
                          {formatKRW(row.netAmount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/admin/payments/${row.id}`}
                            className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                          >
                            보기
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/20 bg-forest/5">
                      <td colSpan={5} className="px-4 py-3 font-bold text-forest">
                        합계
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ember">
                        {formatKRW(totalRevenue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <SettlementHistoryTab
            staffId={staffId}
            currentYear={year}
          />
        )}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href={`/admin/staff-settlements?month=${currentMonthStr}`}
          className="text-sm text-forest hover:underline"
        >
          ← 직원 정산 목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
