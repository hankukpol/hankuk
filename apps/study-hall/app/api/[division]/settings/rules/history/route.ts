import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { listDivisionSettingsHistory } from "@/lib/services/settings-history.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 10;

  try {
    const history = await listDivisionSettingsHistory(params.division, { limit });
    return NextResponse.json({ history });
  } catch (error) {
    return toApiErrorResponse(error, "운영 규칙 변경 이력을 불러오지 못했습니다.", 400);
  }
}
