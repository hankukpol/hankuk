"use client";

export function ExamSchedulePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90"
    >
      인쇄 / PDF 저장
    </button>
  );
}
