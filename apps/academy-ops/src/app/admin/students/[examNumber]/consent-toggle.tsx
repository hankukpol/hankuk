"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  examNumber: string;
  currentConsent: boolean;
};

export function ConsentToggle({ examNumber, currentConsent }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${examNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationConsent: !currentConsent }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-ink/20 bg-white px-3 py-1 text-xs font-medium text-ink transition hover:bg-mist"
      >
        동의 상태 변경
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30">
          <div className="w-full max-w-sm rounded-[24px] border border-ink/10 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-ink">마케팅 SMS 수신 동의 변경</h3>
            <p className="mt-3 text-sm text-slate">
              현재 상태:{" "}
              <span className={currentConsent ? "font-semibold text-forest" : "font-semibold text-amber-600"}>
                {currentConsent ? "동의" : "미동의"}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate">
              변경 후 상태:{" "}
              <span className={!currentConsent ? "font-semibold text-forest" : "font-semibold text-amber-600"}>
                {!currentConsent ? "동의" : "미동의"}
              </span>
            </p>
            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setError(null); }}
                disabled={loading}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {loading ? "저장 중..." : "변경 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
