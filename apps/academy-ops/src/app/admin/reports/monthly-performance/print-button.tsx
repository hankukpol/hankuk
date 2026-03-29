"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-full bg-[#1F4D3A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1F4D3A]/90"
    >
      인쇄 / PDF 저장
    </button>
  );
}
