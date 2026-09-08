"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, Printer } from "lucide-react";
import { toast } from "@/lib/sonner";

import { getKstToday } from "@/components/payments/payment-client-helpers";
import { formatCurrency, formatPaymentMethod } from "@/lib/payment-meta";
import type { PaymentItem, SettlementSummary } from "@/lib/services/payment.service";

type SettlementViewProps = {
  divisionSlug: string;
  isActive?: boolean;
  refreshKey?: readonly PaymentItem[];
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

export function SettlementView({ divisionSlug, isActive = true, refreshKey }: SettlementViewProps) {
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
    if (!isActive) return;
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
  }, [dateFrom, dateTo, divisionSlug, isActive, refreshKey]);

  const rangeLabel = useMemo(() => {
    if (!summary) {
      return `${dateFrom} ~ ${dateTo}`;
    }

    return summary.dateFrom === summary.dateTo
      ? formatDate(summary.dateFrom)
      : `${formatDate(summary.dateFrom)} ~ ${formatDate(summary.dateTo)}`;
  }, [dateFrom, dateTo, summary]);

  return (
    <section className="admin-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="admin-section-title">일일 정산</h2>
          <p className="admin-help mt-2">
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
            className="admin-button"
          >
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="admin-button"
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
              className="admin-choice-button" data-active={rangeMode === value} aria-pressed={rangeMode === value}
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
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setRangeMode("custom");
              setDateTo(event.target.value);
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
          />
        </div>

        <div className="admin-notice">
          조회 기간: <span className="font-semibold text-slate-900">{rangeLabel}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-12 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          정산 정보를 불러오는 중입니다.
        </div>
      ) : summary ? (
        <div className="mt-6 space-y-6">
          <div className="admin-metric-strip">
            <article className="admin-metric-box">
              <p className="admin-metric-box-label">총 거래 건수</p>
              <p className="admin-metric-box-value">{summary.totalCount}건</p>
            </article>
            <article className="admin-metric-box">
              <p className="admin-metric-box-label">정산 합계</p>
              <p className="admin-metric-box-value">
                {summary.totalAmount < 0 ? "-" : ""}
                {formatCurrency(Math.abs(summary.totalAmount))}원
              </p>
            </article>
            <article className="admin-metric-box">
              <p className="admin-metric-box-label">결제수단 수</p>
              <p className="admin-metric-box-value">{summary.byMethod.length}개</p>
            </article>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="admin-section">
              <h2 className="admin-section-title">결제수단별 집계</h2>
              <div className="admin-table-frame mt-4 overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th>결제수단</th>
                      <th>건수</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byMethod.map((item) => (
                      <tr key={item.method}>
                        <td>{item.methodLabel}</td>
                        <td>{item.count}건</td>
                        <td>
                          {item.amount < 0 ? "-" : ""}
                          {formatCurrency(Math.abs(item.amount))}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section-title">수납 유형별 집계</h2>
              <div className="admin-table-frame mt-4 overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th>수납 유형</th>
                      <th>건수</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byCategory.map((item) => (
                      <tr key={item.categoryId}>
                        <td>{item.categoryName}</td>
                        <td>{item.count}건</td>
                        <td>
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

          <section className="admin-section">
            <h2 className="admin-section-title">상세 내역</h2>
            <div className="admin-table-frame mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>납부일</th>
                    <th>학생</th>
                    <th>수납 유형</th>
                    <th>결제수단</th>
                    <th>금액</th>
                    <th>기록자</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td>
                        <p className="font-medium text-slate-900">{payment.studentName}</p>
                        <p className="admin-help mt-1">{payment.studentNumber}</p>
                      </td>
                      <td>{payment.paymentTypeName}</td>
                      <td>{formatPaymentMethod(payment.method)}</td>
                      <td>{formatSignedAmount(payment)}</td>
                      <td>{payment.recordedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
          조회된 정산 데이터가 없습니다.
        </div>
      )}
    </section>
  );
}
