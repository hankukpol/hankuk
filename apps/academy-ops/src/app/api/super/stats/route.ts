import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getSuperDashboardStats } from "@/lib/super-admin";

function readQueryParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stats = await getSuperDashboardStats({
    preset: readQueryParam(request, "preset"),
    from: readQueryParam(request, "from"),
    to: readQueryParam(request, "to"),
    month: readQueryParam(request, "month"),
  });

  return NextResponse.json({ data: stats });
}
