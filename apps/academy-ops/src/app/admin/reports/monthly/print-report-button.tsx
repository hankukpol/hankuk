"use client";

type PrintReportButtonProps = {
  label?: string;
  className?: string;
};

export function PrintReportButton({
  label = "인쇄 / PDF",
  className,
}: PrintReportButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "no-print rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-mist transition-colors"
      }
    >
      {label}
    </button>
  );
}
