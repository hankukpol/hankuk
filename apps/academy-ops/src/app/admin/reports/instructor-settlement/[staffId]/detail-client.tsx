"use client";

import { useState } from "react";

type MonthlyRow = {
  month: string; // YYYY-MM
  paymentCount: number;
  totalRevenue: number;
  taxDeduction: number;
  netPayout: number;
  isPaid: boolean;
};

type Props = {
  staffId: string;
  staffName: string;
  staffRole: string;
  monthlyRows: MonthlyRow[];
  ytdTotal: number;
  monthlyAvg: number;
  prevYearSamePeriodTotal: number;
  currentMonthRevenue: number;
  currentMonthStr: string;
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function getMonthLabel(monthStr: string) {
  const [y, m] = monthStr.split("-");
  return `${y}년 ${parseInt(m)}월`;
}

export function InstructorSettlementDetailClient({
  staffName,
  monthlyRows,
  ytdTotal,
  monthlyAvg,
  prevYearSamePeriodTotal,
  currentMonthRevenue,
  currentMonthStr,
}: Props) {
  const [activeTab, setActiveTab] = useState<"table" | "chart">("table");

  const maxRevenue = Math.max(...monthlyRows.map((r) => r.totalRevenue), 1);

  const prevYearDiff = ytdTotal - prevYearSamePeriodTotal;
  const prevYearPct =
    prevYearSamePeriodTotal > 0
      ? ((prevYearDiff / prevYearSamePeriodTotal) * 100).toFixed(1)
      : null;

  function handleExport() {
    // Build CSV
    const headers = [
      "월",
      "수납 건수",
      "정산금액",
      "세금(3.3%)",
      "실지급",
      "지급상태",
    ];
    const csvRows = [
      headers.join(","),
      ...monthlyRows.map((r) =>
        [
          r.month,
          r.paymentCount,
          r.totalRevenue,
          r.taxDeduction,
          r.netPayout,
          r.isPaid ? "지급완료" : "미지급",
        ].join(",")
      ),
      ["합계", monthlyRows.reduce((s, r) => s + r.paymentCount, 0), ytdTotal, Math.floor(ytdTotal * 0.033), ytdTotal - Math.floor(ytdTotal * 0.033), ""].join(","),
    ];
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${staffName}_강사정산_${currentMonthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ember">
            이번달 정산
          </p>
          <p className="mt-3 text-2xl font-bold text-ember">
            {formatKRW(currentMonthRevenue)}
          </p>
          <p className="mt-1 text-xs text-ember/70">세전 기준</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">
            YTD 합계
          </p>
          <p className="mt-3 text-2xl font-bold text-forest">
            {formatKRW(ytdTotal)}
          </p>
          <p className="mt-1 text-xs text-forest/70">올해 누계</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">
            월 평균
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">
            {formatKRW(monthlyAvg)}
          </p>
          <p className="mt-1 text-xs text-slate">최근 12개월</p>
        </div>
        <div
          className={`rounded-[24px] border p-5 ${
            prevYearDiff >= 0
              ? "border-sky-200 bg-sky-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${
              prevYearDiff >= 0 ? "text-sky-700" : "text-red-600"
            }`}
          >
            전년 동기 대비
          </p>
          <p
            className={`mt-3 text-2xl font-bold ${
              prevYearDiff >= 0 ? "text-sky-700" : "text-red-700"
            }`}
          >
            {prevYearDiff >= 0 ? "+" : ""}
            {prevYearPct !== null ? `${prevYearPct}%` : "N/A"}
          </p>
          <p
            className={`mt-1 text-xs ${
              prevYearDiff >= 0 ? "text-sky-600" : "text-red-500"
            }`}
          >
            {prevYearSamePeriodTotal > 0
              ? `전년 ${formatKRW(prevYearSamePeriodTotal)}`
              : "전년 데이터 없음"}
          </p>
        </div>
      </div>

      {/* Tab header + Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("table")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "table"
                ? "bg-forest text-white shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            월별 내역
          </button>
          <button
            onClick={() => setActiveTab("chart")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "chart"
                ? "bg-forest text-white shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            트렌드 차트
          </button>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
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
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          엑셀 내보내기
        </button>
      </div>

      {/* Table tab */}
      {activeTab === "table" && (
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  월
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  수납 건수
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  정산금액
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  세금(3.3%)
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  실지급 예정
                </th>
                <th className="px-5 py-3 text-center font-semibold text-forest">
                  지급상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthlyRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-slate"
                  >
                    정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                monthlyRows.map((row) => (
                  <tr
                    key={row.month}
                    className={`transition-colors hover:bg-mist/50 ${
                      row.month === currentMonthStr
                        ? "bg-ember/5 font-medium"
                        : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-ink">
                      {getMonthLabel(row.month)}
                      {row.month === currentMonthStr && (
                        <span className="ml-2 inline-flex rounded-full bg-ember/10 px-2 py-0.5 text-xs font-semibold text-ember">
                          이번달
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {row.paymentCount > 0
                        ? `${row.paymentCount.toLocaleString("ko-KR")}건`
                        : "-"}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-ink">
                      {row.totalRevenue > 0
                        ? formatKRW(row.totalRevenue)
                        : "-"}
                    </td>
                    <td className="px-5 py-3 text-right text-red-600">
                      {row.taxDeduction > 0
                        ? formatKRW(row.taxDeduction)
                        : "-"}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ember">
                      {row.netPayout > 0 ? formatKRW(row.netPayout) : "-"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {row.isPaid ? (
                        <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                          지급완료
                        </span>
                      ) : row.totalRevenue > 0 ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          미지급
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-slate">
                          해당없음
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {monthlyRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink/20 bg-forest/5">
                  <td className="px-5 py-3 font-bold text-forest">합계</td>
                  <td className="px-5 py-3 text-right font-bold text-forest">
                    {monthlyRows
                      .reduce((s, r) => s + r.paymentCount, 0)
                      .toLocaleString("ko-KR")}
                    건
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-forest">
                    {formatKRW(ytdTotal)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-red-600">
                    {formatKRW(Math.floor(ytdTotal * 0.033))}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {formatKRW(ytdTotal - Math.floor(ytdTotal * 0.033))}
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Chart tab */}
      {activeTab === "chart" && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h3 className="text-sm font-semibold text-ink">
            12개월 정산 트렌드
          </h3>
          <p className="mt-1 text-xs text-slate">월별 수납금액 기준</p>
          {monthlyRows.length === 0 ? (
            <div className="mt-8 py-12 text-center text-slate">
              차트 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 flex items-end gap-2">
              {monthlyRows.map((row) => {
                const heightPct =
                  maxRevenue > 0
                    ? Math.max((row.totalRevenue / maxRevenue) * 100, 2)
                    : 2;
                const isCurrent = row.month === currentMonthStr;
                return (
                  <div
                    key={row.month}
                    className="group flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="hidden text-xs font-semibold text-ink group-hover:block">
                      {row.totalRevenue > 0
                        ? formatKRW(row.totalRevenue)
                        : "-"}
                    </span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        isCurrent ? "bg-ember" : "bg-forest/40 hover:bg-forest/70"
                      }`}
                      style={{ height: `${heightPct * 1.5}px` }}
                      title={`${getMonthLabel(row.month)}: ${formatKRW(row.totalRevenue)}`}
                    />
                    <span className="text-[10px] text-slate">
                      {row.month.split("-")[1]}월
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 text-xs text-slate">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-ember" />
              <span>이번달</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-forest/40" />
              <span>이전달</span>
            </div>
          </div>
        </div>
      )}

      {/* Footnote */}
      <div className="space-y-1 text-xs text-slate">
        <p>
          * 정산금액은 해당 월에 처리된 수납 중 취소 제외 건의 netAmount 기준입니다.
        </p>
        <p>
          * 세금(3.3%)은 사업소득세(소득세 3% + 지방소득세 0.3%)로 참고용
          수치입니다.
        </p>
      </div>
    </div>
  );
}
