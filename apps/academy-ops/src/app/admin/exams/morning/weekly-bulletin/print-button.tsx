"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-mist print:hidden"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      인쇄
    </button>
  );
}
