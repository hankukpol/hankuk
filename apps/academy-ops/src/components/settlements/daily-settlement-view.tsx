"use client";

import { useState, useTransition } from "react";
import { PaymentCategory, PaymentMethod } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_CATEGORY_COLOR,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

type CategoryStat = { count: number; gross: number };
type MethodStat = { count: number; amount: number };

type DailySummary = {
  tuition: CategoryStat;
  facility: CategoryStat;
  textbook: CategoryStat;
  material: CategoryStat;
  singleCourse: CategoryStat;
  penalty: CategoryStat;
  etc: CategoryStat;
  totalCount: number;
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
};

type DailyMethods = {
  cash: MethodStat;
  card: MethodStat;
  transfer: MethodStat;
};

type SettlementRecord = {
  id: string;
  date: string;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
  cashActual: number | null;
  cashDiff: number | null;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
};

type RecentPayment = {
  id: string;
  examNumber: string | null;
  category: PaymentCategory;
  method: PaymentMethod;
  grossAmount: number;
  netAmount: number;
  note: string | null;
  processedAt: string;
  student:
    | {
        name: string;
        examNumber: string;
        phone: string | null;
        courseEnrollments: {
          id: string;
          courseName: string;
          statusLabel: string;
          statusTone: string;
        }[];
      }
    | null;
  processor: { name: string };
  items: { itemName: string; quantity: number }[];
  refunds: { amount: number }[];
};

type DailyEnrollment = {
  id: string;
  enrollNumber: string;
  examNumber: string;
  name: string;
  mobile: string | null;
  courseName: string;
  examCategoryLabel: string;
  paymentAmount: number;
  textbookAmount: number;
  methodLabel: string;
  cashReceiptNo: string | null;
  registeredAt: string;
  registeredBy: string;
  enrollments: {
    id: string;
    courseName: string;
    statusLabel: string;
    statusTone: string;
  }[];
};

type DailyData = {
  date: string;
  summary: DailySummary;
  methods: DailyMethods;
  settlement: SettlementRecord | null;
  recentPayments: RecentPayment[];
  dailyEnrollments: DailyEnrollment[];
};

