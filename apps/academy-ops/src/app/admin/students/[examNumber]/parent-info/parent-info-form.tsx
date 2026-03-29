"use client";

import { useState, useTransition } from "react";

const RELATION_OPTIONS = [
  { value: "어머니", label: "어머니" },
  { value: "아버지", label: "아버지" },
  { value: "조부", label: "조부" },
  { value: "조모", label: "조모" },
  { value: "형제·자매", label: "형제·자매" },
  { value: "기타", label: "기타" },
] as const;

type Props = {
  examNumber: string;
  initialParentName: string | null;
  initialParentRelation: string | null;
  initialParentMobile: string | null;
};

export function ParentInfoForm({
  examNumber,
  initialParentName,
  initialParentRelation,
  initialParentMobile,
}: Props) {
  const [parentName, setParentName] = useState(initialParentName ?? "");
  const [parentRelation, setParentRelation] = useState(initialParentRelation ?? "");
  const [parentMobile, setParentMobile] = useState(initialParentMobile ?? "");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await fetch(`/api/students/${examNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: parentName || null,
          parentRelation: parentRelation || null,
          parentMobile: parentMobile || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          보호자 정보가 저장되었습니다.
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 보호자 이름 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          보호자 이름
        </label>
        <input
          type="text"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          placeholder="예: 홍길동"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* 관계 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          관계
        </label>
        <div className="flex flex-wrap gap-2">
          {RELATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setParentRelation(opt.value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                parentRelation === opt.value
                  ? "border-forest bg-forest text-white"
                  : "border-ink/10 bg-white text-slate hover:border-forest/40 hover:text-forest"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {parentRelation && !RELATION_OPTIONS.some((o) => o.value === parentRelation) && (
          <input
            type="text"
            value={parentRelation}
            onChange={(e) => setParentRelation(e.target.value)}
            placeholder="관계 직접 입력"
            className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        )}
        <input
          type="hidden"
          value={parentRelation}
          onChange={(e) => setParentRelation(e.target.value)}
        />
      </div>

      {/* 연락처 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          보호자 연락처
        </label>
        <input
          type="tel"
          value={parentMobile}
          onChange={(e) => setParentMobile(e.target.value)}
          placeholder="010-0000-0000"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
