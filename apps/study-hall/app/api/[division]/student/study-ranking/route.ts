import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireStudentApiAuth } from "@/lib/api-auth";
import { getStudentStudyTimeRanking } from "@/lib/services/study-time.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireStudentApiAuth(params.division);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const month = request.nextUrl.searchParams.get("month");

  if (!month) {
    return NextResponse.json({ error: "month 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 형식이 올바르지 않습니다. (YYYY-MM)" }, { status: 400 });
  }

  try {
    const ranking = await getStudentStudyTimeRanking(
      params.division,
      auth.session.studentId,
      month,
    );

    return NextResponse.json(
      { ranking },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "학습시간 랭킹을 불러오는 중 오류가 발생했습니다.");
  }
}
