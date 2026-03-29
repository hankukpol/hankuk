"use client";

import { ExamCategory } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type FormState = {
  name: string;
  examCategory: ExamCategory;
  durationMonths: string;
  regularPrice: string;
  salePrice: string;
  features: string;
  isActive: boolean;
};

type Props = {
  id: string;
  initialData: {
    name: string;
    examCategory: ExamCategory;
    durationMonths: number;
    regularPrice: number;
    salePrice: number;
    features: string;
    isActive: boolean;
  };
};

function calcDiscountRate(regular: string, sale: string): string {
  const r = Number(regular);
  const s = Number(sale);
  if (!r || !s || r <= 0 || s >= r) return "-";
  return `${Math.round(((r - s) / r) * 100)}%`;
}

export function ProductEditForm({ id, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    name: initialData.name,
    examCategory: initialData.examCategory,
    durationMonths: String(initialData.durationMonths),
    regularPrice: String(initialData.regularPrice),
    salePrice: String(initialData.salePrice),
    features: initialData.features,
    isActive: initialData.isActive,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      setError("상품명을 입력하세요.");
      return;
    }
    if (!form.durationMonths || Number(form.durationMonths) < 1) {
      setError("수강기간(개월)을 입력하세요.");
      return;
    }
    if (form.regularPrice === "" || Number(form.regularPrice) < 0) {
      setError("정가를 입력하세요.");
      return;
    }
    if (form.salePrice === "" || Number(form.salePrice) < 0) {
      setError("판매가를 입력하세요.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/comprehensive-products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            name: form.name.trim(),
            examCategory: form.examCategory,
            durationMonths: Number(form.durationMonths),
            regularPrice: Number(form.regularPrice),
            salePrice: Number(form.salePrice),
            features: form.features.trim() || null,
            isActive: form.isActive,
          }),
        });
        const data = await res.json() as { product?: unknown; error?: string };
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setSuccess("상품 정보가 수정되었습니다.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {success}
        </div>
      )}

      {/* 상품명 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          상품명 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        />
      </div>

      {/* 수험유형 + 수강기간 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            수험유형 <span className="text-red-500">*</span>
          </label>
          <select
            value={form.examCategory}
            onChange={(e) => setField("examCategory", e.target.value as ExamCategory)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          >
            {(Object.keys(EXAM_CATEGORY_LABEL) as ExamCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {EXAM_CATEGORY_LABEL[cat]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            수강기간(개월) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            value={form.durationMonths}
            onChange={(e) => setField("durationMonths", e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
      </div>

      {/* 정가 + 판매가 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            정가 (원) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            value={form.regularPrice}
            onChange={(e) => setField("regularPrice", e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            판매가 (원) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            value={form.salePrice}
            onChange={(e) => setField("salePrice", e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
      </div>

      {/* Discount preview */}
      {form.regularPrice && form.salePrice ? (
        <p className="text-xs text-slate">
          할인율:{" "}
          <span className="font-semibold text-ember">
            {calcDiscountRate(form.regularPrice, form.salePrice)}
          </span>
          {" "}({Number(form.regularPrice).toLocaleString()}원 →{" "}
          {Number(form.salePrice).toLocaleString()}원)
        </p>
      ) : null}

      {/* 혜택 내용 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">혜택 내용 (선택)</label>
        <textarea
          rows={3}
          value={form.features}
          onChange={(e) => setField("features", e.target.value)}
          placeholder="예: 기본+심화+문제풀이"
          className="w-full resize-none rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        />
      </div>

      {/* 활성여부 */}
      <div className="flex items-center gap-3">
        <input
          id="edit-is-active"
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setField("isActive", e.target.checked)}
          className="h-4 w-4 rounded border-ink/20 accent-ember"
        />
        <label htmlFor="edit-is-active" className="text-sm font-medium">
          활성 상품으로 설정
        </label>
      </div>

      {/* Save button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "변경 사항 저장"}
        </button>
      </div>
    </div>
  );
}
