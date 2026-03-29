import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { pinNotice } from "@/lib/notices/service";

type RouteContext = {
  params: {
    id: string;
  };
};

type RequestBody = {
  isPinned?: boolean;
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
    const result = await pinNotice({
      adminId: auth.context.adminUser.id,
      noticeId: parseNoticeId(context.params.id),
      isPinned: Boolean(body.isPinned),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update notice pin status.",
      },
      { status: 400 },
    );
  }
}
