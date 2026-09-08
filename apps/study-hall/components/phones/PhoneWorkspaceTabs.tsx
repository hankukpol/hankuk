"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";

const PhoneSubmissionManager = dynamic(
  () => import("@/components/phones/PhoneSubmissionManager").then((module) => module.PhoneSubmissionManager),
  { loading: () => <p className="admin-help py-8">휴대폰 이력을 불러오는 중입니다.</p> },
);

export function PhoneWorkspaceTabs({ check, approval, divisionSlug, pointsEnabled }: {
  check: ReactNode;
  approval?: ReactNode;
  divisionSlug: string;
  pointsEnabled: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"check" | "history" | "approval">("check");
  const [historyOpened, setHistoryOpened] = useState(false);

  return (
    <div className="admin-flat-page">
      <AdminTabs
        items={[{ id: "check", label: "교시별 체크" }, { id: "history", label: "이력 조회" }, ...(approval ? [{ id: "approval" as const, label: "예외 사전승인" }] : [])]}
        activeId={activeTab}
        onChange={(next) => { setActiveTab(next); if (next === "history") setHistoryOpened(true); }}
        label="휴대폰 업무"
        idPrefix="phone-workspace"
      />
      <AdminTabPanel id="check" activeId={activeTab} idPrefix="phone-workspace">{check}</AdminTabPanel>
      <AdminTabPanel id="history" activeId={activeTab} idPrefix="phone-workspace">
        {historyOpened ? <PhoneSubmissionManager divisionSlug={divisionSlug} pointsEnabled={pointsEnabled} isActive={activeTab === "history"} /> : null}
      </AdminTabPanel>
      {approval && <AdminTabPanel id="approval" activeId={activeTab} idPrefix="phone-workspace">{approval}</AdminTabPanel>}
    </div>
  );
}
