"use client";

import { useCallback, useState } from "react";

type Props = {
  examNumber: string;
  docType: "ENROLLMENT_CERT" | "ATTENDANCE_CERT";
};

const DOC_TYPE_LABEL: Record<Props["docType"], string> = {
  ENROLLMENT_CERT: "수강확인서",
  ATTENDANCE_CERT: "출결확인서",
};

export function IssueRecordButton({ examNumber, docType }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleClick = useCallback(() => {
    if (status === "loading" || status === "done") return;
    setStatus("loading");

    // Fire-and-forget — no blocking UI change
    fetch("/api/documents/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: examNumber, docType }),
    })
      .then((res) => {
        setStatus(res.ok ? "done" : "error");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [examNumber, docType, status]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
        status === "done"
          ? "border-forest/30 bg-forest/10 text-forest"
          : status === "error"
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-[#111827]/10 bg-white text-[#4B5563] hover:border-[#C55A11]/30 hover:text-[#C55A11]"
      }`}
    >
      {status === "done"
        ? "기록 완료"
        : status === "error"
          ? "기록 실패"
          : status === "loading"
            ? "기록 중..."
            : `${DOC_TYPE_LABEL[docType]} 발급 기록`}
    </button>
  );
}
