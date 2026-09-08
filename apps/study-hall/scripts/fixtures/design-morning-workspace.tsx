import { createRoot } from "react-dom/client";
import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { MorningExamScoreManager } from "@/components/exams/MorningExamScoreManager";
import type { ExamTypeItem } from "@/lib/services/exam.service";

const template: ExamTypeItem = {
  id: "ui-morning", divisionId: "ui-only", name: "UI 검증용 아침 모의고사", category: "MORNING",
  studyTrack: null, isActive: true, displayOrder: 1, createdAt: "2026-09-08", updatedAt: "2026-09-08",
  subjects: [{ id: "ui-subject", examTypeId: "ui-morning", name: "형사법", totalItems: 20, pointsPerItem: 5, maxScore: 100, displayOrder: 1, isActive: true }],
};
const host = document.createElement("div");
document.body.replaceChildren(host);
createRoot(host).render(
  <div className="admin-shell">
    <main className="admin-main admin-content-frame admin-flat-page">
      <h1 className="admin-page-title">아침 모의고사 UI 검증</h1>
      <ExamTabLayout morningContent={<MorningExamScoreManager divisionSlug="police" morningExamTypes={[template]} />} regularContent={<p>다른 시험 탭</p>} />
    </main>
  </div>,
);
