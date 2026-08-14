"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

type HealthResponse = {
  healthy?: boolean;
  activeExamCount?: number;
  activeExams?: Array<{
    id: number;
    name: string;
    year: number;
    round: number;
  }>;
  error?: string;
};

export default function ActiveExamHealthBanner() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      const data = (await response.json()) as HealthResponse;
      setHealth(response.ok ? data : { error: data.error ?? "운영 상태 확인 실패" });
    } catch {
      setHealth({ error: "운영 상태를 확인할 수 없습니다." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const timer = window.setInterval(() => void loadHealth(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadHealth]);

  const healthy = health?.healthy === true;
  const activeExam = health?.activeExams?.[0];

  return (
    <section
      className={`mb-4 flex flex-col gap-3 rounded-xl border px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
 healthy
 ? "border-emerald-200 bg-emerald-50 text-emerald-900"
 : "border-rose-300 bg-rose-50 text-rose-900"
 }`}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {healthy ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div>
          <p className="font-semibold">
            {isLoading && !health
              ? "활성 시험 상태 확인 중"
              : healthy
                ? `활성 시험 1개 · ${activeExam?.year ?? "-"}년 ${activeExam?.round ?? "-"}차`
                : `운영 주의 · 활성 시험 ${health?.activeExamCount ?? "확인 불가"}개`}
          </p>
          {!healthy && health ? (
            <p className="mt-1 text-xs leading-5">
              {health.error ??
                `활성 시험은 이 사이트 안에서 정확히 1개여야 합니다. 현재 ID: ${
                  health.activeExams?.map((exam) => exam.id).join(", ") || "없음"
                }`}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void loadHealth()}
        disabled={isLoading}
        className="inline-flex h-9 items-center gap-1 self-start rounded-md border border-current/20 bg-white/60 px-3 text-xs font-medium hover:bg-white disabled:opacity-60 sm:self-center"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
        다시 확인
      </button>
    </section>
  );
}
