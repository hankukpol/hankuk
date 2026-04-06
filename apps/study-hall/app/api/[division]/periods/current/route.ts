import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getCurrentPeriod } from "@/lib/services/period.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "ASSISTANT", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const period = await getCurrentPeriod(params.division);
    return NextResponse.json(
      { period },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "현재 교시를 불러오지 못했습니다.");
  }
}
