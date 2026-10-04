"use client";

import { Printer } from "lucide-react";

/** 지금 화면을 그대로 인쇄한다. 화면 전용 요소는 [data-print-hide] 로 빠진다. */
export function PrintPageButton({ label = "인쇄 / PDF 저장" }: { label?: string }) {
  return (
    <button type="button" className="admin-button admin-button-primary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
