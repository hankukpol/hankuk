import { AdminRole, NoticeTargetType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createNotice, listNotices } from "@/lib/notices/service";

type RequestBody = {
  title?: string;
  content?: string;
  targetType?: NoticeTargetType;
};

function parseTargetType(value: string | null) {
  if (!value) {
    return undefined;
  }

  return Object.values(NoticeTargetType).includes(value as NoticeTargetType)
    ? (value as NoticeTargetType)
    : undefined;
}

function parsePublished(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const targetType = parseTargetType(request.nextUrl.searchParams.get("targetType"));
  const published = parsePublished(request.nextUrl.searchParams.get("published"));
  const notices = await listNotices({
    targetType,
    published,
  });

  return NextResponse.json({ notices });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const notice = await createNotice({
      adminId: auth.context.adminUser.id,
      payload: {
        title: String(body.title ?? ""),
        content: String(body.content ?? ""),
        targetType: body.targetType ?? NoticeTargetType.ALL,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ notice });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create notice.",
      },
      { status: 400 },
    );
  }
}
