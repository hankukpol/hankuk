"use client";

import { type ReactNode, useState } from "react";

import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";

type ExamTabLayoutProps = {
  morningContent: ReactNode;
  regularContent: ReactNode;
  defaultTab?: "morning" | "regular";
};

const items = [
  { id: "morning", label: "아침 모의고사" },
  { id: "regular", label: "정기 모의고사" },
] as const;

export function ExamTabLayout({
  morningContent,
  regularContent,
  defaultTab = "morning",
}: ExamTabLayoutProps) {
  const [activeTab, setActiveTab] = useState<"morning" | "regular">(defaultTab);

  return (
    /* DESIGN.md 5.5 — 화면 이동(성적 상세)은 1차 폴더 탭이 담당하므로,
       그 안의 시험 종류 구분은 2차 밑줄 탭이다. 폴더 줄을 두 번 쌓지 않는다. */
    <div>
      <AdminTabs
        items={items}
        activeId={activeTab}
        onChange={setActiveTab}
        label="시험 종류"
        idPrefix="exam-tab"
        variant="secondary"
      />

      <AdminTabPanel id="morning" activeId={activeTab} idPrefix="exam-tab" className="mt-6">
        {morningContent}
      </AdminTabPanel>
      <AdminTabPanel id="regular" activeId={activeTab} idPrefix="exam-tab" className="mt-6">
        {regularContent}
      </AdminTabPanel>
    </div>
  );
}
