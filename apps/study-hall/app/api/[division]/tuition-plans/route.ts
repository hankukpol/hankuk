import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { tuitionPlanSchema } from "@/lib/tuition-schemas";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";

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
    "paymentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const plans = await listTuitionPlans(params.division, { activeOnly });
    return NextResponse.json({ plans }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } });
  } catch (error) {
    return toApiErrorResponse(error, "등록 플랜 처리에 실패했습니다.");
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
    await applyAcademyConfigurationEdit(params.division,"등록 플랜 추가",current=>({...current,tuitionPlans:[...current.tuitionPlans,{...parsed.data,durationDays:parsed.data.durationDays??null,description:parsed.data.description??null,isActive:parsed.data.isActive??true,id:crypto.randomUUID(),displayOrder:current.tuitionPlans.length}]}),auth.session);
    const plan=(await listTuitionPlans(params.division)).find(p=>p.name===parsed.data.name);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "등록 플랜 처리에 실패했습니다.");
  }
}
