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
  { key: "answer", label: "문항 분석" },
];

export default function AnalysisSubTabs({ result }: AnalysisSubTabsProps) {
  const [activeTab, setActiveTab] = useState<ResultSubTab>("score");
  const visibleTabs = result.features.analysisEnabled ? TAB_ITEMS : TAB_ITEMS.slice(0, 1);

  return (
    <section className="space-y-4">
      <div
        className="user-content-tabs"
        role="tablist"
        aria-label="성적 분석 메뉴"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={isActive}
              className="user-content-tab"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "score" ? <MyScoreTab result={result} /> : null}
      {result.features.analysisEnabled && activeTab === "exam" ? <ExamAnalysisTab result={result} /> : null}
      {result.features.analysisEnabled && activeTab === "answer" ? <AnswerReviewTab result={result} /> : null}
    </section>
  );
}
