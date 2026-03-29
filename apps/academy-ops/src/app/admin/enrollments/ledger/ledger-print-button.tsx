"use client";

export function LedgerPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700"
    >
      🖨 인쇄 (A4 가로)
    </button>
  );
}
