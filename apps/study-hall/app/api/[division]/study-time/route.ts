import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getStudentStudyTimeStats } from "@/lib/services/study-time.service";

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
    "studentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const studentId = searchParams.get("studentId");
  const month = searchParams.get("month"); // "YYYY-MM"

  if (!studentId || !month) {
    return NextResponse.json({ error: "studentId와 month 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 형식이 올바르지 않습니다. (YYYY-MM)" }, { status: 400 });
  }

  try {
    const stats = await getStudentStudyTimeStats(params.division, studentId, month);
    return NextResponse.json({ stats }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "학습 시간 통계 처리 중 오류가 발생했습니다.");
  }
}
