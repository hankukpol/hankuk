"use client";

export function RevenuePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink no-print"
    >
      인쇄
    </button>
  );
}
