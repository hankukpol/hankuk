import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getInterviewScoreSignals } from "@/lib/services/interview-recommendation.service";

/** 면담 권장 대상의 성적 신호(과락·점수 하락). 반 전체 분석을 읽으므로 면담 화면이 뜬 뒤 따로 불러온다. */
export async function GET(
  _request: Request,
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

  try {
    const signals = await getInterviewScoreSignals(params.division);
    return NextResponse.json(
      { signals },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "성적 신호를 불러오지 못했습니다.");
  }
}
