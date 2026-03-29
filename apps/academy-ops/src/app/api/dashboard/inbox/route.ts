import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listDashboardInboxData } from "@/lib/dashboard/inbox";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const data = await listDashboardInboxData({
    includeFailedNotifications: auth.context.adminUser.role !== AdminRole.VIEWER,
  });
  return NextResponse.json(data);
}