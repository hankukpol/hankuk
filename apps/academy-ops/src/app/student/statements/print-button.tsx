"use client";

interface PrintButtonProps {
  year: number;
}

export function PrintButton({ year }: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-full border border-ink/10 bg-mist px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
      aria-label={`${year}년 납부 확인서 인쇄`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 14.5h1l-.324-2.107a.75.75 0 0 0-.742-.643H8.566a.75.75 0 0 0-.742.643L7.5 17.25h2Zm5.25-1.5H5.25l-.427-2.773A1.75 1.75 0 0 1 6.556 11h6.888a1.75 1.75 0 0 1 1.733 1.977L14.75 15.75ZM6.75 2.5a.25.25 0 0 0-.25.25V7.09c1.496-.143 3.013-.224 4.5-.226 1.487.002 3.004.083 4.5.226V2.75a.25.25 0 0 0-.25-.25h-6.5Zm7.25 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
          clipRule="evenodd"
        />
      </svg>
      인쇄
    </button>
  );
}
