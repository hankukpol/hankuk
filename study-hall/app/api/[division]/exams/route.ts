import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examScoresBatchSchema } from "@/lib/exam-schemas";
import { getExamScoreSheet, saveExamScores } from "@/lib/services/exam.service";

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
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const examTypeId = request.nextUrl.searchParams.get("examTypeId");
  const examRound = Number(request.nextUrl.searchParams.get("examRound") ?? "1");

  if (!examTypeId || Number.isNaN(examRound) || examRound < 1) {
    return NextResponse.json(
      { error: "시험 템플릿과 회차를 다시 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const sheet = await getExamScoreSheet(params.division, examTypeId, examRound);
    return NextResponse.json({ sheet }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "성적 처리 중 오류가 발생했습니다.");
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
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = examScoresBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "성적 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const sheet = await saveExamScores(params.division, auth.session, parsed.data);
    return NextResponse.json({ sheet });
  } catch (error) {
    return toApiErrorResponse(error, "성적 처리 중 오류가 발생했습니다.");
  }
}
