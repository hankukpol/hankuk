"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuickIssueFormClient() {
  const router = useRouter();
  const [examNumber, setExamNumber] = useState("");
  const [docType, setDocType] = useState<"documents" | "taxcert">("documents");

  function handleGo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = examNumber.trim();
    if (!trimmed) return;

    if (docType === "documents") {
      router.push(`/admin/students/${trimmed}/documents?type=enrollment`);
    } else {
      router.push(`/admin/students/${trimmed}/tax-certificate`);
    }
  }

  return (
    <form onSubmit={handleGo} className="flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs font-medium text-slate mb-1.5">학번</label>
        <input
          type="text"
          value={examNumber}
          onChange={(e) => setExamNumber(e.target.value)}
          placeholder="예: 2026001"
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/40 outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
        />
      </div>
      <div className="min-w-[180px]">
        <label className="block text-xs font-medium text-slate mb-1.5">서류 종류</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as "documents" | "taxcert")}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
        >
          <option value="documents">수강확인서 · 출결확인서</option>
          <option value="taxcert">교육비납입증명서</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={!examNumber.trim()}
        className="inline-flex items-center gap-1.5 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        이동
      </button>
    </form>
  );
}
