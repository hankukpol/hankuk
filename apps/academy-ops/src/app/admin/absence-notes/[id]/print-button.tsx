"use client"

export function AbsenceNotePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:bg-ink/5 no-print"
    >
      인쇄
    </button>
  )
}
