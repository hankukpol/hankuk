"use client";

import { Plus, Trash2 } from "lucide-react";

import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { getKstToday } from "@/components/payments/payment-client-helpers";
import { formatCurrency } from "@/lib/payment-meta";
import type { PaymentCategoryItem } from "@/lib/services/payment.service";

export type PaymentEntryFormValue = {
  id: string;
  paymentTypeId: string;
  amount: string;
  paymentDate: string;
  method: string;
  notes: string;
};

function createEntryId() {
  return `payment-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPaymentEntryFormValue(
  options?: Partial<Omit<PaymentEntryFormValue, "id">>,
): PaymentEntryFormValue {
  return {
    id: createEntryId(),
    paymentTypeId: options?.paymentTypeId ?? "",
    amount: options?.amount ?? "",
    paymentDate: options?.paymentDate ?? getKstToday(),
    method: options?.method ?? "card",
    notes: options?.notes ?? "",
  };
}

type PaymentEntriesEditorProps = {
  entries: PaymentEntryFormValue[];
  onChange: (entries: PaymentEntryFormValue[]) => void;
  paymentCategories: PaymentCategoryItem[];
  disabled?: boolean;
  allowMultiple?: boolean;
  allowNegativeAmounts?: boolean;
  addButtonLabel?: string;
  title?: string;
  description?: string;
};

export function PaymentEntriesEditor({
  entries,
  onChange,
  paymentCategories,
  disabled = false,
  allowMultiple = true,
  allowNegativeAmounts = false,
  addButtonLabel = "결제 수단 추가",
  title = "결제 정보",
  description,
}: PaymentEntriesEditorProps) {
  const totalAmount = entries.reduce((sum, entry) => sum + (parseInt(entry.amount || "0", 10) || 0), 0);

  function updateEntry(entryId: string, patch: Partial<PaymentEntryFormValue>) {
    onChange(entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)));
  }

  function removeEntry(entryId: string) {
    if (entries.length <= 1) {
      return;
    }

    onChange(entries.filter((entry) => entry.id !== entryId));
  }

  function addEntry() {
    onChange([
      ...entries,
      createPaymentEntryFormValue({
        paymentTypeId: entries[0]?.paymentTypeId ?? paymentCategories[0]?.id ?? "",
        paymentDate: entries[0]?.paymentDate ?? getKstToday(),
        notes: entries[0]?.notes ?? "",
      }),
    ]);
  }

  return (
    <section className="rounded-[10px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          총 결제액 {formatCurrency(totalAmount)}원
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {entries.map((entry, index) => (
          <article key={entry.id} className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                결제 {index + 1}
              </p>
              {allowMultiple ? (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  disabled={disabled || entries.length <= 1}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                <select
                  value={entry.paymentTypeId}
                  onChange={(event) => updateEntry(entry.id, { paymentTypeId: event.target.value })}
                  required
                  disabled={disabled}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">수납 유형 선택</option>
                  {paymentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제일</span>
                <input
                  type="date"
                  value={entry.paymentDate}
                  onChange={(event) => updateEntry(entry.id, { paymentDate: event.target.value })}
                  required
                  disabled={disabled}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 금액</span>
                <input
                  type="number"
                  value={entry.amount}
                  onChange={(event) => updateEntry(entry.id, { amount: event.target.value })}
                  min={allowNegativeAmounts ? undefined : "1"}
                  step="1"
                  required
                  disabled={disabled}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 수단</span>
                <PaymentMethodSelect
                  value={entry.method}
                  onChange={(value) => updateEntry(entry.id, { method: value })}
                  required
                  disabled={disabled}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 메모</span>
                <textarea
                  value={entry.notes}
                  onChange={(event) => updateEntry(entry.id, { notes: event.target.value })}
                  rows={3}
                  disabled={disabled}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      {allowMultiple ? (
        <button
          type="button"
          onClick={addEntry}
          disabled={disabled}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {addButtonLabel}
        </button>
      ) : null}
    </section>
  );
}
