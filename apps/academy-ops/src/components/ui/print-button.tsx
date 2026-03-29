"use client";

type PrintButtonProps = {
  label?: string;
  className?: string;
};

export function PrintButton({
  label = "인쇄 / PDF",
  className = "no-print inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember",
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
    >
      {label}
    </button>
  );
}
