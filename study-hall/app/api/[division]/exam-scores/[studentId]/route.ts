import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { listStudentExamResults } from "@/lib/services/exam.service";

export async function GET(
  _request: Request,
  { params }: { params: { division: string; studentId: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

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

  const examFeatureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (examFeatureDisabledError) {
    return NextResponse.json({ error: examFeatureDisabledError }, { status: 403 });
  }

  try {
    const records = await listStudentExamResults(params.division, params.studentId);
    return NextResponse.json({ records }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "학생별 성적을 불러오는 중 오류가 발생했습니다.");
  }
}
