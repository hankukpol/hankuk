"use client";

export function EnrollmentCertPrintButton() {
  function handlePrint() {
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ember/90 active:scale-95"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.917a1.75 1.75 0 0 1-1.73-2.016L4.491 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75Zm4.5 13.5h1l.316-2.05a.75.75 0 0 0-.74-.95H9.924a.75.75 0 0 0-.74.95l.316 2.05ZM6.75 2.5h6.5a.25.25 0 0 1 .25.25V5.57a49.585 49.585 0 0 0-7 0V2.75a.25.25 0 0 1 .25-.25Zm-1.8 6.24a.75.75 0 0 1 .8.7c0 .413-.337.75-.75.75a.75.75 0 0 1-.75-.75c0-.414.337-.75.75-.75h-.05Zm9.05-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
          clipRule="evenodd"
        />
      </svg>
      인쇄하기
    </button>
  );
}
