"use client";

import { useState, useTransition } from "react";

type Props = {
  textbookId: number;
  textbookTitle: string;
  currentStock: number;
};

export function InlineStockAdjust({ textbookId, textbookTitle, currentStock }: Props) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stock, setStock] = useState(currentStock);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deltaNum = Number(delta);
  const previewStock = delta !== "" && !isNaN(deltaNum) ? Math.max(0, stock + deltaNum) : null;

  function handleSubmit() {
    if (delta === "" || isNaN(deltaNum) || deltaNum === 0) {
      setError("0이 아닌 정수를 입력하세요. 양수는 입고, 음수는 차감입니다.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/textbooks/${textbookId}/stock`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: deltaNum, reason: reason.trim() || null }),
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "재고 조정 실패");
        setStock(data.textbook.stock);
        setOpen(false);
        setDelta("");
        setReason("");
        setSuccessMsg(
          `재고 조정 완료: "${textbookTitle}" (${deltaNum > 0 ? "+" : ""}${deltaNum}개 → ${data.textbook.stock}개)`,
        );
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "재고 조정 실패");
      }
    });
  }

  return (
    <div>
      {/* Success notification */}
      {successMsg && (
        <div className="mb-3 rounded-2xl border border-forest/20 bg-forest/5 px-4 py-2.5 text-sm text-forest">
          {successMsg}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Current stock display */}
        <span
          className={`text-sm font-semibold ${
            stock === 0
              ? "text-red-600"
              : stock <= 5
              ? "text-amber-600"
              : "text-ink"
          }`}
        >
          {stock === 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              품절 (0개)
            </span>
          ) : stock <= 5 ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stock}개 (부족)
            </span>
          ) : (
            `${stock}개`
          )}
        </span>

        {/* Toggle button */}
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setError(null);
            setDelta("");
            setReason("");
          }}
          className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
        >
          {open ? "취소" : "+재고 조정"}
        </button>
      </div>

      {/* Inline form */}
      {open && (
        <div className="mt-3 rounded-[20px] border border-ink/10 bg-mist p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">재고 조정</p>
            <p className="text-xs text-slate">현재: {stock}개</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate">
              조정 수량 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="예: +10(입고) 또는 -3(차감)"
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink/30"
            />
            {previewStock !== null && (
              <p className="mt-1 text-xs text-slate">
                조정 후 예상 재고:{" "}
                <span
                  className={`font-semibold ${
                    previewStock === 0
                      ? "text-red-600"
                      : previewStock <= 5
                      ? "text-amber-600"
                      : "text-forest"
                  }`}
                >
                  {previewStock}개
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate">조정 사유</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 신규 입고 / 파손 / 재고 실사 조정"
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink/30"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-forest/90 disabled:opacity-60"
            >
              {isPending ? "처리 중..." : "조정 적용"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-1.5 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
