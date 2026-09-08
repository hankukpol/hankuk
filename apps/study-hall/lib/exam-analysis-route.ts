import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, requireStudentApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { examAnalysisQuerySchema, examAnalysisSessionsQuerySchema } from "@/lib/exam-analysis-schemas";
import { getRegularCohortAnalysis, getRegularStudentReport, listRegularSessions } from "@/lib/services/exam-analysis.service";

export const ANALYSIS_HEADERS = { "Cache-Control": "private, no-store" };
export async function authorizeExamAnalysis(division: string, studentId?: string) {
  const admin = await requireApiAuth(division, ["ADMIN", "SUPER_ADMIN"]);
  if (admin.ok) return { ok: true as const, viewer: { role: admin.session.role } };
  if (!studentId || admin.status === 503) return admin;
  const student = await requireStudentApiAuth(division);
  if (!student.ok) return admin.status === 403 ? admin : student;
  if (student.session.studentId !== studentId) return { ok: false as const, status: 403, error: "본인의 성적만 조회할 수 있습니다." };
  return { ok: true as const, viewer: { role: "STUDENT" as const, studentId: student.session.studentId } };
}

export async function handleRegularAnalysis(request: NextRequest, division: string, kind: "cohort" | "sessions" | "student", studentId?: string) {
  try {
    const auth = await authorizeExamAnalysis(division, kind === "student" ? studentId : undefined);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: ANALYSIS_HEADERS });
    const disabled = await getDivisionFeatureDisabledError(division, "examManagement");
    if (disabled) return NextResponse.json({ error: disabled }, { status: 403, headers: ANALYSIS_HEADERS });
    const input = Object.fromEntries(request.nextUrl.searchParams);
    if (kind === "sessions") {
      const query = examAnalysisSessionsQuerySchema.parse(input);
      return NextResponse.json({ sessions: await listRegularSessions(division, query.examTypeId) }, { headers: ANALYSIS_HEADERS });
    }
    const query = examAnalysisQuerySchema.parse(input);
    if (kind === "student" && studentId) return NextResponse.json({ report: await getRegularStudentReport(division, query.examTypeId, query.examDate, studentId, auth.viewer) }, { headers: ANALYSIS_HEADERS });
    return NextResponse.json({ analysis: await getRegularCohortAnalysis(division, query.examTypeId, query.examDate) }, { headers: ANALYSIS_HEADERS });
  } catch (error) {
    return toApiErrorResponse(error, "성적 분석을 불러오지 못했습니다.", 500);
  }
}
