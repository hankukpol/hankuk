import { NextRequest, NextResponse } from "next/server";
import { ANALYSIS_HEADERS, authorizeExamAnalysis } from "./exam-analysis-route";
import { getDivisionFeatureDisabledError } from "./division-feature-guard";
import { toApiErrorResponse } from "./api-error-response";
import { morningAnalysisQuerySchema } from "./morning-exam-analysis-schemas";
import { getMorningCohortAnalysis, getMorningStudentReport } from "./services/morning-exam-analysis.service";

export async function handleMorningAnalysis(request: NextRequest, division: string, studentId?: string) {
  try {
    const auth = await authorizeExamAnalysis(division, studentId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: ANALYSIS_HEADERS });
    const disabled = await getDivisionFeatureDisabledError(division, "examManagement");
    if (disabled) return NextResponse.json({ error: disabled }, { status: 403, headers: ANALYSIS_HEADERS });
    const { examTypeId, from, to } = morningAnalysisQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const range = { from, to };
    return NextResponse.json(studentId
      ? { report: await getMorningStudentReport(division, examTypeId, studentId, range, auth.viewer) }
      : { analysis: await getMorningCohortAnalysis(division, examTypeId, range) }, { headers: ANALYSIS_HEADERS });
  } catch (error) {
    const response = toApiErrorResponse(error, "아침 성적 분석을 불러오지 못했습니다.", 500);
    response.headers.set("Cache-Control", ANALYSIS_HEADERS["Cache-Control"]);
    return response;
  }
}
