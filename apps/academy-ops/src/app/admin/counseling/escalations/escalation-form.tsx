"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Priority = "LOW" | "MEDIUM" | "HIGH";

type EscalationTarget = {
  examNumber: string;
  name: string;
  currentStatus: string;
};

type Props = {
  target: EscalationTarget;
  defaultCounselorName: string;
  onClose: () => void;
};

const PRIORITY_LABELS: Record<Priority, string> = {
  HIGH: "긴급",
  MEDIUM: "보통",
  LOW: "낮음",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  HIGH: "border-red-200 bg-red-50 text-red-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
};

export function EscalationForm({ target, defaultCounselorName, onClose }: Props) {
  const router = useRouter();
  const [counselorName, setCounselorName] = useState(defaultCounselorName);
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError("에스컬레이션 내용을 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/counseling/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: target.examNumber,
          counselorName: counselorName.trim(),
          note: note.trim(),
          priority,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "오류가 발생했습니다.");
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-[28px] border border-ink/10 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">에스컬레이션 등록</h2>
            <p className="mt-1 text-sm text-slate">
              {target.name} ({target.examNumber})
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-ink/10 px-3 py-1.5 text-sm text-slate transition hover:border-ink/30"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Priority */}
          <div>
            <label className="mb-2 block text-sm font-semibold">우선순위</label>
            <div className="flex gap-2">
              {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                    priority === p
                      ? PRIORITY_BADGE[p]
                      : "border-ink/10 bg-white text-slate hover:border-ink/30"
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Counselor name */}
          <div>
            <label className="mb-2 block text-sm font-semibold">담당자</label>
            <input
              type="text"
              value={counselorName}
              onChange={(e) => setCounselorName(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/20"
              placeholder="담당자 이름"
              required
            />
          </div>

          {/* Note */}
          <div>
            <label className="mb-2 block text-sm font-semibold">에스컬레이션 내용</label>
            <p className="mb-2 text-xs text-slate">
              기록에 [ESCALATED] 태그가 자동으로 추가됩니다.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/20"
              placeholder="에스컬레이션 사유 및 조치 사항을 입력하세요..."
            />
          </div>

          {/* Preview */}
          {note.trim() && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-700">기록 미리보기</p>
              <p className="mt-2 text-sm text-ink">
                [ESCALATED][{PRIORITY_LABELS[priority]}] {note}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
            >
              {loading ? "등록 중..." : "에스컬레이션 등록"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-slate transition hover:border-ink/30"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Container component that manages modal open state
type EscalationButtonProps = {
  target: EscalationTarget;
  defaultCounselorName: string;
};

export function EscalationButton({ target, defaultCounselorName }: EscalationButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-ember/20 bg-ember/10 px-4 py-1.5 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/20"
      >
        에스컬레이션 등록
      </button>
      {open && (
        <EscalationForm
          target={target}
          defaultCounselorName={defaultCounselorName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
