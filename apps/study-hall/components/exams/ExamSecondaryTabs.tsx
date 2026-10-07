"use client";

import { useId, useState } from "react";
import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { MobileWorkspaceScope } from "@/components/ui/MobileWorkspaceTools";
import { ExamImportWizard } from "@/components/exams/import/ExamImportWizard";
import { ExamScoreManager } from "@/components/exams/ExamScoreManager";
import { MorningExamScoreManager } from "@/components/exams/MorningExamScoreManager";
import type {
  ExamImportResult,
  ExamImportSelection,
} from "@/lib/exam-import-types";
import type { ExamTypeItem } from "@/lib/services/exam.service";

type Props = {
  divisionSlug: string;
  category: ExamImportSelection["category"];
  examTypes: ExamTypeItem[];
  initialSelection?: Record<string, string>;
};

export function ExamSecondaryTabs({
  divisionSlug,
  category,
  examTypes,
  initialSelection = {},
}: Props) {
  const idPrefix = useId();
  // 성적 입력 탭 안의 3차 구분. 분석(반 전체·학생별)은 1차 탭 `성적 분석`으로 옮겼다(DESIGN.md 0절 13항).
  const [active, setActive] = useState<"input" | "weekly" | "import">(
    initialSelection.view === "import" ? "import" : initialSelection.view === "weekly" && category === "MORNING" ? "weekly" : "input",
  );
  const [scoreVersion, setScoreVersion] = useState(0);
  const [lastImport, setLastImport] = useState<ExamImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-flat-page admin-compact-workspace">
      <AdminTabs
        variant="secondary"
        className="admin-subtabs-underline"
        label={
          category === "MORNING" ? "아침 모의고사 작업" : "정기 모의고사 작업"
        }
        idPrefix={idPrefix}
        activeId={active}
        onChange={setActive}
        items={[
          {
            id: "input",
            label: category === "MORNING" ? "일일 입력" : "입력",
            disabled: busy,
          },
          ...(category === "MORNING"
            ? [{ id: "weekly" as const, label: "주간 현황", disabled: busy }]
            : []),
          { id: "import", label: "가져오기" },
        ]}
      />
      {category === "REGULAR" ? (
        <AdminTabPanel id="input" activeId={active} idPrefix={idPrefix}>
          <MobileWorkspaceScope active={active === "input"}>
            {/* Existing managers fetch into local state; refresh alone does not reload it. */}
            <ExamScoreManager
              key={scoreVersion}
              divisionSlug={divisionSlug}
              initialExamTypes={examTypes}
              initialSelection={
                lastImport
                  ? {
                      examTypeId: lastImport.examTypeId,
                      examDate: lastImport.examDate,
                    }
                  : undefined
              }
            />
          </MobileWorkspaceScope>
        </AdminTabPanel>
      ) : (
        <div hidden={active !== "input" && active !== "weekly"}>
          <MobileWorkspaceScope
            active={active === "input" || active === "weekly"}
          >
            <MorningExamScoreManager
              key={scoreVersion}
              divisionSlug={divisionSlug}
              morningExamTypes={examTypes}
              viewTab={active === "weekly" ? "weekly" : "daily"}
              idPrefix={idPrefix}
              initialSelection={
                lastImport
                  ? {
                      examTypeId: lastImport.examTypeId,
                      subjectId: lastImport.subjectId ?? undefined,
                      examDate: lastImport.examDate,
                    }
                  : undefined
              }
            />
          </MobileWorkspaceScope>
        </div>
      )}
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
    </div>
  );
}
