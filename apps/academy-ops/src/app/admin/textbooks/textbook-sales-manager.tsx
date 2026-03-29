"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/ui/action-modal";
import { type TextbookWithStats, type RecentSaleRow } from "./page";

export const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

type SellItem = {
  textbookId: number;
  quantity: string;
};

type SellFormState = {
  examNumber: string;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "POINT";
  note: string;
  items: SellItem[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

const PAYMENT_NOTE_PATTERN = /결제:\s*(현금|카드|계좌이체|포인트)/;

function extractPaymentMethod(note: string | null): string {
  if (!note) return "현금";
  const match = note.match(PAYMENT_NOTE_PATTERN);
  return match ? match[1] : "현금";
}

type Props = {
  textbooks: TextbookWithStats[];
  yearLabel: string;
  recentSales: RecentSaleRow[];
};

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE" | "LOW_STOCK";

const PAYMENT_METHOD_LABELS = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
};

export function TextbookSalesManagerFull({ textbooks, yearLabel, recentSales }: Props) {
  const [localTextbooks, setLocalTextbooks] = useState<TextbookWithStats[]>(textbooks);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [sellModalOpen, setSellModalOpen] = useState<boolean>(false);
  const [stockModalOpen, setStockModalOpen] = useState<boolean>(false);
  const [stockTarget, setStockTarget] = useState<TextbookWithStats | null>(null);
  const [stockAdjustValue, setStockAdjustValue] = useState<string>("");
  const [stockReason, setStockReason] = useState<string>("");
  const [stockModalError, setStockModalError] = useState<string | null>(null);
  const [form, setForm] = useState<SellFormState>({
    examNumber: "",
    paymentMethod: "CASH",
    note: "",
    items: [{ textbookId: 0, quantity: "1" }],
  });
  const [sellError, setSellError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState<string>("");

  const activeTextbooks = localTextbooks.filter((t) => t.isActive);

  const filteredTextbooks = localTextbooks.filter((t) => {
    const matchesSearch =
      searchQuery === "" ||
      t.title.includes(searchQuery) ||
      (t.author ?? "").includes(searchQuery) ||
      (t.publisher ?? "").includes(searchQuery);
    if (!matchesSearch) return false;
    if (activeFilter === "ACTIVE") return t.isActive;
    if (activeFilter === "INACTIVE") return !t.isActive;
    if (activeFilter === "LOW_STOCK") return t.stock <= 5 && t.isActive;
    return true;
  });

  function openSellModal() {
    setForm({
      examNumber: "",
      paymentMethod: "CASH",
      note: "",
      items: [{ textbookId: activeTextbooks[0]?.id ?? 0, quantity: "1" }],
    });
    setSellError(null);
    setSellModalOpen(true);
  }

  function openStockModal(t: TextbookWithStats) {
    setStockTarget(t);
    setStockAdjustValue("");
    setStockReason("");
    setStockModalError(null);
    setStockModalOpen(true);
  }

  function addSellItem() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { textbookId: activeTextbooks[0]?.id ?? 0, quantity: "1" }],
    }));
  }

  function removeSellItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  function updateSellItem(index: number, field: keyof SellItem, value: string) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: field === "textbookId" ? Number(value) : value } : item,
      ),
    }));
  }

  function handleSell() {
    if (form.items.length === 0) {
      setSellError("교재를 선택하세요.");
      return;
    }
    for (const item of form.items) {
      if (!item.textbookId) {
        setSellError("교재를 선택하세요.");
        return;
      }
      const qty = Number(item.quantity);
      if (!qty || qty < 1) {
        setSellError("수량은 1개 이상이어야 합니다.");
        return;
      }
      const tb = localTextbooks.find((t) => t.id === item.textbookId);
      if (tb && tb.stock < qty) {
        setSellError(`"${tb.title}" 재고 부족 (현재: ${tb.stock}개)`);
        return;
      }
    }
    setSellError(null);
    startTransition(async () => {
      try {
        const results: Array<{ remainingStock: number; textbookId: number }> = [];
        for (const item of form.items) {
          const result = await requestJson<{
            sale: { id: number; textbookId: number };
            remainingStock: number;
          }>(`/api/textbooks/${item.textbookId}/sell`, {
            method: "POST",
            body: JSON.stringify({
              quantity: Number(item.quantity),
              examNumber: form.examNumber.trim() || null,
              note:
                [form.note.trim(), form.paymentMethod !== "CASH" ? `결제: ${PAYMENT_METHOD_LABELS[form.paymentMethod]}` : ""]
                  .filter(Boolean)
                  .join(" | ") || null,
            }),
          });
          results.push({ remainingStock: result.remainingStock, textbookId: item.textbookId });
        }

        // Update local stock
        setLocalTextbooks((prev) =>
          prev.map((t) => {
            const r = results.find((res) => res.textbookId === t.id);
            if (r) {
              const soldQty = form.items.find((i) => i.textbookId === t.id);
              const qty = soldQty ? Number(soldQty.quantity) : 0;
              return {
                ...t,
                stock: r.remainingStock,
                monthSaleCount: t.monthSaleCount + 1,
                monthSaleQty: t.monthSaleQty + qty,
                monthSaleAmount: t.monthSaleAmount + (t.price * qty),
                totalSaleQty: t.totalSaleQty + qty,
                totalSaleAmount: t.totalSaleAmount + (t.price * qty),
              };
            }
            return t;
          }),
        );

        setSellModalOpen(false);
        setSuccessMsg(`판매 등록 완료 (${form.items.length}종 교재)`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (e) {
        setSellError(e instanceof Error ? e.message : "판매 등록 실패");
      }
    });
  }

  function handleStockAdjust() {
    if (!stockTarget) return;
    const adjustNum = Number(stockAdjustValue);
    if (stockAdjustValue === "" || isNaN(adjustNum) || adjustNum === 0) {
      setStockModalError("0이 아닌 정수를 입력하세요. 양수는 입고, 음수는 차감입니다.");
      return;
    }
    setStockModalError(null);
    startTransition(async () => {
      try {
        const result = await requestJson<{ textbook: { id: number; stock: number } }>(
          `/api/textbooks/${stockTarget.id}/stock`,
          {
            method: "PATCH",
            body: JSON.stringify({ quantity: adjustNum, reason: stockReason.trim() || null }),
          },
        );
        setLocalTextbooks((prev) =>
          prev.map((t) =>
            t.id === stockTarget.id ? { ...t, stock: result.textbook.stock } : t,
          ),
        );
        setStockModalOpen(false);
        setSuccessMsg(
          `재고 조정 완료: "${stockTarget.title}" (${adjustNum > 0 ? "+" : ""}${adjustNum}개 → ${result.textbook.stock}개)`,
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (e) {
        setStockModalError(e instanceof Error ? e.message : "재고 조정 실패");
      }
    });
  }

  const filterOptions: Array<{ value: ActiveFilter; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: "ACTIVE", label: "판매 중" },
    { value: "INACTIVE", label: "판매 중단" },
    { value: "LOW_STOCK", label: "재고 부족" },
  ];

  const selectedItems = form.items.map((item) => {
    const tb = localTextbooks.find((t) => t.id === item.textbookId);
    return { tb, qty: Number(item.quantity) || 0 };
  });
  const totalAmount = selectedItems.reduce(
    (sum, { tb, qty }) => sum + (tb?.price ?? 0) * qty,
    0,
  );

  const inputCls =
    "w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30 transition";
  const labelCls = "mb-1.5 block text-xs font-medium text-slate";

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filterOptions.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeFilter === f.value
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {f.label}
              {f.value === "LOW_STOCK" && localTextbooks.filter((t) => t.stock <= 5 && t.isActive).length > 0 && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                  {localTextbooks.filter((t) => t.stock <= 5 && t.isActive).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="교재명·저자 검색"
            className="rounded-full border border-ink/10 bg-white px-4 py-1.5 text-sm outline-none focus:border-ink/30 w-48"
          />
          <button
            type="button"
            onClick={openSellModal}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            <span>+</span>
            <span>판매 등록</span>
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/8 text-sm">
          <thead>
            <tr className="bg-mist/50">
              {[
                "교재명",
                "과목",
                "판매가",
                "재고",
                `${yearLabel} 판매`,
                `${yearLabel} 매출`,
                "총 판매",
                "상태",
                "액션",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {filteredTextbooks.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate">
                  조건에 맞는 교재가 없습니다.
                </td>
              </tr>
            ) : null}
            {filteredTextbooks.map((t) => (
              <tr key={t.id} className="transition hover:bg-mist/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/textbooks/${t.id}`}
                    className="font-medium text-ink hover:text-ember hover:underline"
                  >
                    {t.title}
                  </Link>
                  {t.author && (
                    <div className="text-xs text-slate">{t.author}{t.publisher ? ` / ${t.publisher}` : ""}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate">
                  {t.subject ? (SUBJECT_LABELS[t.subject] ?? t.subject) : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  {t.price.toLocaleString()}원
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {t.stock === 0 ? (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      품절
                    </span>
                  ) : t.stock <= 5 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {t.stock}개
                    </span>
                  ) : (
                    <span className="text-ink">{t.stock}개</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate">
                  {t.monthSaleCount > 0 ? (
                    <span>{t.monthSaleQty}권 ({t.monthSaleCount}건)</span>
                  ) : (
                    <span className="text-ink/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate">
                  {t.monthSaleAmount > 0 ? (
                    <span className="font-medium text-ember">{t.monthSaleAmount.toLocaleString()}원</span>
                  ) : (
                    <span className="text-ink/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate">
                  {t.totalSaleQty > 0 ? `${t.totalSaleQty}권` : <span className="text-ink/30">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.isActive
                        ? "bg-forest/10 text-forest"
                        : "bg-ink/5 text-slate"
                    }`}
                  >
                    {t.isActive ? "판매 중" : "중단"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openStockModal(t)}
                      className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium transition hover:border-forest/30 hover:text-forest"
                    >
                      재고
                    </button>
                    <Link
                      href={`/admin/textbooks/${t.id}/sales`}
                      className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium transition hover:border-ember/30 hover:text-ember"
                    >
                      이력
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sell Modal */}
      <ActionModal
        open={sellModalOpen}
        badgeLabel="교재 판매 등록"
        badgeTone="success"
        title="교재 판매 등록"
        description="현장 판매를 등록합니다. 여러 교재를 한 번에 등록할 수 있습니다."
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "등록 중..." : "판매 등록"}
        confirmTone="default"
        isPending={isPending}
        onClose={() => !isPending && setSellModalOpen(false)}
        onConfirm={handleSell}
      >
        <div className="space-y-4">
          {sellError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {sellError}
            </div>
          )}

          {/* Student info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>수험번호 (선택)</label>
              <input
                type="text"
                value={form.examNumber}
                onChange={(e) => setForm((p) => ({ ...p, examNumber: e.target.value }))}
                placeholder="외부 구매자는 비워도 됩니다"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>결제 방법</label>
              <select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    paymentMethod: e.target.value as SellFormState["paymentMethod"],
                  }))
                }
                className={inputCls}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Textbook items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>교재 선택</label>
              <button
                type="button"
                onClick={addSellItem}
                className="text-xs font-medium text-ember hover:underline"
              >
                + 교재 추가
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, index) => {
                const tb = localTextbooks.find((t) => t.id === item.textbookId);
                return (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={item.textbookId}
                      onChange={(e) => updateSellItem(index, "textbookId", e.target.value)}
                      className="flex-1 rounded-2xl border border-ink/10 px-3 py-2 text-sm outline-none focus:border-ink/30"
                    >
                      <option value={0}>교재 선택</option>
                      {activeTextbooks.map((t) => (
                        <option key={t.id} value={t.id} disabled={t.stock === 0}>
                          {t.title} — {t.price.toLocaleString()}원 / 재고 {t.stock}개
                          {t.stock === 0 ? " [품절]" : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={tb?.stock ?? 99}
                      value={item.quantity}
                      onChange={(e) => updateSellItem(index, "quantity", e.target.value)}
                      placeholder="수량"
                      className="w-20 rounded-2xl border border-ink/10 px-3 py-2 text-center text-sm outline-none focus:border-ink/30"
                    />
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSellItem(index)}
                        className="flex-shrink-0 rounded-full p-1 text-red-400 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          {totalAmount > 0 && (
            <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate">결제 방법</span>
                <span className="font-medium">{PAYMENT_METHOD_LABELS[form.paymentMethod]}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate">합계 금액</span>
                <span className="font-bold text-ember">{totalAmount.toLocaleString()}원</span>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className={labelCls}>메모 (선택)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="특이사항"
              className={inputCls}
            />
          </div>
        </div>
      </ActionModal>

      {/* Recent Sales Section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">최근 판매 내역 (20건)</h2>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/8 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {["판매 일시", "교재명", "수험번호", "수량", "금액", "결제", "처리자"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate">
                    판매 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                recentSales.map((s) => {
                  const paymentMethod = extractPaymentMethod(s.note);
                  const soldDate = new Date(s.soldAt);
                  return (
                    <tr key={s.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3 tabular-nums text-slate">
                        <div>
                          {soldDate.toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-slate/70">
                          {soldDate.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/textbooks/${s.textbookId}/sales`}
                          className="font-medium text-ink hover:text-ember hover:underline"
                        >
                          {s.textbookTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {s.examNumber ? (
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="font-medium text-ember hover:underline"
                          >
                            {s.examNumber}
                          </Link>
                        ) : (
                          <span className="text-slate">외부 구매</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">{s.quantity}권</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                        {s.totalPrice.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            paymentMethod === "현금"
                              ? "bg-amber-50 text-amber-700"
                              : paymentMethod === "카드"
                              ? "bg-sky-50 text-sky-700"
                              : paymentMethod === "계좌이체"
                              ? "bg-forest/10 text-forest"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate">{s.staffName}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjust Modal */}
      <ActionModal
        open={stockModalOpen}
        badgeLabel="재고 조정"
        badgeTone="default"
        title="재고 수량 조정"
        description={stockTarget ? `"${stockTarget.title}" 교재의 재고를 조정합니다.` : ""}
        panelClassName="max-w-sm"
        cancelLabel="취소"
        confirmLabel={isPending ? "처리 중..." : "조정 적용"}
        isPending={isPending}
        onClose={() => !isPending && setStockModalOpen(false)}
        onConfirm={handleStockAdjust}
      >
        <div className="space-y-4">
          {stockTarget && (
            <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate">현재 재고</span>
                <span
                  className={`font-semibold ${
                    stockTarget.stock === 0
                      ? "text-red-600"
                      : stockTarget.stock <= 5
                      ? "text-amber-600"
                      : "text-ink"
                  }`}
                >
                  {stockTarget.stock}개
                </span>
              </div>
              {stockAdjustValue && !isNaN(Number(stockAdjustValue)) && Number(stockAdjustValue) !== 0 && (
                <div className="mt-1 flex justify-between">
                  <span className="text-slate">조정 후 예상</span>
                  <span className="font-semibold text-forest">
                    {Math.max(0, stockTarget.stock + Number(stockAdjustValue))}개
                  </span>
                </div>
              )}
            </div>
          )}

          {stockModalError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {stockModalError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">
              조정 수량 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={stockAdjustValue}
              onChange={(e) => setStockAdjustValue(e.target.value)}
              placeholder="예: +10(입고) 또는 -5(차감)"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
            <p className="mt-1.5 text-xs text-slate">
              양수(+): 입고·재고 추가 | 음수(-): 파손·분실·차감
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">조정 사유</label>
            <input
              type="text"
              value={stockReason}
              onChange={(e) => setStockReason(e.target.value)}
              placeholder="예: 신규 입고 / 파손 / 재고 실사 조정"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>
        </div>
      </ActionModal>
    </div>
  );
}
