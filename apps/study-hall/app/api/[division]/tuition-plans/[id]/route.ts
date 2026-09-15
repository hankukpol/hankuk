import { notFound } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { tuitionPlanSchema } from "@/lib/tuition-schemas";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";

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
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"등록 플랜 변경",current=>{
      if(!current.tuitionPlans.some(p=>p.id===params.id))throw notFound("등록 플랜을 찾을 수 없습니다.");
      return {...current,tuitionPlans:current.tuitionPlans.map(p=>p.id===params.id?{...p,...parsed.data}:p)};
    },auth.session);
    const plan=(await listTuitionPlans(params.division)).find(p=>p.id===params.id);
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
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"등록 플랜 비활성화",current=>{
      if(!current.tuitionPlans.some(p=>p.id===params.id))throw notFound("등록 플랜을 찾을 수 없습니다.");
      return {...current,tuitionPlans:current.tuitionPlans.map(p=>p.id===params.id?{...p,isActive:false}:p)};
    },auth.session);
    const result={id:params.id,isActive:false};
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, "등록 플랜 처리에 실패했습니다.");
  }
}
