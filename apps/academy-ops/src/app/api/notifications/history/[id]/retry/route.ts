import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { retryNotificationLog } from "@/lib/notifications/service";

type RouteContext = {
  params: { id: string };
};

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const notificationLogId = parseInt(params.id, 10);

  if (!Number.isInteger(notificationLogId) || notificationLogId <= 0) {
    return NextResponse.json({ error: "유효하지 않은 알림 ID입니다." }, { status: 400 });
  }

  try {
    const result = await retryNotificationLog({
      adminId: auth.context.adminUser.id,
      notificationLogId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "재발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
