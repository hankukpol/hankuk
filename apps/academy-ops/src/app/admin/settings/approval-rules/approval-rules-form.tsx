"use client";

import { useState, useTransition } from "react";
import type { ApprovalRulesSettings } from "./page";

type Props = {
  initialSettings: ApprovalRulesSettings;
};

type Field = {
  key: keyof ApprovalRulesSettings;
  label: string;
  description: string;
};

const FIELDS: Field[] = [
  {
    key: "refundApprovalThreshold",
    label: "환불 승인 기준 금액",
    description: "이 금액 이상 환불 시 원장 승인이 필요합니다.",
  },
  {
    key: "discountApprovalThreshold",
    label: "할인 승인 기준 금액",
    description: "이 금액 초과 할인 적용 시 교무 이상 승인이 필요합니다.",
  },
  {
    key: "cashApprovalThreshold",
    label: "현금 지급 승인 기준",
    description: "이 금액 이상 현금 지급 시 원장 승인이 필요합니다.",
  },
];

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function parseFormattedNumber(raw: string): number {
  const stripped = raw.replace(/[^0-9]/g, "");
  return stripped === "" ? 0 : parseInt(stripped, 10);
}

export function ApprovalRulesForm({ initialSettings }: Props) {
  const [form, setForm] = useState<ApprovalRulesSettings>(initialSettings);
  const [displayValues, setDisplayValues] = useState<Record<keyof ApprovalRulesSettings, string>>({
    refundApprovalThreshold: formatNumber(initialSettings.refundApprovalThreshold),
    discountApprovalThreshold: formatNumber(initialSettings.discountApprovalThreshold),
    cashApprovalThreshold: formatNumber(initialSettings.cashApprovalThreshold),
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(key: keyof ApprovalRulesSettings, rawValue: string) {
    const numeric = parseFormattedNumber(rawValue);
    setForm((prev) => ({ ...prev, [key]: numeric }));
    setDisplayValues((prev) => ({ ...prev, [key]: rawValue.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") }));
    setSuccess(false);
  }

  function handleBlur(key: keyof ApprovalRulesSettings) {
    setDisplayValues((prev) => ({
      ...prev,
      [key]: formatNumber(form[key]),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await fetch("/api/settings/approval-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const responseData = await res.json() as { error?: string };
      if (!res.ok) {
        setError(responseData.error ?? "저장 실패");
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          저장되었습니다.
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-ink/10">
        <div className="divide-y divide-ink/10">
          {FIELDS.map(({ key, label, description }) => (
            <div key={key} className="px-6 py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={key}
                    className="block text-sm font-semibold text-ink"
                  >
                    {label}
                  </label>
                  <p className="mt-1 text-xs text-slate">{description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    id={key}
                    type="text"
                    inputMode="numeric"
                    value={displayValues[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    onBlur={() => handleBlur(key)}
                    className="w-36 rounded-xl border border-ink/10 bg-white px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
                  />
                  <span className="shrink-0 text-sm text-slate">원</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-800">설정 안내</p>
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          <li>· 환불 기준 금액 이상 환불 처리 시 원장(DIRECTOR) 승인이 필요합니다.</li>
          <li>· 할인 기준 금액 초과 할인 적용 시 교무 이상(ACADEMIC_ADMIN↑) 승인이 필요합니다.</li>
          <li>· 현금 지급 기준 금액 이상 현금 지급 시 원장(DIRECTOR) 승인이 필요합니다.</li>
          <li>· 0원으로 설정하면 모든 건에 대해 승인이 필요합니다.</li>
        </ul>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
