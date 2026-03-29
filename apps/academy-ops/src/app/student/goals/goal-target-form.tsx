"use client";

import { useState } from "react";
import { Subject } from "@prisma/client";

interface GoalTargetFormProps {
  subjects: Subject[];
  subjectLabels: Record<Subject, string>;
  initialTargetScores: Record<Subject, number>;
}

export function GoalTargetForm({
  subjects,
  subjectLabels,
  initialTargetScores,
}: GoalTargetFormProps) {
  const [scores, setScores] = useState<Record<Subject, number>>(initialTargetScores);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(subject: Subject, value: string) {
    const num = parseInt(value, 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 100) {
      setScores((prev) => ({ ...prev, [subject]: num }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/student/target-scores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetScores: scores }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "저장 중 오류가 발생했습니다.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((subject) => (
          <div key={subject} className="flex items-center gap-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
            <label htmlFor={`target-${subject}`} className="flex-1 text-sm font-semibold text-ink">
              {subjectLabels[subject]}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id={`target-${subject}`}
                type="number"
                min={0}
                max={100}
                value={scores[subject] ?? 80}
                onChange={(e) => handleChange(subject, e.target.value)}
                className="w-16 rounded-xl border border-ink/10 bg-white px-2 py-1.5 text-center text-sm font-semibold text-ink focus:border-ember/30 focus:outline-none focus:ring-2 focus:ring-ember/10"
              />
              <span className="text-sm text-slate">점</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "저장 중..." : "목표 점수 저장"}
        </button>

        {saved && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            저장되었습니다
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">오류</p>
          <p className="mt-0.5 text-sm text-red-600">{error}</p>
        </div>
      )}
    </form>
  );
}
