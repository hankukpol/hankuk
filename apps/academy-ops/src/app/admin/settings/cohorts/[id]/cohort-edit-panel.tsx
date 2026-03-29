"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type ExamCategory = "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM";

type CohortEditData = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  targetExamYear: number | null;
  isActive: boolean;
  maxCapacity: number | null;
};

type Props = {
  cohort: CohortEditData;
};

const EXAM_CATEGORIES: ExamCategory[] = ["GONGCHAE", "GYEONGCHAE", "SOGANG", "CUSTOM"];

export function CohortEditPanel({ cohort }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state — initialised from prop on open
  const [name, setName] = useState(cohort.name);
  const [examCategory, setExamCategory] = useState<ExamCategory>(
    cohort.examCategory as ExamCategory,
  );
  const [startDate, setStartDate] = useState(cohort.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(cohort.endDate.slice(0, 10));
  const [targetExamYear, setTargetExamYear] = useState<string>(
    cohort.targetExamYear != null ? String(cohort.targetExamYear) : "",
  );
  const [isActive, setIsActive] = useState(cohort.isActive);
  const [maxCapacity, setMaxCapacity] = useState<string>(
    cohort.maxCapacity != null ? String(cohort.maxCapacity) : "",
  );

  function handleOpen() {
    // Reset form to current cohort values when opening
    setName(cohort.name);
    setExamCategory(cohort.examCategory as ExamCategory);
    setStartDate(cohort.startDate.slice(0, 10));
    setEndDate(cohort.endDate.slice(0, 10));
    setTargetExamYear(cohort.targetExamYear != null ? String(cohort.targetExamYear) : "");
    setIsActive(cohort.isActive);
    setMaxCapacity(cohort.maxCapacity != null ? String(cohort.maxCapacity) : "");
    setSaveError(null);
    setOpen(true);
  }

  function handleCancel() {
    setOpen(false);
    setSaveError(null);
  }

  function handleSave() {
    if (!name.trim()) {
      setSaveError("기수명을 입력하세요.");
      return;
    }
    if (!startDate || !endDate) {
      setSaveError("시작일과 종료일을 모두 입력하세요.");
      return;
    }
    if (startDate > endDate) {
      setSaveError("종료일이 시작일보다 빨라야 합니다.");
      return;
    }
    setSaveError(null);

    startSaving(async () => {
      try {
        const body: Record<string, unknown> = {
          name: name.trim(),
          examCategory,
          startDate,
          endDate,
          isActive,
          targetExamYear: targetExamYear !== "" ? Number(targetExamYear) : null,
          maxCapacity: maxCapacity !== "" ? Number(maxCapacity) : null,
        };

        const res = await fetch(`/api/settings/cohorts/${cohort.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수정 실패");

        toast.success("저장되었습니다.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40 hover:bg-mist"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          기수 정보 수정
        </button>
      ) : (
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
            <h3 className="text-base font-semibold text-ink">기수 정보 수정</h3>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full p-1.5 text-slate transition hover:bg-mist hover:text-ink"
              aria-label="닫기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Form body */}
          <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
            {/* 기수명 */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate" htmlFor="cohort-edit-name">
                기수명 <span className="text-red-500">*</span>
              </label>
              <input
                id="cohort-edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
                placeholder="예: 2026년 3월 공채 기수"
              />
            </div>

            {/* 수험유형 */}
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="cohort-edit-examCategory"
              >
                수험유형 <span className="text-red-500">*</span>
              </label>
              <select
                id="cohort-edit-examCategory"
                value={examCategory}
                onChange={(e) => setExamCategory(e.target.value as ExamCategory)}
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
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
                htmlFor="cohort-edit-targetExamYear"
              >
                목표시험연도
              </label>
              <input
                id="cohort-edit-targetExamYear"
                type="number"
                value={targetExamYear}
                onChange={(e) => setTargetExamYear(e.target.value)}
                min={2020}
                max={2040}
                placeholder="예: 2027"
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
              />
            </div>

            {/* 시작일 */}
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="cohort-edit-startDate"
              >
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                id="cohort-edit-startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
              />
            </div>

            {/* 종료일 */}
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="cohort-edit-endDate"
              >
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                id="cohort-edit-endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
              />
            </div>

            {/* 정원 */}
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="cohort-edit-maxCapacity"
              >
                정원 <span className="text-xs font-normal text-slate/60">(비워두면 무제한)</span>
              </label>
              <input
                id="cohort-edit-maxCapacity"
                type="number"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                min={1}
                placeholder="예: 50"
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30"
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
                className={`mt-1.5 flex w-fit items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border-forest/30 bg-forest/10 text-forest"
                    : "border-ink/15 bg-mist/40 text-slate"
                }`}
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
          {saveError && (
            <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {saveError}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 border-t border-ink/5 px-6 py-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
