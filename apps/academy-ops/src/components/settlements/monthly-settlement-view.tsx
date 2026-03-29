"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PrintButton } from "@/components/ui/print-button";
import type {
  MonthlySettlementData,
  MonthlyCategoryStat,
  MonthlyMethodStat,
} from "@/lib/settlements/monthly";

type Props = {
  initialData: MonthlySettlementData;
};

type CategoryKey = keyof Omit<
  MonthlySettlementData["summary"],
  "totalCount" | "grossTotal" | "refundTotal" | "netTotal"
>;

type MethodKey = keyof MonthlySettlementData["methods"];

type TooltipPayloadItem = {
  name: string;
  value: number;
  color: string;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
};

const UI_TEXT = {
  requestFailed: "\uc694\uccad\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.",
  queryFailed: "\uc870\ud68c \uc2e4\ud328",
  exportFailed: "\ub0b4\ubcf4\ub0b4\uae30 \uc2e4\ud328",
  wonSuffix: "\uc6d0",
  manwonSuffix: "\ub9cc\uc6d0",
  previousMonth: "\uc774\uc804 \ub2ec",
  nextMonth: "\ub2e4\uc74c \ub2ec",
  currentMonth: "\uc774\ubc88 \ub2ec",
  printReport: "\uc6d4\uacc4\ud45c \ucd9c\ub825",
  exportExcel: "Excel \ub0b4\ubcf4\ub0b4\uae30",
  exporting: "\ub0b4\ubcf4\ub0b4\ub294 \uc911...",
  monthlySettlement: "\uc6d4\uacc4\ud45c",
  totalCount: "\ucd1d \uac74\uc218",
  grossTotal: "\uc218\ub0a9 \ud569\uacc4",
  refundTotal: "\ud658\ubd88 \ud569\uacc4",
  netTotal: "\uc2e4\uc218\ub0a9",
  dailyOverview: "\uc77c\ubcc4 \uc218\ub0a9 \ud604\ud669",
  dailyTrend: "\uc77c\ubcc4 \uc218\ub0a9 \ucd94\uc774",
  unitManwon: "\ub2e8\uc704: \ub9cc\uc6d0",
  emptyPayments: "\uc218\ub0a9 \ub0b4\uc5ed\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
  grossShort: "\uc218\ub0a9",
  refundShort: "\ud658\ubd88",
  categorySummary: "\uc720\ud615\ubcc4 \uc6d4\uac04 \uc218\ub0a9 \uc9d1\uacc4",
  categoryHeader: "\uc720\ud615",
  methodSummary: "\uacb0\uc81c \uc218\ub2e8\ubcc4 \uc9d1\uacc4",
  methodEmpty: "\uc9d1\uacc4\ud560 \uacb0\uc81c \uc218\ub2e8\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
  dateHeader: "\ub0a0\uc9dc",
  countHeader: "\uac74\uc218",
  grossHeader: "\uc218\ub0a9\uc561",
  refundHeader: "\ud658\ubd88\uc561",
  netHeader: "\uc2e4\uc218\ub0a9",
  totalRow: "\ud569\uacc4",
} as const;

const WEEKDAYS = [
  "\uc77c",
  "\uc6d4",
  "\ud654",
  "\uc218",
  "\ubaa9",
  "\uae08",
  "\ud1a0",
] as const;

const CATEGORY_ROWS: Array<{ key: CategoryKey; label: string }> = [
  { key: "tuition", label: "\uc218\uac15\ub8cc" },
  { key: "facility", label: "\uc2dc\uc124\ube44" },
  { key: "textbook", label: "\uad50\uc7ac" },
  { key: "material", label: "\uad50\uad6c\u00b7\uc18c\ubaa8\ud488" },
  { key: "singleCourse", label: "\ub2e8\uacfc POS" },
  { key: "penalty", label: "\uc704\uc57d\uae08" },
  { key: "etc", label: "\uae30\ud0c0" },
];

const METHOD_ROWS: Array<{ key: MethodKey; label: string; color: string }> = [
  { key: "cash", label: "\ud604\uae08", color: "bg-amber-400" },
  { key: "card", label: "\uce74\ub4dc", color: "bg-purple-400" },
  { key: "transfer", label: "\uacc4\uc88c\uc774\uccb4", color: "bg-sky-400" },
  { key: "point", label: "\ud3ec\uc778\ud2b8", color: "bg-emerald-400" },
  { key: "mixed", label: "\ubcf5\ud569", color: "bg-rose-400" },
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? UI_TEXT.requestFailed);
  }
  return payload as T;
}

function formatAmt(amount: number): string {
  return `${amount.toLocaleString()}${UI_TEXT.wonSuffix}`;
}

