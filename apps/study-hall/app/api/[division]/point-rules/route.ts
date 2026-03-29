import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { pointRuleSchema } from "@/lib/point-schemas";
import { createPointRule, listPointRules } from "@/lib/services/point.service";

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
    const rule = await createPointRule(params.division, parsed.data);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 규칙 처리 중 오류가 발생했습니다.");
  }
}
