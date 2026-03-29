"use client";

type Props = {
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function PrintButton({
  label = "인쇄",
  disabled = false,
  className,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className={
        className ??
        "print-show inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-semibold transition hover:border-forest/40 hover:text-forest disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 4a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Zm-1.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm.75 2.25a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 .75.75h3a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-3Z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </button>
  );
}
