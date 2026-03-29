import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getMorningExamWeeklySummary } from "@/lib/services/morning-exam.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN", "ASSISTANT"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const url = new URL(request.url);
  const examTypeId = url.searchParams.get("examTypeId");
  const weekYearStr = url.searchParams.get("weekYear");
  const weekNumberStr = url.searchParams.get("weekNumber");

  if (!examTypeId || !weekYearStr || !weekNumberStr) {
    return NextResponse.json(
      { error: "examTypeId, weekYear, weekNumber 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const weekYear = Number(weekYearStr);
  const weekNumber = Number(weekNumberStr);

  if (!Number.isInteger(weekYear) || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) {
    return NextResponse.json(
      { error: "주차 정보가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const summary = await getMorningExamWeeklySummary(
      params.division,
      examTypeId,
      weekYear,
      weekNumber,
    );
    return NextResponse.json(summary);
  } catch (error) {
    return toApiErrorResponse(error, "주간 성적 집계 조회 중 오류가 발생했습니다.");
  }
}
