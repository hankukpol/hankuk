import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { pointBatchSchema } from "@/lib/point-schemas";
import { createPointRecordsBatch } from "@/lib/services/point.service";

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
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pointBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "일괄 상벌점 입력값을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await createPointRecordsBatch(params.division, auth.session, parsed.data);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "일괄 상벌점 부여에 실패했습니다.");
  }
}
