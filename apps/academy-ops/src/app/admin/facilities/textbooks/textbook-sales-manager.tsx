"use client";

import { useState, useTransition, useCallback } from "react";
import { type TextbookRow, type SaleRow } from "./page";
import { ActionModal } from "@/components/ui/action-modal";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

function todayString(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

type SellFormState = {
  textbookId: number | null;
  quantity: string;
  examNumber: string;
  note: string;
};

type Props = {
  textbooks: TextbookRow[];
  initialTodaySales: SaleRow[];
};

export function TextbookSalesManager({ textbooks, initialTodaySales }: Props) {
  const today = todayString();

  const [sales, setSales] = useState<SaleRow[]>(initialTodaySales);
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [isRangeSearch, setIsRangeSearch] = useState(false); // false = showing initial today data

  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [form, setForm] = useState<SellFormState>({
    textbookId: null,
    quantity: "1",
    examNumber: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTextbook = textbooks.find((t) => t.id === form.textbookId);

  const fetchSales = useCallback(async (from: string, to: string) => {
    setIsLoadingRange(true);
    setRangeError(null);
    try {
      const result = await requestJson<{ sales: Array<{
        id: number;
        textbook: { id: number; title: string; subject: string | null };
        examNumber: string | null;
        staff: { name: string };
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        note: string | null;
        soldAt: string;
        textbookId: number;
      }> }>(`/api/textbooks/sales?dateFrom=${from}&dateTo=${to}&limit=1000`);

      const mapped: SaleRow[] = result.sales.map((s) => ({
        id: s.id,
        textbookId: s.textbook.id,
        textbookTitle: s.textbook.title,
        examNumber: s.examNumber,
        staffName: s.staff.name,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        totalPrice: s.totalPrice,
        note: s.note,
        soldAt: s.soldAt,
      }));

      setSales(mapped);
      setIsRangeSearch(true);
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setIsLoadingRange(false);
    }
  }, []);

  function handleSearch() {
    if (!dateFrom || !dateTo) {
      setRangeError("시작일과 종료일을 모두 입력하세요.");
      return;
    }
    if (dateFrom > dateTo) {
      setRangeError("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    fetchSales(dateFrom, dateTo);
  }

  function handleResetToToday() {
    setDateFrom(today);
    setDateTo(today);
    setRangeError(null);
    setSales(initialTodaySales);
    setIsRangeSearch(false);
  }

  function openSellModal(textbookId?: number) {
    setForm({
      textbookId: textbookId ?? null,
      quantity: "1",
      examNumber: "",
      note: "",
    });
    setError(null);
    setSellModalOpen(true);
  }

  function handleClose() {
    if (!isPending) {
      setSellModalOpen(false);
      setError(null);
    }
  }

  function handleConfirm() {
    if (!form.textbookId) {
      setError("교재를 선택하세요.");
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty < 1) {
      setError("수량은 1개 이상이어야 합니다.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await requestJson<{
          sale: {
            id: number;
            textbookId: number;
            textbook: { title: string };
            examNumber: string | null;
            staff: { name: string };
            quantity: number;
            unitPrice: number;
            totalPrice: number;
            note: string | null;
            soldAt: string;
          };
          remainingStock: number;
        }>(`/api/textbooks/${form.textbookId}/sell`, {
          method: "POST",
          body: JSON.stringify({
            quantity: qty,
            examNumber: form.examNumber.trim() || null,
            note: form.note.trim() || null,
          }),
        });

        const newSale: SaleRow = {
          id: result.sale.id,
          textbookId: result.sale.textbookId,
          textbookTitle: result.sale.textbook.title,
          examNumber: result.sale.examNumber,
          staffName: result.sale.staff.name,
          quantity: result.sale.quantity,
          unitPrice: result.sale.unitPrice,
          totalPrice: result.sale.totalPrice,
          note: result.sale.note,
          soldAt: result.sale.soldAt,
        };

        // 새 판매건 추가 (현재 조회 범위가 오늘이거나 오늘 날짜를 포함하면 목록 상단에 추가)
        const saleDate = newSale.soldAt.slice(0, 10);
        if (saleDate >= dateFrom && saleDate <= dateTo) {
          setSales((prev) => [newSale, ...prev]);
        }
        setSellModalOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "판매 등록 실패");
      }
    });
  }

  const totalRevenue = sales.reduce((sum, s) => sum + s.totalPrice, 0);
  const totalQuantity = sales.reduce((sum, s) => sum + s.quantity, 0);

  const inputCls =
    "w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30 transition";
  const labelCls = "mb-1 block text-xs font-medium text-slate";

  const isToday = dateFrom === today && dateTo === today;
  const rangeLabel = isToday
    ? "오늘"
    : dateFrom === dateTo
    ? dateFrom
    : `${dateFrom} ~ ${dateTo}`;

  return (
    <div className="space-y-8">
      {/* Date range filter */}
      <div className="rounded-[20px] border border-ink/10 bg-white overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-ink/10">
          <div>
            <label className="text-xs font-medium text-slate mb-1 block">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="block rounded-lg border border-ink/20 px-3 py-1.5 text-sm outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate mb-1 block">종료일</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block rounded-lg border border-ink/20 px-3 py-1.5 text-sm outline-none focus:border-ink/40 transition"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              disabled={isLoadingRange}
              className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-white transition hover:bg-forest/90 disabled:opacity-60"
            >
              {isLoadingRange ? "조회 중..." : "조회"}
            </button>
            <button
              onClick={handleResetToToday}
              disabled={isLoadingRange}
              className="rounded-full border border-ink/20 px-5 py-2 text-sm font-medium text-slate transition hover:bg-mist/50 disabled:opacity-60"
            >
              오늘
            </button>
          </div>
          {/* Export button */}
          <div className="ml-auto">
            <a
              href={`/api/textbooks/sales/export?dateFrom=${dateFrom}&dateTo=${dateTo}`}
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition hover:bg-mist/50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Excel 내보내기
            </a>
          </div>
        </div>

        {rangeError && (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">
            {rangeError}
          </div>
        )}

        {/* Summary stats */}
        <div className="flex flex-wrap gap-6 px-4 py-2.5 text-sm text-slate bg-mist/30">
          <span>
            기간:{" "}
            <strong className="text-ink">{rangeLabel}</strong>
          </span>
          <span>
            판매건:{" "}
            <strong className="text-ink">{sales.length}건</strong>
          </span>
          <span>
            판매수량:{" "}
            <strong className="text-ink">{totalQuantity}권</strong>
          </span>
          <span>
            합계:{" "}
            <strong className="text-forest">{totalRevenue.toLocaleString()}원</strong>
          </span>
        </div>
      </div>

      {/* Textbook list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">교재 목록</h2>
          <button
            onClick={() => openSellModal()}
            className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
          >
            + 판매 등록
          </button>
        </div>
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 bg-mist/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">교재명</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">과목</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">판매가</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">재고</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate">판매</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {textbooks.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate">
                    등록된 교재가 없습니다
                  </td>
                </tr>
              )}
              {textbooks.map((t) => (
                <tr key={t.id} className="hover:bg-mist/30 transition">
                  <td className="px-5 py-3.5 font-medium">
                    {t.title}
                    {t.author && (
                      <span className="ml-2 text-xs text-slate">{t.author}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate hidden sm:table-cell">
                    {t.subject ? (SUBJECT_LABELS[t.subject] ?? t.subject) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {t.price.toLocaleString()}원
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    <span
                      className={
                        t.stock === 0
                          ? "font-semibold text-red-600"
                          : t.stock <= 5
                          ? "font-semibold text-amber-600"
                          : "text-ink"
                      }
                    >
                      {t.stock}개
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      disabled={t.stock === 0}
                      onClick={() => openSellModal(t.id)}
                      className="rounded-full border border-forest/30 px-4 py-1.5 text-xs font-medium text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      판매
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales history */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          판매 내역{" "}
          <span className="text-sm font-normal text-slate">({rangeLabel})</span>
        </h2>
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 bg-mist/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">
                  {isToday && !isRangeSearch ? "시각" : "판매일시"}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">교재명</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">수험번호</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">수량</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">금액</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden md:table-cell">처리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {isLoadingRange && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate">
                    조회 중...
                  </td>
                </tr>
              )}
              {!isLoadingRange && sales.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate">
                    해당 기간 판매 내역이 없습니다
                  </td>
                </tr>
              )}
              {!isLoadingRange && sales.map((s) => {
                const dt = new Date(s.soldAt);
                const showDate = !isToday || isRangeSearch;
                const timeLabel = showDate
                  ? dt.toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    }) +
                    " " +
                    dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                  : dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3.5 text-slate tabular-nums">{timeLabel}</td>
                    <td className="px-5 py-3.5 font-medium">{s.textbookTitle}</td>
                    <td className="px-5 py-3.5 text-slate hidden sm:table-cell">
                      {s.examNumber ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{s.quantity}권</td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-medium">
                      {s.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-slate hidden md:table-cell">{s.staffName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sell Modal */}
      <ActionModal
        open={sellModalOpen}
        badgeLabel="교재 판매"
        badgeTone="success"
        title="교재 판매 등록"
        description="현장 교재 판매를 등록합니다. 재고가 자동으로 차감됩니다."
        cancelLabel="취소"
        confirmLabel={isPending ? "등록 중..." : "판매 등록"}
        confirmTone="default"
        isPending={isPending}
        onClose={handleClose}
        onConfirm={handleConfirm}
        panelClassName="max-w-md"
      >
        <div className="space-y-4">
          {/* Textbook select */}
          <div>
            <label className={labelCls}>교재 선택</label>
            <select
              value={form.textbookId ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, textbookId: e.target.value ? Number(e.target.value) : null }))
              }
              className={inputCls}
            >
              <option value="">교재를 선택하세요</option>
              {textbooks.map((t) => (
                <option key={t.id} value={t.id} disabled={t.stock === 0}>
                  {t.title}
                  {t.subject ? ` (${SUBJECT_LABELS[t.subject] ?? t.subject})` : ""}
                  {" — "}
                  {t.price.toLocaleString()}원 / 재고 {t.stock}개
                  {t.stock === 0 ? " [품절]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Selected textbook info */}
          {selectedTextbook && (
            <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate">단가</span>
                <span className="font-medium">{selectedTextbook.price.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate">현재 재고</span>
                <span
                  className={
                    selectedTextbook.stock === 0
                      ? "font-medium text-red-600"
                      : selectedTextbook.stock <= 5
                      ? "font-medium text-amber-600"
                      : "font-medium"
                  }
                >
                  {selectedTextbook.stock}개
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate">예상 합계</span>
                <span className="font-semibold text-forest">
                  {(selectedTextbook.price * (Number(form.quantity) || 0)).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className={labelCls}>수량</label>
            <input
              type="number"
              min={1}
              max={selectedTextbook?.stock ?? 99}
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Exam number (optional) */}
          <div>
            <label className={labelCls}>수험번호 (선택)</label>
            <input
              type="text"
              value={form.examNumber}
              onChange={(e) => setForm((p) => ({ ...p, examNumber: e.target.value }))}
              placeholder="학생 수험번호 (외부 구매자는 비워도 됩니다)"
              className={inputCls}
            />
          </div>

          {/* Note */}
          <div>
            <label className={labelCls}>메모 (선택)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="특이사항 메모"
              className={inputCls}
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </ActionModal>
    </div>
  );
}
