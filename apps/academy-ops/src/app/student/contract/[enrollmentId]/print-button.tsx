"use client";

export function ContractPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest/90"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.917a1.75 1.75 0 0 1-1.73-2.016L4.492 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 10a.75.75 0 0 0 0 1.5h1a.75.75 0 0 0 0-1.5h-1ZM6.75 2.5a.25.25 0 0 0-.25.25v3.51c.985-.06 1.975-.09 2.97-.09h1.06c.995 0 1.985.03 2.97.09V2.75a.25.25 0 0 0-.25-.25h-6.5Z"
          clipRule="evenodd"
        />
      </svg>
      인쇄 / PDF 저장
    </button>
  );
}
