"use client";

/**
 * 결제 링크 포인트 차감 UI
 *
 * allowPoint가 true인 결제 링크에서 학번 조회 → 포인트 사용 입력 → 최종 금액 반영
 */

import { useState } from "react";

type LookupState = "idle" | "loading" | "found" | "error";

type PointDiscountSectionProps = {
  linkId: number;
  totalAmount: number;
  allowPoint: boolean;
  onPointApplied: (pointAmount: number, examNumber: string) => void;
};

export function PointDiscountSection({
  linkId,
  totalAmount,
  allowPoint,
  onPointApplied,
}: PointDiscountSectionProps) {
  const [examNumber, setExamNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [pointBalance, setPointBalance] = useState(0);
  const [pointToUse, setPointToUse] = useState(0);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  if (!allowPoint) return null;

  const maxUsable = Math.min(pointBalance, totalAmount - 1000);

  const handleLookup = async () => {
    const trimmed = examNumber.trim();
    if (!trimmed) {
      setLookupError("학번을 입력해 주세요.");
      return;
    }

    setLookupState("loading");
    setLookupError(null);
    setApplied(false);
    setPointToUse(0);
    onPointApplied(0, "");

    try {
      const res = await fetch(
        `/api/payment-links/${linkId}/student-lookup?examNumber=${encodeURIComponent(trimmed)}`
      );
      const json = (await res.json()) as {
        data?: { name: string; pointBalance: number };
        error?: string;
      };

      if (!res.ok || !json.data) {
        setLookupState("error");
        setLookupError(json.error ?? "학생 정보를 가져오지 못했습니다.");
        return;
      }

      setStudentName(json.data.name);
      setPointBalance(json.data.pointBalance);
      setLookupState("found");
    } catch {
      setLookupState("error");
      setLookupError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  const handleApply = () => {
    const clamped = Math.max(0, Math.min(pointToUse, maxUsable));
    setPointToUse(clamped);
    setApplied(true);
    onPointApplied(clamped, examNumber.trim());
  };

  const handlePointInput = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      setPointToUse(0);
    } else {
      setPointToUse(Math.min(num, maxUsable));
    }
    if (applied) {
      setApplied(false);
      onPointApplied(0, "");
    }
  };

  const handleReset = () => {
    setLookupState("idle");
    setExamNumber("");
    setStudentName("");
    setPointBalance(0);
    setPointToUse(0);
    setApplied(false);
    setLookupError(null);
    onPointApplied(0, "");
  };

  return (
    <div className="border-t border-ink/5 px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        {/* Star/point icon */}
        <svg
          className="h-4 w-4 text-ember"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        <span className="text-sm font-semibold text-ink">포인트 사용</span>
        <span className="ml-auto text-xs text-slate">선택사항</span>
      </div>

      {lookupState === "idle" || lookupState === "loading" || lookupState === "error" ? (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={examNumber}
              onChange={(e) => setExamNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleLookup();
              }}
              placeholder="학번 입력"
              className="flex-1 rounded-xl border border-ink/20 bg-mist/50 px-4 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/20"
              disabled={lookupState === "loading"}
            />
            <button
              onClick={() => void handleLookup()}
              disabled={lookupState === "loading"}
              className="rounded-xl bg-ember/10 px-4 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lookupState === "loading" ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                "조회"
              )}
            </button>
          </div>

          {lookupError && (
            <p className="mt-2 text-xs text-red-600">{lookupError}</p>
          )}

          <p className="mt-2 text-xs text-slate">
            포인트를 사용하려면 학번을 입력 후 조회하세요. 포인트 사용은
            선택사항입니다.
          </p>
        </>
      ) : (
        // found state
        <div className="space-y-3">
          {/* Student info */}
          <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-mist/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                안녕하세요, {studentName}님!
              </p>
              <p className="mt-0.5 text-xs text-slate">
                보유 포인트:{" "}
                <span className="font-semibold text-ember">
                  {pointBalance.toLocaleString()}P
                </span>
              </p>
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-slate underline underline-offset-2 transition hover:text-ink"
            >
              변경
            </button>
          </div>

          {pointBalance === 0 ? (
            <p className="text-xs text-slate">
              사용 가능한 포인트가 없습니다.
            </p>
          ) : maxUsable <= 0 ? (
            <p className="text-xs text-slate">
              최소 결제 금액(1,000원) 제한으로 포인트를 사용할 수 없습니다.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={pointToUse === 0 ? "" : pointToUse}
                    onChange={(e) => handlePointInput(e.target.value)}
                    placeholder={`최대 ${maxUsable.toLocaleString()}P`}
                    min={0}
                    max={maxUsable}
                    className="w-full rounded-xl border border-ink/20 bg-mist/50 px-4 py-2.5 pr-8 text-sm text-ink placeholder:text-slate/60 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">
                    P
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPointToUse(maxUsable);
                    if (applied) {
                      setApplied(false);
                      onPointApplied(0, "");
                    }
                  }}
                  className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-medium text-ink transition hover:bg-ink/5"
                >
                  전액
                </button>
                <button
                  onClick={handleApply}
                  className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 active:scale-95"
                >
                  적용
                </button>
              </div>

              {applied && pointToUse > 0 && (
                <div className="rounded-xl border border-forest/20 bg-forest/5 px-4 py-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate">기존 결제 금액</span>
                    <span className="font-medium text-ink line-through">
                      {totalAmount.toLocaleString()}원
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-slate">포인트 할인</span>
                    <span className="font-medium text-forest">
                      -{pointToUse.toLocaleString()}원
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-ink/10 pt-2">
                    <span className="text-sm font-semibold text-ink">
                      최종 결제 금액
                    </span>
                    <span className="text-base font-bold tabular-nums text-forest">
                      {(totalAmount - pointToUse).toLocaleString()}원
                    </span>
                  </div>
                </div>
              )}

              {applied && pointToUse === 0 && (
                <p className="text-xs text-slate">
                  사용할 포인트를 입력 후 적용 버튼을 눌러주세요.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
