import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { interviewSchema } from "@/lib/interview-schemas";
import { createInterview, listInterviews } from "@/lib/services/interview.service";
import { interviewScoreRange } from "@/lib/services/interview-study-context.service";
import { getStudyDiagnosisContext } from "@/lib/services/study-diagnosis.service";

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

  try {
    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get("status");
    const interviews = await listInterviews(params.division, {
      studentId: searchParams.get("studentId") || undefined,
      month: searchParams.get("month") || undefined,
      status: statusParam === "OPEN" || statusParam === "CLOSED" ? statusParam : undefined,
      followUpDue: searchParams.get("followUpDue") === "1",
    });
    return NextResponse.json({ interviews }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "면담 기록 처리 중 오류가 발생했습니다.");
  }
}

export async function POST(
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

  const body = await request.json().catch(() => null);
  const parsed = interviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "면담 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    // 학습 면담은 진단을 서버에서 다시 계산해 저장한다. 브라우저가 보낸 진단·기준 점수는 믿지 않는다.
    const study = parsed.data.category === "STUDY"
      ? (await getStudyDiagnosisContext(
          params.division,
          parsed.data.studentId,
          interviewScoreRange(parsed.data.diagnosisRange?.from, parsed.data.diagnosisRange?.to),
          parsed.data.reviews,
        )).study
      : undefined;
    const interview = await createInterview(params.division, auth.session, parsed.data, study);
    return NextResponse.json({ interview }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "면담 기록 처리 중 오류가 발생했습니다.");
  }
}
