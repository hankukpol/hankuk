import {
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AdminRole,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { deleteAdminMemo, updateAdminMemo } from "@/lib/admin-memos/service";
import { requireApiAdmin } from "@/lib/api-auth";

type RouteContext = {
  params: {
    id: string;
  };
};

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

function parseMemoId(value: string) {
  const memoId = Number(value);

  if (!Number.isInteger(memoId) || memoId <= 0) {
    throw new Error("잘못된 메모 번호입니다.");
  }

  return memoId;
}

function parseEnumValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
) {
  if (!value) {
    return undefined;
  }

  return allowed.includes(value as T) ? (value as T) : undefined;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const memo = await updateAdminMemo(
      {
        adminId: auth.context.adminUser.id,
        adminRole: auth.context.adminUser.role,
        ipAddress: request.headers.get("x-forwarded-for"),
      },
      parseMemoId(context.params.id),
      {
        title: body.title,
        content: body.content,
        color: parseEnumValue(body.color, Object.values(AdminMemoColor)),
        scope: parseEnumValue(body.scope, Object.values(AdminMemoScope)),
        status: parseEnumValue(body.status, Object.values(AdminMemoStatus)),
        isPinned: body.isPinned,
        dueAt: body.dueAt,
        assigneeId: body.assigneeId,
        relatedStudentExamNumber: body.relatedStudentExamNumber,
      },
    );

    return NextResponse.json({ memo });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "운영 메모를 수정하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteAdminMemo(
      {
        adminId: auth.context.adminUser.id,
        adminRole: auth.context.adminUser.role,
        ipAddress: request.headers.get("x-forwarded-for"),
      },
      parseMemoId(context.params.id),
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "운영 메모를 삭제하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