function addMonths(monthStr: string, delta: number): string {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatKoreanMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  return `${year}\ub144 ${month}\uc6d4`;
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

function formatDayShort(dateStr: string): string {
  const day = parseInt(dateStr.split("-")[2], 10);
  return `${day}\uc77c`;
}

function DailyTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {item.value.toLocaleString()}
          {UI_TEXT.manwonSuffix}
        </p>
      ))}
    </div>
  );
}

export function MonthlySettlementView({ initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [currentMonth, setCurrentMonth] = useState(initialData.month);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const thisMonth = currentMonthStr();

  const navigateToMonth = useCallback(
    (month: string) => {
      router.push(`/admin/settlements/monthly?month=${month}`);
    },
    [router],
  );

  async function fetchMonth(month: string) {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await requestJson<MonthlySettlementData>(
          `/api/settlements/monthly?month=${month}`,
        );
        setData(result);
        setCurrentMonth(result.month);
        navigateToMonth(result.month);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : UI_TEXT.queryFailed);
      }
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/settlements/monthly/export?month=${currentMonth}`);
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? UI_TEXT.exportFailed);
      }

      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `\uc6d4\uacc4\ud45c-${currentMonth}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : UI_TEXT.exportFailed);
    } finally {
      setIsExporting(false);
    }
  }

  const { summary, methods, dailyBreakdown } = data;

  const visibleCategories = CATEGORY_ROWS.filter((row) => {
    const stat = summary[row.key] as MonthlyCategoryStat;
    return stat.count > 0 || stat.gross > 0 || stat.refund > 0;
  });

  const visibleMethods = METHOD_ROWS.filter((row) => {
    const stat = methods[row.key] as MonthlyMethodStat;
    return stat.count > 0 || stat.amount > 0;
  });

  const methodTotal = visibleMethods.reduce(
    (sum, row) => sum + (methods[row.key] as MonthlyMethodStat).amount,
    0,
  );

  const chartData = dailyBreakdown.map((entry) => ({
    label: formatDayShort(entry.date),
    grossUnits: Math.round(entry.gross / 10000),
    refundUnits: Math.round(entry.refund / 10000),
  }));

  return (
    <div
      className="space-y-6 print-title"
      data-print-title={`${formatKoreanMonth(currentMonth)} ${UI_TEXT.monthlySettlement}`}
    >
      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fetchMonth(addMonths(currentMonth, -1))}
          disabled={isPending}
          className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          {UI_TEXT.previousMonth}
        </button>
        <span className="px-3 text-lg font-semibold text-ink">
          {formatKoreanMonth(currentMonth)}
        </span>
        <button
          type="button"
          onClick={() => fetchMonth(addMonths(currentMonth, 1))}
          disabled={isPending || currentMonth >= thisMonth}
          className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          {UI_TEXT.nextMonth}
        </button>
        {currentMonth !== thisMonth ? (
          <button
            type="button"
            onClick={() => fetchMonth(thisMonth)}
            disabled={isPending}
            className="rounded-full bg-forest px-3 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
          >
            {UI_TEXT.currentMonth}
          </button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PrintButton label={UI_TEXT.printReport} />
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isPending}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isExporting ? UI_TEXT.exporting : UI_TEXT.exportExcel}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">{UI_TEXT.totalCount}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {summary.totalCount.toLocaleString()}\uac74
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">{UI_TEXT.grossTotal}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {summary.grossTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">{UI_TEXT.wonSuffix}</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">{UI_TEXT.refundTotal}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            -{summary.refundTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">{UI_TEXT.wonSuffix}</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-medium text-forest/70">{UI_TEXT.netTotal}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {summary.netTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-forest/70">{UI_TEXT.wonSuffix}</span>
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">{UI_TEXT.dailyOverview}</h2>
          <p className="mt-0.5 text-xs text-slate">{UI_TEXT.unitManwon}</p>
        </div>
        <div className={`px-4 py-4 ${isPending ? "opacity-50" : ""}`}>
          {chartData.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-sm text-slate">
              {UI_TEXT.emptyPayments}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                barGap={2}
              >
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: "#E5E7EB" }}
                  tick={{ fontSize: 11, fill: "#4B5563" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#4B5563" }}
                  tickFormatter={(value: number) => `${value}`}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<DailyTooltip />} />
                <Bar
                  dataKey="grossUnits"
                  name={UI_TEXT.grossShort}
                  fill="#1F4D3A"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="refundUnits"
                  name={UI_TEXT.refundShort}
                  fill="#C55A11"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {chartData.length > 0 ? (
          <div className="flex items-center gap-4 px-6 pb-4 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#1F4D3A]" />
              {UI_TEXT.grossShort}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#C55A11]" />
              {UI_TEXT.refundShort}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">{UI_TEXT.categorySummary}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{UI_TEXT.categorySummary}</caption>
              <thead>
                <tr className="border-b border-ink/5 bg-mist/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate">
                    {UI_TEXT.categoryHeader}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                    {UI_TEXT.countHeader}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                    {UI_TEXT.grossHeader}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                    {UI_TEXT.refundHeader}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                    {UI_TEXT.netHeader}
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-ink/5 ${isPending ? "opacity-50" : ""}`}>
                {visibleCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate">
                      {UI_TEXT.emptyPayments}
                    </td>
                  </tr>
                ) : null}
                {visibleCategories.map((row) => {
                  const stat = summary[row.key] as MonthlyCategoryStat;
                  return (
                    <tr key={row.key} className="transition hover:bg-mist/20">
                      <td className="px-6 py-3 font-medium text-ink">{row.label}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate">
                        {stat.count.toLocaleString()}\uac74
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink">
                        {stat.gross.toLocaleString()}
                        {UI_TEXT.wonSuffix}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-red-600">
                        {stat.refund > 0
                          ? `-${stat.refund.toLocaleString()}${UI_TEXT.wonSuffix}`
                          : "-"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-forest">
                        {stat.net.toLocaleString()}
                        {UI_TEXT.wonSuffix}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/30">
                  <td className="px-6 py-3 font-semibold text-ink">{UI_TEXT.totalRow}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.totalCount.toLocaleString()}\uac74
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.grossTotal.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-red-600">
                    {summary.refundTotal > 0
                      ? `-${summary.refundTotal.toLocaleString()}${UI_TEXT.wonSuffix}`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-forest">
                    {summary.netTotal.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">{UI_TEXT.methodSummary}</h2>
          <div className="space-y-4">
            {visibleMethods.length === 0 ? (
              <p className="text-sm text-slate">{UI_TEXT.methodEmpty}</p>
            ) : (
              visibleMethods.map((row) => {
                const stat = methods[row.key] as MonthlyMethodStat;
                const ratio = methodTotal > 0 ? (stat.amount / methodTotal) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-slate">{row.label}</span>
                      <span className="tabular-nums text-sm font-semibold text-ink">
                        {formatAmt(stat.amount)}
                        <span className="ml-2 text-xs font-normal text-slate">
                          ({stat.count}\uac74)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
                      <div
                        className={`h-full rounded-full ${row.color}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            <div className="space-y-2 border-t border-ink/10 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{UI_TEXT.grossTotal}</span>
                <span className="tabular-nums text-sm font-semibold text-ink">
                  {formatAmt(summary.grossTotal)}
                </span>
              </div>
              {summary.refundTotal > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600">{UI_TEXT.refundTotal}</span>
                  <span className="tabular-nums text-sm font-semibold text-red-600">
                    -{formatAmt(summary.refundTotal)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-ink/10 pt-2">
                <span className="text-base font-bold text-forest">{UI_TEXT.netTotal}</span>
                <span className="tabular-nums text-base font-bold text-forest">
                  {formatAmt(summary.netTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">{UI_TEXT.dailyTrend}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{UI_TEXT.dailyTrend}</caption>
            <thead>
              <tr className="bg-mist/50">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate">
                  {UI_TEXT.dateHeader}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                  {UI_TEXT.countHeader}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                  {UI_TEXT.grossHeader}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                  {UI_TEXT.refundHeader}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">
                  {UI_TEXT.netHeader}
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${isPending ? "opacity-50" : ""}`}>
              {dailyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate">
                    {UI_TEXT.emptyPayments}
                  </td>
                </tr>
              ) : null}
              {dailyBreakdown.map((entry) => (
                <tr key={entry.date} className="transition hover:bg-mist/20">
                  <td className="whitespace-nowrap px-6 py-3 font-medium text-ink">
                    {formatDayLabel(entry.date)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate">
                    {entry.count.toLocaleString()}\uac74
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-ink">
                    {entry.gross.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-red-600">
                    {entry.refund > 0
                      ? `-${entry.refund.toLocaleString()}${UI_TEXT.wonSuffix}`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-forest">
                    {entry.net.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                </tr>
              ))}
            </tbody>
            {dailyBreakdown.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/30">
                  <td className="px-6 py-3 font-semibold text-ink">{UI_TEXT.totalRow}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.totalCount.toLocaleString()}\uac74
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.grossTotal.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-red-600">
                    {summary.refundTotal > 0
                      ? `-${summary.refundTotal.toLocaleString()}${UI_TEXT.wonSuffix}`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-forest">
                    {summary.netTotal.toLocaleString()}
                    {UI_TEXT.wonSuffix}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
