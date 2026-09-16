"use client";

import { useId, useState } from "react";
import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { MobileWorkspaceScope } from "@/components/ui/MobileWorkspaceTools";
import { ExamImportWizard } from "@/components/exams/import/ExamImportWizard";
import { ExamScoreManager } from "@/components/exams/ExamScoreManager";
import { MorningExamScoreManager } from "@/components/exams/MorningExamScoreManager";
import { PreviewWorkspace } from "@/components/exams/preview/PreviewWorkspace";
import type {
  ExamImportResult,
  ExamImportSelection,
} from "@/lib/exam-import-types";
import type { ExamTypeItem } from "@/lib/services/exam.service";

type Props = {
  divisionSlug: string;
  category: ExamImportSelection["category"];
  examTypes: ExamTypeItem[];
  students?: { id: string; name: string; studentNumber: string }[];
  initialSelection?: Record<string, string>;
};

export function ExamSecondaryTabs({
  divisionSlug,
  category,
  examTypes,
  students = [],
  initialSelection = {},
}: Props) {
  const idPrefix = useId();
  // 분석은 반 단위와 학생 단위로 나눈다. 한 화면에 13개 섹션을 쌓지 않기 위한 분리이며
  // DESIGN.md 5.5 가 3차 탭 줄을 금지하므로 2차 탭을 넓히는 방식으로 처리한다.
  const [active, setActive] = useState<
    "input" | "weekly" | "import" | "cohort" | "students"
  >(
    initialSelection.view === "students"
      ? "students"
      : initialSelection.view === "analysis"
        ? "cohort"
        : "input",
  );
  const analysisView: "cohort" | "students" =
    active === "students" ? "students" : "cohort";
  const showAnalysis = active === "cohort" || active === "students";
  const [scoreVersion, setScoreVersion] = useState(0);
  const [lastImport, setLastImport] = useState<ExamImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-flat-page admin-compact-workspace">
      <AdminTabs
        variant="secondary"
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
          { id: "cohort", label: "반 분석", disabled: busy },
          { id: "students", label: "학생별", disabled: busy },
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
      {/* 반 분석과 학생별은 같은 조회 결과를 나눠 보여준다. 한 인스턴스를 유지해
          탭을 오갈 때 분석을 다시 불러오지 않는다. */}
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${analysisView}`}
        aria-labelledby={`${idPrefix}-${analysisView}`}
        hidden={!showAnalysis}
      >
        {showAnalysis && (
          <PreviewWorkspace
            key={scoreVersion}
            division={divisionSlug}
            mode="admin"
            types={examTypes}
            students={students}
            initial={{
              ...initialSelection,
              kind: category === "MORNING" ? "morning" : "regular",
            }}
            embeddedKind={category === "MORNING" ? "morning" : "regular"}
            preview={false}
          />
        )}
      </div>
    </div>
  );
}
