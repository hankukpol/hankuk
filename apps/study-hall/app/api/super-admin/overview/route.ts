import { NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { getSuperAdminOverview } from "@/lib/services/super-admin-overview.service";

export async function GET(request: Request) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const forceFresh = new URL(request.url).searchParams.has("refresh");
    const divisions = await getSuperAdminOverview({ forceFresh });
    return NextResponse.json(
      { divisions },
      {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
