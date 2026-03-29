"use client";

import { useState } from "react";
import { toast } from "sonner";

type RateEntry = { adminUserId: string; rate: number };

type Props = {
  year: number;
  month: number;
  rates: RateEntry[];
};

export function SettlementExcelButton({ year, month, rates }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(year));
      params.set("month", String(month));
      for (const { adminUserId, rate } of rates) {
        if (rate > 0) {
          params.set(`rates[${adminUserId}]`, String(rate));
        }
      }

      const res = await fetch(`/api/staff-settlements/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "엑셀 다운로드에 실패했습니다.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `직원정산_${year}년${String(month).padStart(2, "0")}월.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20 disabled:opacity-50"
    >
      {loading ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-forest/40 border-t-forest" />
          다운로드 중...
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          엑셀 다운로드
        </>
      )}
    </button>
  );
}
