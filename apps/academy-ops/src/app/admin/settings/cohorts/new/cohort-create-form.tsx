"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ExamCategory = "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM";

const EXAM_CATEGORY_LABEL: Record<ExamCategory, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

const EXAM_CATEGORIES: ExamCategory[] = ["GONGCHAE", "GYEONGCHAE", "SOGANG", "CUSTOM"];

export function CohortCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [examCategory, setExamCategory] = useState<ExamCategory>("GONGCHAE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetExamYear, setTargetExamYear] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [isActive, setIsActive] = useState(true);

  function validate(): string | null {
    if (!name.trim()) return "기수명을 입력하세요.";
    if (!startDate) return "시작일을 입력하세요.";
    if (!endDate) return "종료일을 입력하세요.";
    if (startDate > endDate) return "종료일은 시작일 이후여야 합니다.";
    if (targetExamYear && (Number(targetExamYear) < 2020 || Number(targetExamYear) > 2040)) {
      return "목표시험연도는 2020~2040 사이여야 합니다.";
    }
    if (maxCapacity && Number(maxCapacity) < 1) {
      return "정원은 1명 이상이어야 합니다.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/cohorts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            examCategory,
            startDate,
            endDate,
            targetExamYear: targetExamYear !== "" ? Number(targetExamYear) : null,
            maxCapacity: maxCapacity !== "" ? Number(maxCapacity) : null,
            isActive,
          }),
        });

        const payload = await res.json() as { cohort?: { id: string }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "생성 실패");

        router.push(`/admin/settings/cohorts/${payload.cohort!.id}`);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "생성 실패");
      }
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">기수 정보 입력</h2>
          <p className="mt-0.5 text-xs text-slate">
            <span className="text-red-500">*</span> 표시 항목은 필수입니다.
          </p>
        </div>

        {/* Form body */}
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          {/* 기수명 */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate" htmlFor="cohort-name">
              기수명 <span className="text-red-500">*</span>
            </label>
            <input
              id="cohort-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026년 3월 공채 기수"
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 수험유형 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="cohort-examCategory">
              수험유형 <span className="text-red-500">*</span>
            </label>
            <select
              id="cohort-examCategory"
              value={examCategory}
              onChange={(e) => setExamCategory(e.target.value as ExamCategory)}
              className={inputClass}
              disabled={isPending}
            >
              {EXAM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {EXAM_CATEGORY_LABEL[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* 목표시험연도 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="cohort-targetExamYear"
            >
              목표시험연도
            </label>
            <input
              id="cohort-targetExamYear"
              type="number"
              value={targetExamYear}
              onChange={(e) => setTargetExamYear(e.target.value)}
              min={2020}
              max={2040}
              placeholder="예: 2027"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 시작일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="cohort-startDate">
              시작일 <span className="text-red-500">*</span>
            </label>
            <input
              id="cohort-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 종료일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="cohort-endDate">
              종료일 <span className="text-red-500">*</span>
            </label>
            <input
              id="cohort-endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 정원 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="cohort-maxCapacity">
              정원{" "}
              <span className="text-xs font-normal text-slate/60">(비워두면 무제한)</span>
            </label>
            <input
              id="cohort-maxCapacity"
              type="number"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value)}
              min={1}
              placeholder="예: 50"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 활성 여부 */}
          <div className="flex flex-col justify-end">
            <label className="block text-xs font-medium text-slate">기수 상태</label>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              disabled={isPending}
              className={`mt-1.5 flex w-fit items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ink/15 bg-mist/40 text-slate"
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-7 rounded-full transition-colors ${
                  isActive ? "bg-forest" : "bg-slate/30"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </span>
              {isActive ? "활성" : "비활성"}
            </button>
          </div>
        </div>

        {/* Error */}
        {formError && (
          <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {formError}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-ink/5 px-6 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "등록 중..." : "기수 등록"}
          </button>
        </div>
      </div>
    </form>
  );
}
