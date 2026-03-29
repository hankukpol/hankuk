"use client";

import { type ReactNode, useState } from "react";

type ExamTabLayoutProps = {
  morningContent: ReactNode;
  regularContent: ReactNode;
  defaultTab?: "morning" | "regular";
};

export function ExamTabLayout({
  morningContent,
  regularContent,
  defaultTab = "morning",
}: ExamTabLayoutProps) {
  const [activeTab, setActiveTab] = useState<"morning" | "regular">(defaultTab);

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("morning")}
          className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "morning"
              ? "bg-[var(--division-color)] text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          아침 모의고사
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("regular")}
          className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "regular"
              ? "bg-[var(--division-color)] text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          정기 모의고사
        </button>
      </div>

      <div className="mt-4">
        {activeTab === "morning" ? morningContent : regularContent}
      </div>
    </div>
  );
}
