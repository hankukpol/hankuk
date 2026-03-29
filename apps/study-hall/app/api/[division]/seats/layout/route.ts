import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { seatLayoutSchema } from "@/lib/seat-schemas";
import { saveSeatLayout } from "@/lib/services/seat.service";

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
    "seatManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = seatLayoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "좌석 배치 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const layout = await saveSeatLayout(params.division, parsed.data.roomId, parsed.data.seats);
    return NextResponse.json({ layout });
  } catch (error) {
    return toApiErrorResponse(error, "좌석 배치 저장에 실패했습니다.");
  }
}
