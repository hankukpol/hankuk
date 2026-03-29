import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { publishNotice } from "@/lib/notices/service";

type RouteContext = {
  params: {
    id: string;
  };
};

type RequestBody = {
  isPublished?: boolean;
  sendNotification?: boolean;
};

function parseNoticeId(value: string) {
  const noticeId = Number(value);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    throw new Error("Invalid notice id.");
  }

  return noticeId;
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const result = await publishNotice({
      adminId: auth.context.adminUser.id,
      noticeId: parseNoticeId(context.params.id),
      isPublished: Boolean(body.isPublished),
      sendNotification: Boolean(body.sendNotification),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update notice visibility.",
      },
      { status: 400 },
    );
  }
}
