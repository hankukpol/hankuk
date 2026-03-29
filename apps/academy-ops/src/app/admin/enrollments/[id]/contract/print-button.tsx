"use client";

export function ContractPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
    >
      🖨 인쇄 (B5)
    </button>
  );
}
