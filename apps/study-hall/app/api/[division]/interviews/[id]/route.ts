import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { interviewUpdateSchema } from "@/lib/interview-schemas";
import { updateInterview } from "@/lib/services/interview.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; id: string } },
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
  const parsed = interviewUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "면담 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const interview = await updateInterview(
      params.division,
      params.id,
      auth.session,
      parsed.data,
    );
    return NextResponse.json({ interview });
  } catch (error) {
    return toApiErrorResponse(error, "면담 기록 수정 중 오류가 발생했습니다.");
  }
}
