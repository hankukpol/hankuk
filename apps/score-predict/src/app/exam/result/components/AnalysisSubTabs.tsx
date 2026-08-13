"use client";

import { useState } from "react";
import ExamAnalysisTab from "@/app/exam/result/components/tabs/ExamAnalysisTab";
import MyScoreTab from "@/app/exam/result/components/tabs/MyScoreTab";
import AnswerReviewTab from "@/app/exam/result/components/tabs/AnswerReviewTab";
import type { ResultResponse } from "@/app/exam/result/types";

type ResultSubTab = "score" | "exam" | "answer";

interface AnalysisSubTabsProps {
  result: ResultResponse;
}

const TAB_ITEMS: Array<{ key: ResultSubTab; label: string }> = [
  { key: "score", label: "내 성적" },
  { key: "exam", label: "시험 분석" },
  { key: "answer", label: "정오표" },
];

export default function AnalysisSubTabs({ result }: AnalysisSubTabsProps) {
  const [activeTab, setActiveTab] = useState<ResultSubTab>("score");

  return (
    <section className="space-y-4">
      <div
        className="flex items-center overflow-x-auto border-b border-slate-200 bg-white px-1 sm:px-3"
        role="tablist"
        aria-label="성적 분석 메뉴"
      >
        {TAB_ITEMS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={isActive}
              className={`-mb-px h-12 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors ${
 isActive
 ? "border-service-600 text-service-700"
 : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
 }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "score" ? <MyScoreTab result={result} /> : null}
      {activeTab === "exam" ? <ExamAnalysisTab result={result} /> : null}
      {activeTab === "answer" ? <AnswerReviewTab result={result} /> : null}
    </section>
  );
}
