import { AdminRole, NotificationChannel } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { retryNotificationLog } from "@/lib/notifications/service";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ logId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { logId: logIdParam } = await context.params;
  const notificationLogId = parseInt(logIdParam, 10);

  if (!Number.isInteger(notificationLogId) || notificationLogId <= 0) {
    return NextResponse.json({ error: "유효하지 않은 알림 ID입니다." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();

    // Fetch the log to check its channel
    const log = await prisma.notificationLog.findUnique({
      where: { id: notificationLogId },
      select: { id: true, status: true, channel: true },
    });

    if (!log) {
      return NextResponse.json({ error: "알림 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    if (log.status !== "failed") {
      return NextResponse.json(
        { error: "실패 상태의 알림만 재발송할 수 있습니다." },
        { status: 400 }
      );
    }

    // WEB_PUSH / IN_APP: just mark as sent (no actual resend)
    if (
      log.channel === NotificationChannel.WEB_PUSH
    ) {
      await prisma.notificationLog.update({
        where: { id: notificationLogId },
        data: { status: "sent", failReason: null },
      });

      return NextResponse.json({
        data: { success: true, newStatus: "sent" },
      });
    }

    // KAKAO_ALIMTALK / SMS: use the real retry logic
    const result = await retryNotificationLog({
      adminId: auth.context.adminUser.id,
      notificationLogId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    const newStatus = result.log.status;

    return NextResponse.json({
      data: {
        success: newStatus === "sent",
        newStatus,
        sourceLogId: result.sourceLogId,
        retryLogId: result.log.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "재발송에 실패했습니다.",
      },
      { status: 400 }
    );
  }
}
