import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { interviewTaskUpdateSchema } from "@/lib/interview-schemas";
import { updateInterviewTask } from "@/lib/services/interview.service";

/** 학습 면담 할 일 하나의 상태·학생 공개 여부·확인 메모. 같은 학원의 할 일만 바꾼다. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; taskId: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "interviewManagement");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = interviewTaskUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "할 일 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const task = await updateInterviewTask(params.division, params.taskId, auth.session, parsed.data);
    return NextResponse.json({ task });
  } catch (error) {
    return toApiErrorResponse(error, "할 일 수정 중 오류가 발생했습니다.");
  }
}
