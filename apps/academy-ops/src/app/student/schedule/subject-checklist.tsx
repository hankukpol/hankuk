"use client";

import { useEffect, useState } from "react";

type SubjectChecklistProps = {
  subjects: string[]; // Subject display names
  nextExamDateKey: string | null; // "YYYY-MM-DD" — used as localStorage key namespace
};

function buildStorageKey(dateKey: string | null) {
  return `exam-checklist-${dateKey ?? "default"}`;
}

export function SubjectChecklist({ subjects, nextExamDateKey }: SubjectChecklistProps) {
  const storageKey = buildStorageKey(nextExamDateKey);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount (client-only)
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setChecked(parsed);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  function toggle(subject: string) {
    setChecked((prev) => {
      const next = { ...prev, [subject]: !prev[subject] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function resetAll() {
    setChecked({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  const checkedCount = subjects.filter((s) => checked[s]).length;
  const allDone = checkedCount === subjects.length && subjects.length > 0;

  if (!mounted) {
    // Avoid hydration mismatch: render a loading skeleton
    return (
      <div className="space-y-2">
        {subjects.map((sub) => (
          <div
            key={sub}
            className="h-10 rounded-[16px] border border-ink/10 bg-mist/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-ink/10 px-4 py-4 text-center text-xs text-slate">
        시험 과목이 없습니다
      </p>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                allDone ? "bg-forest" : "bg-ember"
              }`}
              style={{
                width: subjects.length > 0 ? `${(checkedCount / subjects.length) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate">
          {checkedCount}/{subjects.length}
        </span>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={resetAll}
            className="shrink-0 text-[10px] text-slate underline underline-offset-2 hover:text-ink"
          >
            초기화
          </button>
        )}
      </div>

      {allDone && (
        <div className="mb-3 rounded-[16px] border border-forest/20 bg-forest/10 px-3 py-2 text-center text-xs font-semibold text-forest">
          모든 과목 준비 완료! 시험 잘 보세요.
        </div>
      )}

      {/* Subject items */}
      <div className="space-y-1.5">
        {subjects.map((subject) => {
          const isChecked = Boolean(checked[subject]);
          return (
            <button
              key={subject}
              type="button"
              onClick={() => toggle(subject)}
              className={`flex w-full items-center gap-3 rounded-[16px] border px-4 py-2.5 text-left text-sm transition ${
                isChecked
                  ? "border-forest/20 bg-forest/10 text-forest"
                  : "border-ink/10 bg-white hover:border-ember/20 hover:bg-ember/5"
              }`}
            >
              {/* Checkbox indicator */}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  isChecked
                    ? "border-forest bg-forest text-white"
                    : "border-ink/20 bg-white"
                }`}
              >
                {isChecked && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`font-medium ${isChecked ? "line-through opacity-60" : ""}`}>
                {subject}
              </span>
              {isChecked && (
                <span className="ml-auto text-[10px] font-semibold text-forest opacity-70">
                  완료
                </span>
              )}
            </button>
          );
        })}
      </div>

      {nextExamDateKey && (
        <p className="mt-2 text-[10px] text-slate">
          체크리스트는 {nextExamDateKey} 시험 기준으로 저장됩니다 (브라우저 기준)
        </p>
      )}
    </div>
  );
}
