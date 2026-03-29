"use client";

import { useState } from "react";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";

export function PaymentExportPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState("");

  function download(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });

    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (method) params.set("method", method);
    if (category) params.set("category", category);

    window.location.href = `/api/export/payments?${params.toString()}`;
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
      <h2 className="text-xl font-semibold">수납 내역 내보내기</h2>
      <p className="mt-2 text-sm leading-7 text-slate">
        날짜 범위, 결제수단, 카테고리 조건으로 필터링한 수납 내역을 CSV 또는 xlsx로 내려받습니다.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">시작일</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">종료일</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">결제수단</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as Array<keyof typeof PAYMENT_METHOD_LABEL>).map(
              (key) => (
                <option key={key} value={key}>
                  {PAYMENT_METHOD_LABEL[key]}
                </option>
              )
            )}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">카테고리</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체</option>
            {(Object.keys(PAYMENT_CATEGORY_LABEL) as Array<keyof typeof PAYMENT_CATEGORY_LABEL>).map(
              (key) => (
                <option key={key} value={key}>
                  {PAYMENT_CATEGORY_LABEL[key]}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => download("xlsx")}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          xlsx 다운로드
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
        >
          CSV 다운로드
        </button>
      </div>
    </section>
  );
}
