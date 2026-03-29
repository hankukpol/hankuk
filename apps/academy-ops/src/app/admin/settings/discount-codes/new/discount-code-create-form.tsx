"use client";

import { CodeType, DiscountType } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type FormState = {
  code: string;
  type: CodeType;
  discountType: DiscountType;
  discountValue: string;
  maxUsage: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  description: string;
};

const CODE_TYPE_LABELS: Record<CodeType, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "등록",
  CAMPAIGN: "캠페인",
};

const DEFAULT_FORM: FormState = {
  code: "",
  type: CodeType.ENROLLMENT,
  discountType: DiscountType.RATE,
  discountValue: "",
  maxUsage: "",
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: "",
  isActive: true,
  description: "",
};

export function DiscountCodeCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const body = {
          code: form.code.trim().toUpperCase(),
          type: form.type,
          discountType: form.discountType,
          discountValue: form.discountValue === "" ? 0 : Number(form.discountValue),
          maxUsage: form.maxUsage ? Number(form.maxUsage) : null,
          validFrom: form.validFrom || null,
          validUntil: form.validUntil || null,
          isActive: form.isActive,
        };

        const response = await fetch("/api/settings/discount-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "할인 코드 등록에 실패했습니다.");
        }

        toast.success("할인 코드를 등록했습니다.");
        router.push("/admin/settings/discount-codes");
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "등록에 실패했습니다.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* 코드 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          코드 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => setField("code", e.target.value.toUpperCase())}
          placeholder="예: SUMMER2026"
          required
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 font-mono text-sm uppercase outline-none focus:border-ink/30"
        />
        <p className="mt-1 text-xs text-slate">영문 대문자와 숫자만 사용 권장. 자동으로 대문자 변환됩니다.</p>
      </div>

      {/* 유형 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          유형 <span className="text-red-500">*</span>
        </label>
        <select
          value={form.type}
          onChange={(e) => setField("type", e.target.value as CodeType)}
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        >
          {(Object.keys(CODE_TYPE_LABELS) as CodeType[]).map((t) => (
            <option key={t} value={t}>
              {CODE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* 할인 방식 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          할인 방식 <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="discountType"
              value={DiscountType.RATE}
              checked={form.discountType === DiscountType.RATE}
              onChange={() => setField("discountType", DiscountType.RATE)}
              className="accent-ember"
            />
            비율 (%)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="discountType"
              value={DiscountType.FIXED}
              checked={form.discountType === DiscountType.FIXED}
              onChange={() => setField("discountType", DiscountType.FIXED)}
              className="accent-ember"
            />
            정액 (원)
          </label>
        </div>
      </div>

      {/* 할인값 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          할인 값 <span className="text-red-500">*</span>
          <span className="ml-1 text-xs font-normal text-slate">
            {form.discountType === DiscountType.RATE ? "(% 입력)" : "(원 입력)"}
          </span>
        </label>
        <input
          type="number"
          min={0}
          value={form.discountValue}
          onChange={(e) => setField("discountValue", e.target.value)}
          placeholder={
            form.discountType === DiscountType.RATE ? "예: 10" : "예: 50000"
          }
          required
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        />
      </div>

      {/* 최대 사용 횟수 + 유효 시작일 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            최대 사용 횟수
            <span className="ml-1 text-xs font-normal text-slate">(미입력=무제한)</span>
          </label>
          <input
            type="number"
            min={1}
            value={form.maxUsage}
            onChange={(e) => setField("maxUsage", e.target.value)}
            placeholder="예: 100"
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            유효 시작일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => setField("validFrom", e.target.value)}
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
      </div>

      {/* 유효 종료일 + 활성 여부 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            유효 종료일
            <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
          </label>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => setField("validUntil", e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-ink/10 px-4 py-3 text-sm transition hover:border-ink/30">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              className="accent-ember"
            />
            <span className="font-medium">활성</span>
            <span className="text-xs text-slate">(즉시 사용 가능)</span>
          </label>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "등록 중..." : "할인 코드 등록"}
        </button>
        <a
          href="/admin/settings/discount-codes"
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          취소
        </a>
      </div>
    </form>
  );
}