type Props = {
  initialData: DailyData;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function formatAmt(amount: number): string {
  return amount.toLocaleString() + "원";
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}

const CATEGORY_ROWS: Array<{
  key: keyof DailySummary;
  label: string;
}> = [
  { key: "tuition", label: "수강료" },
  { key: "facility", label: "시설비" },
  { key: "textbook", label: "교재" },
  { key: "material", label: "교구·소모품" },
  { key: "singleCourse", label: "단과 POS" },
  { key: "penalty", label: "위약금" },
  { key: "etc", label: "기타" },
];

export function DailySettlementView({ initialData }: Props) {
  const [data, setData] = useState<DailyData>(initialData);
  const [currentDate, setCurrentDate] = useState(initialData.date);
  const [cashActualInput, setCashActualInput] = useState(
    initialData.settlement?.cashActual != null
      ? String(initialData.settlement.cashActual)
      : "",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  async function fetchDate(date: string) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowReopenForm(false);
    setReopenReason("");
    startTransition(async () => {
      try {
        const result = await requestJson<DailyData>(
          `/api/settlements/daily?date=${date}`,
        );
        setData(result);
        setCurrentDate(date);
        setCashActualInput(
          result.settlement?.cashActual != null
            ? String(result.settlement.cashActual)
            : "",
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "조회 실패");
      }
    });
  }

  const isAlreadyClosed = !!(data.settlement?.closedAt);

  async function handleClose() {
    const parsed = parseInt(cashActualInput.replace(/,/g, ""), 10);
    if (isNaN(parsed) || parsed < 0) {
      setErrorMessage("현금 실제액을 올바르게 입력하세요.");
      return;
    }
    if (isAlreadyClosed && !reopenReason.trim()) {
      setErrorMessage("재오픈 사유를 입력하세요.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        await requestJson("/api/settlements/daily", {
          method: "POST",
          body: JSON.stringify({
            date: currentDate,
            cashActual: parsed,
            ...(isAlreadyClosed ? { reopenReason: reopenReason.trim() } : {}),
          }),
        });
        setSuccessMessage(
          isAlreadyClosed ? "재오픈 후 재마감 처리가 완료되었습니다." : "마감 처리가 완료되었습니다.",
        );
        setShowReopenForm(false);
        setReopenReason("");
        const refreshed = await requestJson<DailyData>(
          `/api/settlements/daily?date=${currentDate}`,
        );
        setData(refreshed);
        setCashActualInput(
          refreshed.settlement?.cashActual != null
            ? String(refreshed.settlement.cashActual)
            : "",
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "마감 처리 실패");
      }
    });
  }

  const today = todayStr();
  const { summary, methods, settlement, recentPayments, dailyEnrollments } = data;

  const visibleRows = CATEGORY_ROWS.filter(
    (row) => (summary[row.key] as CategoryStat).count > 0,
  );

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchDate(addDays(currentDate, -1))}
            disabled={isPending}
            className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            ◀ 전날
          </button>
          <span className="px-3 text-base font-semibold text-ink">
            {formatKoreanDate(currentDate)}
          </span>
          <button
            type="button"
            onClick={() => fetchDate(addDays(currentDate, 1))}
            disabled={isPending || currentDate >= today}
            className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            다음날 ▶
          </button>
          {currentDate !== today && (
            <button
              type="button"
              onClick={() => fetchDate(today)}
              disabled={isPending}
              className="rounded-full bg-forest px-3 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
            >
              오늘
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {settlement?.closedAt ? (
            <span className="rounded-full border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest">
              마감 완료 · {new Date(settlement.closedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              {settlement.closedByName ? ` (${settlement.closedByName})` : ""}
            </span>
          ) : null}
          {isAlreadyClosed ? (
            <button
              type="button"
              onClick={() => {
                setShowReopenForm((prev) => !prev);
                setReopenReason("");
                setErrorMessage(null);
              }}
              disabled={isPending}
              className="rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-medium text-ember transition hover:bg-ember/20 disabled:opacity-50"
            >
              재오픈
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-full bg-ember px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "마감 처리"}
            </button>
          )}
        </div>
      </div>

      {/* Settlement history badge */}
      {settlement?.reopenedAt ? (
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
            재오픈: {new Date(settlement.reopenedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {settlement.reopenedByName ? ` (${settlement.reopenedByName})` : ""}
          </span>
          {settlement.reopenReason ? (
            <span className="text-slate">사유: {settlement.reopenReason}</span>
          ) : null}
        </div>
      ) : null}

      {/* Reopen reason form */}
      {showReopenForm && isAlreadyClosed ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">재오픈 후 재마감 처리</p>
          <p className="text-xs text-amber-700">마감된 일계표를 수정하려면 사유를 입력하고 재마감하세요.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-amber-800">재오픈 사유 *</label>
            <input
              type="text"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="예: 현금 실수령액 오기입 수정"
              className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending || !reopenReason.trim()}
              className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "재마감 처리"}
            </button>
            <button
              type="button"
              onClick={() => { setShowReopenForm(false); setReopenReason(""); setErrorMessage(null); }}
              disabled={isPending}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {/* Messages */}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-2xl border border-forest/30 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">당일 등록자 목록</h2>
          <p className="mt-1 text-xs text-slate">
            학생 4대 데이터와 신규 수강 등록 기준 수납 정보를 함께 확인합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {[
                  "No.",
                  "학생",
                  "수강번호",
                  "직렬",
                  "신규 수강과목",
                  "현재 수강내역",
                  "결제수강료",
                  "교재비",
                  "결제방식",
                  "등록일",
                  "현금영수증",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-medium text-slate whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${isPending ? "opacity-50" : ""}`}>
              {dailyEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate">
                    당일 등록된 수강이 없습니다.
                  </td>
                </tr>
              ) : null}
              {dailyEnrollments.map((enrollment, index) => (
                <tr key={enrollment.id} className="align-top transition hover:bg-mist/20">
                  <td className="px-4 py-3 text-xs text-slate">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="min-w-[180px]">
                      <a
                        href={`/admin/students/${enrollment.examNumber}`}
                        className="font-semibold text-forest hover:underline"
                      >
                        {enrollment.name}
                      </a>
                      <div className="mt-0.5 text-xs text-slate">{enrollment.examNumber}</div>
                      <div className="mt-0.5 text-xs text-slate">
                        {enrollment.mobile ?? "연락처 미등록"}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-ink whitespace-nowrap">
                    {enrollment.enrollNumber}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {enrollment.examCategoryLabel}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/enrollments/${enrollment.id}`}
                      className="font-medium text-ink hover:text-forest hover:underline"
                    >
                      {enrollment.courseName}
                    </a>
                    <div className="mt-1 text-xs text-slate">등록 직원: {enrollment.registeredBy}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[220px] flex-wrap gap-2">
                      {enrollment.enrollments.length > 0 ? (
                        enrollment.enrollments.map((item) => (
                          <a
                            key={item.id}
                            href={`/admin/enrollments/${item.id}`}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:border-ink/30 ${item.statusTone}`}
                          >
                            {item.courseName} · {item.statusLabel}
                          </a>
                        ))
                      ) : (
                        <span className="text-xs text-slate">표시할 수강내역이 없습니다.</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-ink whitespace-nowrap">
                    {formatAmt(enrollment.paymentAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-ink whitespace-nowrap">
                    {enrollment.textbookAmount > 0 ? formatAmt(enrollment.textbookAmount) : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {enrollment.methodLabel}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {formatDateTime(enrollment.registeredAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {enrollment.cashReceiptNo ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category Summary */}
        <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">수납 집계</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 bg-mist/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate">유형</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">건수</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-sm text-slate">
                      수납 내역이 없습니다.
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map((row) => {
                  const stat = summary[row.key] as CategoryStat;
                  return (
                    <tr key={row.key} className="hover:bg-mist/20 transition">
                      <td className="px-6 py-3 font-medium text-ink">{row.label}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate">
                        {stat.count.toLocaleString()}건
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-ink">
                        {formatAmt(stat.gross)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/30">
                  <td className="px-6 py-3 font-semibold text-ink">수납 소계</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.totalCount.toLocaleString()}건
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {formatAmt(summary.grossTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Method + Net Summary */}
        <div className="space-y-4">
          {/* Method Breakdown */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-3">
            <h2 className="text-sm font-semibold text-ink">결제 수단별</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate">현금</span>
                <span className="tabular-nums text-sm font-medium text-ink">
                  {formatAmt(methods.cash.amount)}
                  <span className="ml-2 text-xs text-slate">({methods.cash.count}건)</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate">카드</span>
                <span className="tabular-nums text-sm font-medium text-ink">
                  {formatAmt(methods.card.amount)}
                  <span className="ml-2 text-xs text-slate">({methods.card.count}건)</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate">계좌이체</span>
                <span className="tabular-nums text-sm font-medium text-ink">
                  {formatAmt(methods.transfer.amount)}
                  <span className="ml-2 text-xs text-slate">({methods.transfer.count}건)</span>
                </span>
              </div>
              <div className="border-t border-ink/10 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">수납 합계</span>
                  <span className="tabular-nums text-sm font-semibold text-ink">
                    {formatAmt(summary.grossTotal)}
                  </span>
                </div>
                {summary.refundTotal > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600">환불 합계</span>
                    <span className="tabular-nums text-sm font-medium text-red-600">
                      -{formatAmt(summary.refundTotal)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-ink/10 pt-2 mt-2">
                  <span className="text-base font-bold text-forest">실수입</span>
                  <span className="tabular-nums text-base font-bold text-forest">
                    {formatAmt(summary.netTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cash Verification */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="mb-3 text-sm font-semibold text-ink">현금 시재 확인</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate">시스템 현금</span>
                <span className="tabular-nums font-medium text-ink">
                  {formatAmt(methods.cash.amount)}
                </span>
              </div>
              {settlement?.cashActual != null ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate">실제 현금</span>
                    <span className="tabular-nums font-medium text-ink">
                      {formatAmt(settlement.cashActual)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-ink/10 pt-2">
                    <span className="text-slate">차이</span>
                    <span
                      className={`tabular-nums font-semibold ${
                        (settlement.cashDiff ?? 0) === 0
                          ? "text-forest"
                          : "text-red-600"
                      }`}
                    >
                      {(settlement.cashDiff ?? 0) >= 0 ? "+" : ""}
                      {formatAmt(settlement.cashDiff ?? 0)}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  value={cashActualInput}
                  onChange={(e) => setCashActualInput(e.target.value)}
                  placeholder="실제 금액 입력"
                  className="flex-1 rounded-2xl border border-ink/10 px-4 py-2 text-sm outline-none focus:border-ember/50 tabular-nums"
                  min={0}
                />
                <span className="text-sm text-slate">원</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">
            최근 수납 내역 (최대 20건)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {["시간", "학생", "유형", "수단", "내역", "금액", "처리자"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-slate whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-slate whitespace-nowrap">
                  실납부
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${isPending ? "opacity-50" : ""}`}>
              {recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate">
                    수납 내역이 없습니다.
                  </td>
                </tr>
              ) : null}
              {recentPayments.map((payment) => {
                const itemLabel =
                  payment.items.length === 0
                    ? "-"
                    : payment.items.length === 1
                      ? payment.items[0].quantity > 1
                        ? `${payment.items[0].itemName} ×${payment.items[0].quantity}`
                        : payment.items[0].itemName
                      : `${payment.items[0].itemName} 외 ${payment.items.length - 1}건`;

                return (
                  <tr key={payment.id} className="hover:bg-mist/20 transition">
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {new Date(payment.processedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {payment.student ? (
                        <div>
                          <a
                            href={`/admin/students/${payment.student.examNumber}`}
                            className="font-medium text-forest hover:underline"
                          >
                            {payment.student.name}
                          </a>
                          <div className="mt-0.5 text-xs text-slate">{payment.student.examNumber}</div>
                          <div className="mt-0.5 text-xs text-slate">
                            {payment.student.phone ?? "연락처 미등록"}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {payment.student.courseEnrollments.length > 0 ? (
                              payment.student.courseEnrollments.map((enrollment) => (
                                <a
                                  key={enrollment.id}
                                  href={`/admin/enrollments/${enrollment.id}`}
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:border-ink/30 ${enrollment.statusTone}`}
                                >
                                  {enrollment.courseName} · {enrollment.statusLabel}
                                </a>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate">표시할 수강내역이 없습니다.</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate">비회원</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                      >
                        {PAYMENT_CATEGORY_LABEL[payment.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                          payment.method === "CASH"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : payment.method === "TRANSFER"
                              ? "border-sky-200 bg-sky-50 text-sky-800"
                              : payment.method === "CARD"
                                ? "border-purple-200 bg-purple-50 text-purple-800"
                                : "border-ink/20 bg-ink/5 text-slate"
                        }`}
                      >
                        {PAYMENT_METHOD_LABEL[payment.method]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate max-w-[140px] truncate">
                      {itemLabel}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-ink whitespace-nowrap">
                      {payment.grossAmount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-sm text-slate whitespace-nowrap">
                      {payment.processor.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-forest whitespace-nowrap">
                      {payment.netAmount.toLocaleString()}원
                      {payment.refunds.length > 0 ? (
                        <div className="mt-0.5 text-xs font-normal text-red-600">
                          -{payment.refunds.reduce((s, r) => s + r.amount, 0).toLocaleString()}원 환불
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
