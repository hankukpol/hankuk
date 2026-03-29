import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getScoreSourceStats } from "@/lib/scores/stats";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const periodId = Number(request.nextUrl.searchParams.get("periodId"));

  if (!Number.isInteger(periodId) || periodId <= 0) {
    return NextResponse.json({ error: "Select an exam period." }, { status: 400 });
  }

  try {
    const stats = await getScoreSourceStats(periodId);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load score source stats.",
      },
      { status: 400 },
    );
  }
}
