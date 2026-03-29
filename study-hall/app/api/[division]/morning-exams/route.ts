import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { morningExamScoresBatchSchema } from "@/lib/morning-exam-schemas";
import {
  getMorningExamDailySheet,
  saveMorningExamScores,
} from "@/lib/services/morning-exam.service";

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
  const subjectId = url.searchParams.get("subjectId");
  const date = url.searchParams.get("date");

  if (!examTypeId || !subjectId || !date) {
    return NextResponse.json(
      { error: "examTypeId, subjectId, date 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const sheet = await getMorningExamDailySheet(
      params.division,
      examTypeId,
      subjectId,
      date,
    );
    return NextResponse.json(sheet);
  } catch (error) {
    return toApiErrorResponse(error, "아침모의고사 성적 조회 중 오류가 발생했습니다.");
  }
}

export async function POST(
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

  const body = await request.json().catch(() => null);
  const parsed = morningExamScoresBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "성적 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await saveMorningExamScores(
      params.division,
      { id: auth.session.id, role: auth.session.role },
      parsed.data,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toApiErrorResponse(error, "아침모의고사 성적 저장 중 오류가 발생했습니다.");
  }
}
