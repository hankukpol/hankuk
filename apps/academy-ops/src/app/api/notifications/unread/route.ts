import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { AdminRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/unread
 * 최근 알림 목록 + 미읽음 개수
 * lastReadAt 쿼리 파라미터(ISO string)를 기준으로 미읽음 카운트 계산
 * (NotificationLog에 readAt 필드가 없으므로 클라이언트 측 lastReadAt 기준 사용)
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const lastReadAtParam = request.nextUrl.searchParams.get("lastReadAt");
  const lastReadAt = lastReadAtParam ? new Date(lastReadAtParam) : null;

  const prisma = getPrisma();

  const notifications = await prisma.notificationLog.findMany({
    orderBy: { sentAt: "desc" },
    take: 10,
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
        },
      },
    },
  });

  const unreadCount = lastReadAt
    ? notifications.filter((n) => n.sentAt > lastReadAt).length
    : notifications.length;

  return NextResponse.json({
    data: {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        channel: n.channel,
        status: n.status,
        message: n.message,
        sentAt: n.sentAt.toISOString(),
        studentName: n.student?.name ?? null,
        examNumber: n.examNumber,
        isNew: lastReadAt ? n.sentAt > lastReadAt : true,
      })),
      unreadCount,
    },
  });
}
