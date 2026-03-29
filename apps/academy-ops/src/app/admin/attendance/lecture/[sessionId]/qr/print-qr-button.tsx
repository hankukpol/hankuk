"use client";

export function PrintQRButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 active:scale-[0.98]"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
      인쇄
    </button>
  );
}
