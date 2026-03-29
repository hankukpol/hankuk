import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { staffPasswordResetSchema } from "@/lib/division-staff-schemas";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { resetDivisionStaffPassword } from "@/lib/services/division-staff.service";

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
    "staffManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = staffPasswordResetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "비밀번호 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const division = await getDivisionBySlug(params.division);
    if (!division) {
      return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await resetDivisionStaffPassword(division.id, params.id, parsed.data.password);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, "비밀번호 변경에 실패했습니다.");
  }
}
