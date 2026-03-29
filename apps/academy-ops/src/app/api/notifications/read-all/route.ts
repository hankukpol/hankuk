import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { AdminRole } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read-all
 * NotificationLog에 readAt 필드가 없으므로 현재 시각을 반환.
 * 클라이언트는 이 timestamp를 localStorage에 저장하여 미읽음 기준으로 사용.
 */
export async function POST() {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    data: {
      readAt: new Date().toISOString(),
    },
  });
}
