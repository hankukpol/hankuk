"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, Printer } from "lucide-react";
import { toast } from "sonner";

import { getKstToday } from "@/components/payments/payment-client-helpers";
import { formatCurrency, formatPaymentMethod } from "@/lib/payment-meta";
import type { PaymentItem, SettlementSummary } from "@/lib/services/payment.service";

type SettlementViewProps = {
  divisionSlug: string;
};

type RangeMode = "daily" | "weekly" | "monthly" | "custom";

function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getMonthRange(date: string) {
  const [year, month] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

function formatSignedAmount(payment: PaymentItem) {
  return `${payment.amount < 0 ? "-" : ""}${formatCurrency(Math.abs(payment.amount))}원`;
}

export function SettlementView({ divisionSlug }: SettlementViewProps) {
  const today = getKstToday();
  const [rangeMode, setRangeMode] = useState<RangeMode>("daily");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (rangeMode === "daily") {
      setDateFrom(today);
      setDateTo(today);
      return;
    }

    if (rangeMode === "weekly") {
      setDateFrom(addDays(today, -6));
      setDateTo(today);
      return;
    }

    if (rangeMode === "monthly") {
      const monthRange = getMonthRange(today);
      setDateFrom(monthRange.dateFrom);
      setDateTo(monthRange.dateTo);
    }
  }, [rangeMode, today]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSummary() {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/${divisionSlug}/payments/settlement?dateFrom=${dateFrom}&dateTo=${dateTo}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "정산 정보를 불러오지 못했습니다.");
        }

        setSummary(data.summary as SettlementSummary);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSummary(null);
        toast.error(error instanceof Error ? error.message : "정산 정보를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchSummary();

    return () => controller.abort();
  }, [dateFrom, dateTo, divisionSlug]);

  const rangeLabel = useMemo(() => {
    if (!summary) {
      return `${dateFrom} ~ ${dateTo}`;
    }

    return summary.dateFrom === summary.dateTo
      ? formatDate(summary.dateFrom)
      : `${formatDate(summary.dateFrom)} ~ ${formatDate(summary.dateTo)}`;
  }, [dateFrom, dateTo, summary]);

  return (
    <section className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-bold text-slate-950">일일 정산</p>
          <p className="mt-2 text-sm text-slate-600">
            결제수단과 수납 유형별 정산 금액을 한 화면에서 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              window.open(
                `/api/${divisionSlug}/export/payments?dateFrom=${dateFrom}&dateTo=${dateTo}`,
                "_blank",
              )
            }
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            인쇄
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[auto_auto_1fr]">
        <div className="flex flex-wrap gap-2">
          {([
            ["daily", "오늘"],
            ["weekly", "최근 7일"],
            ["monthly", "이번 달"],
            ["custom", "직접 선택"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRangeMode(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                rangeMode === value
                  ? "bg-[var(--division-color)] text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setRangeMode("custom");
              setDateFrom(event.target.value);
            }}
            className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setRangeMode("custom");
              setDateTo(event.target.value);
            }}
            className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
          />
        </div>

        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          조회 기간: <span className="font-semibold text-slate-900">{rangeLabel}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-12 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          정산 정보를 불러오는 중입니다.
        </div>
      ) : summary ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[10px] border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">총 거래 건수</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{summary.totalCount}건</p>
            </article>
            <article className="rounded-[10px] border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">정산 합계</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {summary.totalAmount < 0 ? "-" : ""}
                {formatCurrency(Math.abs(summary.totalAmount))}원
              </p>
            </article>
            <article className="rounded-[10px] border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">결제수단 수</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{summary.byMethod.length}개</p>
            </article>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[10px] border border-slate-200 bg-white p-4">
              <p className="text-lg font-bold text-slate-950">결제수단별 집계</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-3 font-medium">결제수단</th>
                      <th className="px-3 py-3 font-medium">건수</th>
                      <th className="px-3 py-3 font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.byMethod.map((item) => (
                      <tr key={item.method}>
                        <td className="px-3 py-3 font-medium text-slate-900">{item.methodLabel}</td>
                        <td className="px-3 py-3 text-slate-600">{item.count}건</td>
                        <td className="px-3 py-3 text-slate-900">
                          {item.amount < 0 ? "-" : ""}
                          {formatCurrency(Math.abs(item.amount))}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200 bg-white p-4">
              <p className="text-lg font-bold text-slate-950">수납 유형별 집계</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-3 font-medium">수납 유형</th>
                      <th className="px-3 py-3 font-medium">건수</th>
                      <th className="px-3 py-3 font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.byCategory.map((item) => (
                      <tr key={item.categoryId}>
                        <td className="px-3 py-3 font-medium text-slate-900">{item.categoryName}</td>
                        <td className="px-3 py-3 text-slate-600">{item.count}건</td>
                        <td className="px-3 py-3 text-slate-900">
                          {item.amount < 0 ? "-" : ""}
                          {formatCurrency(Math.abs(item.amount))}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="rounded-[10px] border border-slate-200 bg-white p-4">
            <p className="text-lg font-bold text-slate-950">상세 내역</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-3 font-medium">납부일</th>
                    <th className="px-3 py-3 font-medium">학생</th>
                    <th className="px-3 py-3 font-medium">수납 유형</th>
                    <th className="px-3 py-3 font-medium">결제수단</th>
                    <th className="px-3 py-3 font-medium">금액</th>
                    <th className="px-3 py-3 font-medium">기록자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-3 py-3 text-slate-600">{formatDate(payment.paymentDate)}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{payment.studentName}</p>
                        <p className="mt-1 text-xs text-slate-500">{payment.studentNumber}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{payment.paymentTypeName}</td>
                      <td className="px-3 py-3 text-slate-600">{formatPaymentMethod(payment.method)}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">{formatSignedAmount(payment)}</td>
                      <td className="px-3 py-3 text-slate-600">{payment.recordedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-8 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
          조회된 정산 데이터가 없습니다.
        </div>
      )}
    </section>
  );
}
