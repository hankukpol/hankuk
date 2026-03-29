import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { retryNotificationLog } from "@/lib/notifications/service";

type RequestBody = {
  notificationLogId?: number | string;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const notificationLogId = Number(body.notificationLogId);

    if (!Number.isInteger(notificationLogId)) {
      return NextResponse.json(
        { error: "재시도할 알림 이력을 선택해 주세요." },
        { status: 400 },
      );
    }

    const result = await retryNotificationLog({
      adminId: auth.context.adminUser.id,
      notificationLogId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "알림 재시도에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}