import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listAuditLogs } from "@/lib/audit-log/service";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const rows = await listAuditLogs({
    admin: searchParams.get("admin") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    examNumber: searchParams.get("examNumber") ?? undefined,
  });

  return NextResponse.json({ rows });
}
