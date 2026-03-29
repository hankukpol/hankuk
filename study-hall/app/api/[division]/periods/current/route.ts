import { NextRequest, NextResponse } from "next/server";

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

  const period = await getCurrentPeriod(params.division);
  return NextResponse.json({ period }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
}
