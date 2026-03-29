import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { seatAssignSchema } from "@/lib/seat-schemas";
import { assignStudentToSeat } from "@/lib/services/seat.service";

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
    "seatManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = seatAssignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "좌석 이동 정보를 다시 확인해 주세요.") },
      { status: 400 },
    );
  }

  try {
    const layout = await assignStudentToSeat(params.division, params.id, parsed.data.studentId);
    return NextResponse.json({ layout });
  } catch (error) {
    return toApiErrorResponse(error, "좌석 이동 처리에 실패했습니다.");
  }
}
