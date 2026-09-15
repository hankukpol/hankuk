"use client";

import { type ReactNode, useState } from "react";

import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { MobileWorkspaceScope } from "@/components/ui/MobileWorkspaceTools";

type ExamTabLayoutProps = {
  morningContent: ReactNode;
  regularContent: ReactNode;
  defaultTab?: "morning" | "regular";
  variant?: "primary" | "secondary";
};

const items = [
  { id: "morning", label: "아침 모의고사" },
  { id: "regular", label: "정기 모의고사" },
] as const;

export function ExamTabLayout({
  morningContent,
  regularContent,
  defaultTab = "morning",
  variant = "primary",
}: ExamTabLayoutProps) {
  const [activeTab, setActiveTab] = useState<"morning" | "regular">(defaultTab);

  return (
    <div className="admin-compact-workspace">
      <AdminTabs
        items={items}
        activeId={activeTab}
        onChange={setActiveTab}
        label="시험 종류"
        idPrefix="exam-tab"
        variant={variant}
      />

      <AdminTabPanel id="morning" activeId={activeTab} idPrefix="exam-tab" className="mt-6 max-md:mt-0">
        <MobileWorkspaceScope active={activeTab === "morning"}>{morningContent}</MobileWorkspaceScope>
      </AdminTabPanel>
      <AdminTabPanel id="regular" activeId={activeTab} idPrefix="exam-tab" className="mt-6 max-md:mt-0">
        <MobileWorkspaceScope active={activeTab === "regular"}>{regularContent}</MobileWorkspaceScope>
      </AdminTabPanel>
    </div>
  );
}
