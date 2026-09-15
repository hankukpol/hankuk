import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { pointRuleSchema } from "@/lib/point-schemas";
import { listPointRules } from "@/lib/services/point.service";

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
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const rules = await listPointRules(params.division, { activeOnly });
    return NextResponse.json({ rules }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 규칙 처리 중 오류가 발생했습니다.");
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
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pointRuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "규칙 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    const config=await applyAcademyConfigurationEdit(params.division,"상벌점 규칙 추가",current=>({...current,pointRules:[...current.pointRules,{...parsed.data,description:parsed.data.description||null,isActive:parsed.data.isActive??true,displayOrder:current.pointRules.length,id:crypto.randomUUID()}]}),auth.session);
    const rule=(await listPointRules(params.division)).find(r=>r.id===config.pointRules.find(r=>r.name===parsed.data.name&&r.category===parsed.data.category)?.id);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 규칙 처리 중 오류가 발생했습니다.");
  }
}
