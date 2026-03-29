"use client";

export function ScorePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink/80"
    >
      인쇄
    </button>
  );
}
