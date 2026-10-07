import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { interviewScoreRange } from "@/lib/services/interview-study-context.service";
import { getStudyDiagnosisContext } from "@/lib/services/study-diagnosis.service";

/**
 * 면담 화면의 성적 요약과 학습 진단 초안·지난 할 일. 관리자만 쓴다. 기간은 상담 자료와 같은 기본 4주이며 아침 분석 상한(92일)으로 줄인다.
 * 학원 전체 문항을 읽는 조회라 면담 요약(/interviews/context)과 따로 불러온다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "interviewManagement");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const search = request.nextUrl.searchParams;
  const studentId = search.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "학생을 선택해 주세요." }, { status: 400 });
  }

  try {
    const range = interviewScoreRange(search.get("from") ?? undefined, search.get("to") ?? undefined);
    // study 는 저장 때 검사용(Set)이라 화면에 보내지 않는다.
    const { study: _study, ...context } = await getStudyDiagnosisContext(params.division, studentId, range);
    void _study;
    return NextResponse.json(
      { context },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "면담용 성적 요약을 불러오지 못했습니다.");
  }
}
