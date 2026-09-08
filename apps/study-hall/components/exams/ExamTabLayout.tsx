"use client";

import { type ReactNode, useState } from "react";

import { createTabListKeyHandler } from "@/lib/useTabListKeys";

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

  // DESIGN.md 5.4 — 좌우 방향키·Home·End 로 탭 이동
  const handleTabKeyDown = createTabListKeyHandler(
    ["morning", "regular"] as const,
    activeTab,
    setActiveTab,
  );

  return (
    <div>
      {/* DESIGN.md 5.4 — 화면 이동은 1차 폴더 탭. 데이터 필터용 조건 버튼과 섞지 않는다. */}
      <div className="admin-tabs" role="tablist" aria-label="시험 종류">
        <button
          type="button"
          role="tab"
          id="exam-tab-morning"
          aria-controls="exam-panel-morning"
          aria-selected={activeTab === "morning"}
          tabIndex={activeTab === "morning" ? 0 : -1}
          onClick={() => setActiveTab("morning")}
          onKeyDown={handleTabKeyDown}
          className="admin-tab"
          data-active={activeTab === "morning"}
        >
          아침 모의고사
        </button>
        <button
          type="button"
          role="tab"
          id="exam-tab-regular"
          aria-controls="exam-panel-regular"
          aria-selected={activeTab === "regular"}
          tabIndex={activeTab === "regular" ? 0 : -1}
          onClick={() => setActiveTab("regular")}
          onKeyDown={handleTabKeyDown}
          className="admin-tab"
          data-active={activeTab === "regular"}
        >
          정기 모의고사
        </button>
      </div>

      <div
        role="tabpanel"
        id="exam-panel-morning"
        aria-labelledby="exam-tab-morning"
        hidden={activeTab !== "morning"}
        className="mt-6"
      >
        {morningContent}
      </div>
      <div
        role="tabpanel"
        id="exam-panel-regular"
        aria-labelledby="exam-tab-regular"
        hidden={activeTab !== "regular"}
        className="mt-6"
      >
        {regularContent}
      </div>
    </div>
  );
}
