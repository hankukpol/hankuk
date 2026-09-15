import { notFound } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { pointRuleSchema } from "@/lib/point-schemas";
import { listPointRules } from "@/lib/services/point.service";

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
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pointRuleSchema.partial().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "규칙 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"상벌점 규칙 변경",current=>{
      if(!current.pointRules.some(r=>r.id===params.id))throw notFound("규칙을 찾을 수 없습니다.");
      return {...current,pointRules:current.pointRules.map(r=>r.id===params.id?{...r,...parsed.data}:r)};
    },auth.session);
    const rule=(await listPointRules(params.division)).find(r=>r.id===params.id);
    return NextResponse.json({ rule });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 규칙 처리 중 오류가 발생했습니다.");
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
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"상벌점 규칙 비활성화",current=>{
      if(!current.pointRules.some(r=>r.id===params.id))throw notFound("규칙을 찾을 수 없습니다.");
      return {...current,pointRules:current.pointRules.map(r=>r.id===params.id?{...r,isActive:false}:r)};
    },auth.session);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 규칙 처리 중 오류가 발생했습니다.");
  }
}
