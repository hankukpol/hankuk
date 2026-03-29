import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listNotificationCenterData } from "@/lib/notifications/service";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const data = await listNotificationCenterData({
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  return NextResponse.json(data);
}
