import { AdminRole, NoticeTargetType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { deleteNotice, getNotice, updateNotice } from "@/lib/notices/service";

type RouteContext = {
  params: {
    id: string;
  };
};

type RequestBody = {
  title?: string;
  content?: string;
  targetType?: NoticeTargetType;
  isPinned?: boolean;
};

function parseNoticeId(value: string) {
  const noticeId = Number(value);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    throw new Error("Invalid notice id.");
  }

  return noticeId;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const notice = await getNotice(parseNoticeId(context.params.id));

    if (!notice) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }

    return NextResponse.json({ notice });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch notice." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const notice = await updateNotice({
      adminId: auth.context.adminUser.id,
      noticeId: parseNoticeId(context.params.id),
      payload: {
        title: String(body.title ?? ""),
        content: String(body.content ?? ""),
        targetType: body.targetType ?? NoticeTargetType.ALL,
        isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ notice });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update notice.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteNotice({
      adminId: auth.context.adminUser.id,
      noticeId: parseNoticeId(context.params.id),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete notice.",
      },
      { status: 400 },
    );
  }
}
