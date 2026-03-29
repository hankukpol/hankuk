import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { staffUpdateSchema } from "@/lib/division-staff-schemas";
import { getDivisionBySlug } from "@/lib/services/division.service";
import {
  deleteDivisionStaff,
  permanentDeleteDivisionStaff,
  updateDivisionStaff,
} from "@/lib/services/division-staff.service";

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
  const parsed = staffUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "입력값을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const division = await getDivisionBySlug(params.division);
    if (!division) {
      return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
    }

    const staff = await updateDivisionStaff(division.id, params.id, parsed.data);
    return NextResponse.json({ staff });
  } catch (error) {
    return toApiErrorResponse(error, "직원 정보 수정에 실패했습니다.");
  }
}

export async function DELETE(
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

  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  try {
    const division = await getDivisionBySlug(params.division);
    if (!division) {
      return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = permanent
      ? await permanentDeleteDivisionStaff(division.id, params.id)
      : await deleteDivisionStaff(division.id, params.id);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, permanent ? "직원 삭제에 실패했습니다." : "직원 비활성화에 실패했습니다.");
  }
}
