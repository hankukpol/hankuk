import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getInterviewContext } from "@/lib/services/interview-context.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "interviewManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const studentId = request.nextUrl.searchParams.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "학생을 선택해 주세요." }, { status: 400 });
  }

  try {
    const context = await getInterviewContext(params.division, studentId);
    return NextResponse.json(
      { context },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "면담 준비 정보를 불러오지 못했습니다.");
  }
}
