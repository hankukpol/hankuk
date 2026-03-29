import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { tuitionPlanSchema } from "@/lib/tuition-schemas";
import { deleteTuitionPlan, updateTuitionPlan } from "@/lib/services/tuition-plan.service";

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
    "paymentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tuitionPlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "등록 플랜 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const plan = await updateTuitionPlan(params.division, params.id, parsed.data);
    return NextResponse.json({ plan });
  } catch (error) {
    return toApiErrorResponse(error, "등록 플랜 처리에 실패했습니다.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "paymentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const result = await deleteTuitionPlan(params.division, params.id);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, "등록 플랜 처리에 실패했습니다.");
  }
}
