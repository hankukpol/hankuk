import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { cancelLeavePermission } from "@/lib/services/leave.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "leaveManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const permission = await cancelLeavePermission(params.division, params.id, auth.session);
    return NextResponse.json({ permission });
  } catch (error) {
    return toApiErrorResponse(error, "외출/휴가 승인 취소 처리에 실패했습니다.");
  }
}
