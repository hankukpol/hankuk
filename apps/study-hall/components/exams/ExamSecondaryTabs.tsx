"use client";

import { useId, useState } from "react";
import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { ExamImportWizard } from "@/components/exams/import/ExamImportWizard";
import { ExamScoreManager } from "@/components/exams/ExamScoreManager";
import { MorningExamScoreManager } from "@/components/exams/MorningExamScoreManager";
import { MorningCohortAnalysis } from "@/components/exams/analysis/MorningCohortAnalysis";
import { RegularCohortAnalysis } from "@/components/exams/analysis/RegularCohortAnalysis";
import type { ExamImportResult, ExamImportSelection } from "@/lib/exam-import-types";
import type { ExamTypeItem } from "@/lib/services/exam.service";

type Props = {
  divisionSlug: string;
  category: ExamImportSelection["category"];
  examTypes: ExamTypeItem[];
};

export function ExamSecondaryTabs({ divisionSlug, category, examTypes }: Props) {
  const idPrefix = useId();
  const [active, setActive] = useState<"input" | "import" | "analysis">("input");
  const [scoreVersion, setScoreVersion] = useState(0);
  const [lastImport, setLastImport] = useState<ExamImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-flat-page">
      <AdminTabs
        variant="secondary"
        label={category === "MORNING" ? "아침 모의고사 작업" : "정기 모의고사 작업"}
        idPrefix={idPrefix}
        activeId={active}
        onChange={setActive}
        items={[
          { id: "input", label: "입력", disabled: busy },
          { id: "import", label: "가져오기" },
          { id: "analysis", label: "분석", disabled: busy },
        ]}
      />
      <AdminTabPanel id="input" activeId={active} idPrefix={idPrefix}>
        {/* Existing managers fetch into local state; refresh alone does not reload it. */}
        {category === "REGULAR" ? (
          <ExamScoreManager
            key={scoreVersion}
            divisionSlug={divisionSlug}
            initialExamTypes={examTypes}
            initialSelection={lastImport ? {
              examTypeId: lastImport.examTypeId,
              examDate: lastImport.examDate,
            } : undefined}
          />
        ) : (
          <MorningExamScoreManager
            key={scoreVersion}
            divisionSlug={divisionSlug}
            morningExamTypes={examTypes}
            initialSelection={lastImport ? {
              examTypeId: lastImport.examTypeId,
              subjectId: lastImport.subjectId ?? undefined,
              examDate: lastImport.examDate,
            } : undefined}
          />
        )}
      </AdminTabPanel>
      <AdminTabPanel id="import" activeId={active} idPrefix={idPrefix}>
        {active === "import" && (
          <ExamImportWizard
            key={`${divisionSlug}-${category}`}
            divisionSlug={divisionSlug}
            category={category}
            examTypes={examTypes}
            onBusyChange={setBusy}
            onImported={(result) => {
              setLastImport(result);
              setScoreVersion((version) => version + 1);
            }}
            onShowScores={() => setActive("input")}
            onDeleted={() => {
              setLastImport(null);
              setScoreVersion((version) => version + 1);
            }}
          />
        )}
      </AdminTabPanel>
      <AdminTabPanel id="analysis" activeId={active} idPrefix={idPrefix}>
        {active === "analysis" && category === "MORNING" && <MorningCohortAnalysis key={scoreVersion} divisionSlug={divisionSlug} examTypes={examTypes.filter((type) => type.category === "MORNING")} />}
        {active === "analysis" && category === "REGULAR" && <RegularCohortAnalysis key={scoreVersion} divisionSlug={divisionSlug} examTypes={examTypes.filter((type) => type.category === "REGULAR")} />}
      </AdminTabPanel>
    </div>
  );
}
