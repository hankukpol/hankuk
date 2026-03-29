"use client";

import { useEffect, useState } from "react";
import type { ScoreProgressData } from "@/app/api/scores/progress/route";

type ScoreProgressPanelProps = {
  sessionId: number | null;
};

type LoadState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "loaded"; data: ScoreProgressData }
  | { type: "error"; message: string };

export function ScoreProgressPanel({ sessionId }: ScoreProgressPanelProps) {
  const [state, setState] = useState<LoadState>({ type: "idle" });
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setState({ type: "idle" });
      return;
    }

    let cancelled = false;
    setState({ type: "loading" });

    fetch(`/api/scores/progress?sessionId=${sessionId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: ScoreProgressData; error?: string }) => {
        if (cancelled) return;
        if (json.data) {
          setState({ type: "loaded", data: json.data });
        } else {
          setState({ type: "error", message: json.error ?? "진행률 조회에 실패했습니다." });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          type: "error",
          message: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.type === "idle" || !sessionId) {
    return null;
  }

  if (state.type === "loading") {
    return (
      <div className="animate-pulse rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4">
        <div className="h-3 w-24 rounded-full bg-ink/10" />
        <div className="mt-3 h-2 w-full rounded-full bg-ink/10" />
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        진행률 조회 실패: {state.message}
      </div>
    );
  }

  const { data } = state;
  const progressPercent = data.progressPercent;
  const isComplete = data.missingCount === 0 && data.totalEnrolled > 0;

  return (
    <div className="rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 space-y-3">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          성적 입력 진행률
          {isComplete ? (
            <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
              완료
            </span>
          ) : null}
        </p>
        <span className="text-sm font-semibold">
          {data.scoredCount}
          <span className="text-slate font-normal"> / {data.totalEnrolled}명</span>
          <span className="ml-2 text-forest">{progressPercent}%</span>
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
            isComplete ? "bg-forest" : "bg-ember"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 미입력 카운트 + 토글 */}
      {data.missingCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate">
            미입력: <span className="font-semibold text-ink">{data.missingCount}명</span>
          </span>
          <button
            type="button"
            onClick={() => setShowMissing((current) => !current)}
            className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            {showMissing ? "숨기기" : "미입력 목록 보기"}
          </button>
        </div>
      ) : null}

      {/* 미입력 학생 목록 */}
      {showMissing && data.missingStudents.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <div className="max-h-52 overflow-y-auto divide-y divide-ink/10">
            {data.missingStudents.map((student) => (
              <div
                key={student.examNumber}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="font-medium">{student.examNumber}</span>
                <span className="text-slate">{student.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
