"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SuspendStatus = "active" | "suspended" | "none";

type Props = {
  examNumber: string;
  suspendStatus: SuspendStatus;
};

export function SuspendButton({ examNumber, suspendStatus }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suspend modal fields
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState("");

  function openModal() {
    setError(null);
    setReason("");
    setReturnDate("");
    setModalOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setModalOpen(false);
    setError(null);
  }

  async function handleSuspend() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${examNumber}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          returnDate: returnDate || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "휴원 처리에 실패했습니다.");
      }
      setModalOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "휴원 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${examNumber}/suspend`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "복교 처리에 실패했습니다.");
      }
      setModalOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "복교 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (suspendStatus === "none") return null;

  return (
    <>
      {suspendStatus === "active" && (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/10 hover:border-ember/50"
        >
          휴원 처리
        </button>
      )}

      {suspendStatus === "suspended" && (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10 hover:border-forest/50"
        >
          복교 처리
        </button>
      )}

      {/* Suspend modal */}
      {modalOpen && suspendStatus === "active" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30">
          <div className="w-full max-w-sm rounded-[24px] border border-ink/10 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-ink">휴원 처리</h3>
            <p className="mt-2 text-sm text-slate">
              수강 중인 등록을 휴원 처리합니다. 사유와 복귀 예정일을 입력하세요.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  휴원 사유
                  <span className="ml-1 text-slate font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 개인 사정, 군 입대, 취업 등"
                  className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ember/50 focus:ring-2 focus:ring-ember/10"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  복귀 예정일
                  <span className="ml-1 text-slate font-normal">(선택)</span>
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ember/50 focus:ring-2 focus:ring-ember/10"
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={loading}
                className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {loading ? "처리 중..." : "휴원 확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore modal */}
      {modalOpen && suspendStatus === "suspended" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30">
          <div className="w-full max-w-sm rounded-[24px] border border-ink/10 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-ink">복교 처리</h3>
            <p className="mt-3 text-sm text-slate">
              휴원 중인 수강 등록을 복교 처리하고 수강 상태로 되돌립니다.
              계속하시겠습니까?
            </p>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={loading}
                className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
              >
                {loading ? "처리 중..." : "복교 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
