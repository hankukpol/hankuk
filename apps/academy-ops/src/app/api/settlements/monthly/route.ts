import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getMonthlySettlementData } from "@/lib/settlements/monthly";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const data = await getMonthlySettlementData(request.nextUrl.searchParams.get("month"));
  return NextResponse.json(data);
}
