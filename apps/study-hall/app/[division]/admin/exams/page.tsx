import { redirect } from "next/navigation";

import { ExamRouteTabs } from "@/components/exams/ExamRouteTabs";
import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { ExamSecondaryTabs } from "@/components/exams/ExamSecondaryTabs";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamTypes } from "@/lib/services/exam.service";

type AdminExamsPageProps = {
  searchParams?: Record<string,string|string[]|undefined>;
  params: {
    division: string;
  };
};

export default async function AdminExamsPage({ params, searchParams = {} }: AdminExamsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");
  const examTypes = (await listExamTypes(params.division)).filter((examType) => examType.isActive);
  const initialSelection = Object.fromEntries(Object.entries(searchParams).filter((entry): entry is [string,string] => typeof entry[1] === "string"));
  // 예전 주소(성적 입력 화면 안의 반 분석·학생별 탭)는 성적 분석 탭으로 옮긴다. 북마크가 깨지지 않게 조건을 그대로 넘긴다.
  if (initialSelection.view === "analysis" || initialSelection.view === "students") {
    const query = new URLSearchParams({ kind: initialSelection.tab === "regular" ? "regular" : "morning" });
    for (const key of ["examTypeId", "examDate", "from", "to"]) if (initialSelection[key]) query.set(key, initialSelection[key]);
    if (initialSelection.view === "students") query.set("view", "students");
    redirect(`/${params.division}/admin/exams/analysis?${query}`);
  }
  const morningTypes = examTypes.filter((t) => t.category === "MORNING");
  const regularTypes = examTypes.filter((t) => t.category === "REGULAR");

  return (
    <div className="admin-flat-page">
      <section className="admin-section max-md:sr-only">
        <h1 className="admin-page-title">시험 성적</h1>
        <p className="admin-page-description">
          아침모의고사는 매일 1과목씩, 정기모의고사는 전과목을 한번에 입력합니다.
          직접 입력하거나 채점표와 문항분석표를 함께 가져올 수 있습니다.
        </p>
      </section>

      <ExamRouteTabs division={params.division} active="input" />

      <ExamTabLayout variant="secondary" defaultTab={initialSelection.tab === "regular" ? "regular" : "morning"}
        morningContent={
          <ExamSecondaryTabs initialSelection={initialSelection}
            key={`${params.division}-morning`}
            divisionSlug={params.division}
            category="MORNING"
            examTypes={morningTypes}
          />
        }
        regularContent={
          <ExamSecondaryTabs initialSelection={initialSelection}
            key={`${params.division}-regular`}
            divisionSlug={params.division}
            category="REGULAR"
            examTypes={regularTypes}
          />
        }
      />
    </div>
  );
}
