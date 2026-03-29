"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  sessionId: number;
  isLocked: boolean;
};

export function SessionLockToggle({ sessionId, isLocked }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(isLocked);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch(`/api/scores/sessions/${sessionId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock: !locked }),
      });
      if (res.ok) {
        setLocked(!locked);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={locked ? "잠금 해제" : "성적 잠금"}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-50 ${
        locked
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-ink/15 bg-ink/5 text-slate"
      }`}
    >
      {locked ? (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          잠금
        </>
      ) : (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          잠그기
        </>
      )}
    </button>
  );
}