import {
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AdminRole,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createAdminMemo, listAdminMemos } from "@/lib/admin-memos/service";

type RequestBody = {
  title?: string;
  content?: string | null;
  color?: string;
  scope?: string;
  status?: string;
  isPinned?: boolean;
  dueAt?: string | null;
  assigneeId?: string | null;
  relatedStudentExamNumber?: string | null;
};

function parseEnumValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
) {
  if (!value) {
    return undefined;
  }

  return allowed.includes(value as T) ? (value as T) : undefined;
}

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const memos = await listAdminMemos(auth.context.adminUser.id);

  return NextResponse.json({ memos });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const memo = await createAdminMemo(
      {
        adminId: auth.context.adminUser.id,
        adminRole: auth.context.adminUser.role,
        ipAddress: request.headers.get("x-forwarded-for"),
      },
      {
        title: String(body.title ?? ""),
        content: body.content ?? null,
        color:
          parseEnumValue(body.color, Object.values(AdminMemoColor)) ??
          AdminMemoColor.SAND,
        scope:
          parseEnumValue(body.scope, Object.values(AdminMemoScope)) ??
          AdminMemoScope.PRIVATE,
        status:
          parseEnumValue(body.status, Object.values(AdminMemoStatus)) ??
          AdminMemoStatus.OPEN,
        isPinned: Boolean(body.isPinned),
        dueAt: body.dueAt ?? null,
        assigneeId: body.assigneeId ?? null,
        relatedStudentExamNumber: body.relatedStudentExamNumber ?? null,
      },
    );

    return NextResponse.json({ memo });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "운영 메모를 저장하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
