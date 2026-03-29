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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
        {TAB_ITEMS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-800"
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
