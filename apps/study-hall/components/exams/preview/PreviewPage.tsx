import { notFound } from "next/navigation";
import {
  requireDivisionAdminAccess,
  requireDivisionStudentAccess,
} from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { isExamPreviewEnabled } from "@/lib/exam-preview/gate";
import { listExamTypes } from "@/lib/services/exam.service";
import { getStudentDetail, listStudents } from "@/lib/services/student.service";
import {
  getDivisionFeatureSettings,
  getDivisionTheme,
} from "@/lib/services/settings.service";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { normalizeAnalysisSelection } from "@/lib/exam-preview/selection";
import { PreviewWorkspace } from "./PreviewWorkspace";

export type PreviewPageProps = {
  params: { division: string; studentId?: string };
  searchParams: Record<string, string | string[] | undefined>;
};
export async function PreviewPage({
  params,
  searchParams,
  mode,
  previewOnly = true,
}: { mode: "admin" | "student"; previewOnly?: boolean } & PreviewPageProps) {
  if (previewOnly && !isExamPreviewEnabled()) notFound();
  let studentId = params.studentId;
  if (mode === "admin")
    await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  else
    studentId = (await requireDivisionStudentAccess(params.division)).studentId;
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");
  const types = (await listExamTypes(params.division))
    .map((t) => ({ id: t.id, name: t.name, category: t.category }));
  const initial = normalizeAnalysisSelection(searchParams);
  const students =
    mode === "admin"
      ? (await listStudents(params.division)).map((s) => ({
          id: s.id,
          name: s.name,
          studentNumber: s.studentNumber,
        }))
      : [];
  const workspace = (
    <PreviewWorkspace
      division={params.division}
      mode={mode}
      studentId={studentId}
      types={types}
      students={students}
      initial={initial}
      preview={previewOnly}
    />
  );
  if (mode === "admin") return workspace;
  const [division, student, settings] = await Promise.all([
    getDivisionTheme(params.division),
    getStudentDetail(params.division, studentId!),
    getDivisionFeatureSettings(params.division),
  ]);
  return (
    <StudentPortalFrame
      division={{ ...division, slug: params.division }}
      student={student}
      current="exams"
      title={previewOnly ? "성적 분석 개선안 미리보기" : "성적 분석"}
      description="현재 성적과 다음 복습할 문항을 함께 확인하세요."
      attendanceEnabled={settings.featureFlags.attendanceManagement}
      pointsEnabled={settings.featureFlags.pointManagement}
      examsEnabled={settings.featureFlags.examManagement}
    >
      {workspace}
    </StudentPortalFrame>
  );
}
