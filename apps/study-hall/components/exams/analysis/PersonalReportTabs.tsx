"use client";

import { Children, isValidElement, useId, useState, type ReactNode } from "react";
import { AdminTabs } from "@/components/ui/AdminTabs";

export type ReportSection = "overview" | "diagnosis" | "trend" | "subjects" | "items" | "rank" | "records";

const sections: { id: ReportSection; label: string }[] = [
  { id: "overview", label: "성적 요약" },
  { id: "diagnosis", label: "학습 진단" },
  { id: "trend", label: "성적 추이" },
  { id: "subjects", label: "과목 비교" },
  { id: "items", label: "문항 분석" },
  { id: "rank", label: "순위·목표" },
  { id: "records", label: "성적 기록" },
];

/** 탭을 바꿔도 문항 필터와 펼침 상태를 보존하고 전체 인쇄에 사용할 DOM을 유지한다. */
export function PersonalReportTabs({ children, section }: { children: ReactNode; section?: ReportSection }) {
  const prefix = useId();
  const [selected, setSelected] = useState<ReportSection>("overview");
  const active = section ?? selected;
  const nodes = Children.toArray(children);
  const group = (id: ReportSection) => nodes.filter(node =>
    isValidElement<{ "data-report-section"?: ReportSection }>(node) && node.props["data-report-section"] === id,
  );
  const items = sections.filter(item => group(item.id).length > 0);

  return <>
    {!section && <div data-report-navigation><AdminTabs variant="secondary" scrollable label="개인 성적 분석 항목" idPrefix={prefix} items={items} activeId={active} onChange={setSelected} /></div>}
    {items.map(item => <div key={item.id} id={`${prefix}-panel-${item.id}`} role="tabpanel" aria-labelledby={!section ? `${prefix}-${item.id}` : undefined} aria-label={section ? item.label : undefined} hidden={active !== item.id} data-report-panel className="admin-flat-page">
      {group(item.id)}
    </div>)}
  </>;
}
