"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Props {
  memoId: string;
}

export function ReviewForm({ memoId }: Props) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) {
      toast.error("승인 또는 반려를 선택해 주세요.");
      return;
    }
    if (decision === "reject" && !reason.trim()) {
      toast.error("반려 시 사유를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const action = decision === "approve" ? "resolve" : "dismiss";
      const res = await fetch(`/api/score-corrections/${memoId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: reason.trim() }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "처리에 실패했습니다.");
      }

      toast.success(decision === "approve" ? "승인 처리되었습니다." : "반려 처리되었습니다.");
      router.push("/admin/score-corrections");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "처리에 실패했습니다.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 결정 선택 */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate mb-3">결정 선택</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setDecision("approve")}
            className={`flex-1 min-w-[140px] rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
              decision === "approve"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm"
                : "border-ink/20 bg-white text-slate hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            <span className="mr-2">✓</span>
            승인 (수정 완료)
          </button>
          <button
            type="button"
            onClick={() => setDecision("reject")}
            className={`flex-1 min-w-[140px] rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
              decision === "reject"
                ? "border-red-300 bg-red-50 text-red-700 shadow-sm"
                : "border-ink/20 bg-white text-slate hover:border-red-200 hover:text-red-700"
            }`}
          >
            <span className="mr-2">✕</span>
            반려
          </button>
        </div>
      </div>

      {/* 결정 설명 */}
      {decision && (
        <div
          className={`rounded-xl px-4 py-3 text-xs ${
            decision === "approve"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {decision === "approve"
            ? "승인: 신고된 성적 오류가 확인되어 수정이 완료되었음을 기록합니다. 성적 실제 수정은 '성적 수정 화면에서 직접 처리하기' 버튼을 사용해 주세요."
            : "반려: 신고 내용이 유효하지 않거나 이미 정확한 성적임을 확인했습니다. 반려 사유를 아래에 입력해 주세요."}
        </div>
      )}

      {/* 사유 입력 */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate mb-1.5 block">
          {decision === "reject" ? "반려 사유 (필수)" : "처리 메모 (선택)"}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            decision === "reject"
              ? "반려 사유를 입력해 주세요. (예: 해당 회차 성적이 정확히 입력되어 있음을 확인함)"
              : "처리 메모를 남길 수 있습니다. (선택사항)"
          }
          required={decision === "reject"}
          rows={4}
          className="w-full rounded-2xl border border-ink/20 bg-mist/60 px-4 py-3 text-sm leading-relaxed placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
        />
      </div>

      {/* 제출 */}
      {decision && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || (decision === "reject" && !reason.trim())}
            className={`inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
              decision === "approve"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {loading ? "처리 중..." : decision === "approve" ? "승인 확정" : "반려 확정"}
          </button>
          <button
            type="button"
            onClick={() => { setDecision(null); setReason(""); }}
            disabled={loading}
            className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50"
          >
            취소
          </button>
        </div>
      )}
    </form>
  );
}
