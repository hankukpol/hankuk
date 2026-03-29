"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

const SUBJECT_KEYS = Object.keys(SUBJECT_LABELS);

type TextbookData = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number;
  stock: number;
  subject: string | null;
  isActive: boolean;
};

type Props = {
  textbook: TextbookData;
};

type FormState = {
  title: string;
  author: string;
  publisher: string;
  price: string;
  stock: string;
  subject: string;
  isActive: boolean;
};

export function TextbookEditForm({ textbook }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    title: textbook.title,
    author: textbook.author ?? "",
    publisher: textbook.publisher ?? "",
    price: String(textbook.price),
    stock: String(textbook.stock),
    subject: textbook.subject ?? "",
    isActive: textbook.isActive,
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const price = form.price === "" ? 0 : Number(form.price);
        const stock = form.stock === "" ? 0 : Number(form.stock);

        if (!form.title.trim()) {
          setErrorMessage("교재명을 입력하세요.");
          return;
        }
        if (isNaN(price) || price < 0) {
          setErrorMessage("가격은 0원 이상이어야 합니다.");
          return;
        }
        if (isNaN(stock) || stock < 0) {
          setErrorMessage("재고는 0개 이상이어야 합니다.");
          return;
        }

        const res = await fetch(`/api/textbooks/${textbook.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            author: form.author.trim() || null,
            publisher: form.publisher.trim() || null,
            price,
            stock,
            subject: form.subject || null,
            isActive: form.isActive,
          }),
          cache: "no-store",
        });

        const payload = await res.json();
        if (!res.ok) {
          setErrorMessage(payload.error ?? "수정에 실패했습니다.");
          return;
        }

        router.push(`/admin/textbooks/${textbook.id}`);
        router.refresh();
      } catch {
        setErrorMessage("저장 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* 교재명 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          교재명 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="예: 2026 경찰학 기본서"
          required
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
        />
      </div>

      {/* 저자 + 출판사 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">저자</label>
          <input
            type="text"
            value={form.author}
            onChange={(e) => setField("author", e.target.value)}
            placeholder="예: 홍길동"
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">출판사</label>
          <input
            type="text"
            value={form.publisher}
            onChange={(e) => setField("publisher", e.target.value)}
            placeholder="예: 경찰고시사"
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
          />
        </div>
      </div>

      {/* 가격 + 재고 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            가격 (원) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            value={form.price}
            onChange={(e) => setField("price", e.target.value)}
            placeholder="예: 25000"
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            재고 (개) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setField("stock", e.target.value)}
            placeholder="예: 50"
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
          />
        </div>
      </div>

      {/* 과목 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">관련 과목</label>
        <select
          value={form.subject}
          onChange={(e) => setField("subject", e.target.value)}
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
        >
          <option value="">일반 (과목 무관)</option>
          {SUBJECT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SUBJECT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* 활성 여부 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setField("isActive", !form.isActive)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            form.isActive ? "bg-forest" : "bg-ink/20"
          }`}
          role="switch"
          aria-checked={form.isActive}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              form.isActive ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <label className="text-sm font-medium">
          {form.isActive ? "활성 (판매 중)" : "비활성 (판매 중단)"}
        </label>
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "저장 중..." : "수정 저장"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
