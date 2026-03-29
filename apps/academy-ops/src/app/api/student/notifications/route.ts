import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const notifications = await getPrisma().notificationLog.findMany({
    where: {
      examNumber: auth.student.examNumber,
    },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      channel: true,
      message: true,
      status: true,
      isRead: true,
      readAt: true,
      sentAt: true,
    },
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({
    data: {
      notifications,
      unreadCount,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { ids?: number[]; markAll?: boolean } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 파싱할 수 없습니다." }, { status: 400 });
  }

  const now = new Date();

  if (body.markAll === true) {
    await getPrisma().notificationLog.updateMany({
      where: {
        examNumber: auth.student.examNumber,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return NextResponse.json({ data: { success: true } });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.filter((id) => Number.isInteger(id) && id > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: "유효한 알림 ID가 없습니다." }, { status: 400 });
    }

    await getPrisma().notificationLog.updateMany({
      where: {
        id: { in: ids },
        examNumber: auth.student.examNumber,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return NextResponse.json({ data: { success: true } });
  }

  return NextResponse.json({ error: "ids 배열 또는 markAll: true 를 포함해야 합니다." }, { status: 400 });
}
