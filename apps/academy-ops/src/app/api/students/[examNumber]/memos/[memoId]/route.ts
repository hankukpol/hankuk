import { AdminMemoStatus, AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { roleAtLeast } from "@/lib/auth";

export const dynamic = "force-dynamic";

const memoInclude = {
  owner: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ examNumber: string; memoId: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber, memoId } = await context.params;
  const memoIdNum = Number(memoId);
  if (isNaN(memoIdNum)) {
    return NextResponse.json({ error: "잘못된 메모 ID입니다." }, { status: 400 });
  }

  const existing = await getPrisma().adminMemo.findUnique({
    where: { id: memoIdNum },
    include: memoInclude,
  });

  if (!existing || existing.relatedStudentExamNumber !== examNumber) {
    return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  }

  const adminId = auth.context.adminUser.id;
  const adminRole = auth.context.adminUser.role;

  // TEAM 메모는 누구나 수정, PRIVATE는 본인만
  const canEdit =
    roleAtLeast(adminRole, AdminRole.SUPER_ADMIN) ||
    existing.scope === "TEAM" ||
    existing.ownerId === adminId ||
    existing.assigneeId === adminId;

  if (!canEdit) {
    return NextResponse.json({ error: "이 메모를 수정할 권한이 없습니다." }, { status: 403 });
  }

  let body: { status?: AdminMemoStatus; title?: string; content?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "메모 제목을 입력해 주세요." }, { status: 400 });
    updateData.title = title;
  }
  if (body.content !== undefined) {
    updateData.content = body.content?.trim() || null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });
  }

  const memo = await getPrisma().adminMemo.update({
    where: { id: memoIdNum },
    data: updateData,
    include: memoInclude,
  });

  const data = {
    id: memo.id,
    title: memo.title,
    content: memo.content,
    color: memo.color,
    scope: memo.scope,
    status: memo.status,
    isPinned: memo.isPinned,
    dueAt: memo.dueAt ? memo.dueAt.toISOString() : null,
    createdAt: memo.createdAt.toISOString(),
    updatedAt: memo.updatedAt.toISOString(),
    owner: memo.owner,
    assignee: memo.assignee,
  };

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ examNumber: string; memoId: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber, memoId } = await context.params;
  const memoIdNum = Number(memoId);
  if (isNaN(memoIdNum)) {
    return NextResponse.json({ error: "잘못된 메모 ID입니다." }, { status: 400 });
  }

  const existing = await getPrisma().adminMemo.findUnique({
    where: { id: memoIdNum },
    select: { ownerId: true, relatedStudentExamNumber: true },
  });

  if (!existing || existing.relatedStudentExamNumber !== examNumber) {
    return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  }

  const adminId = auth.context.adminUser.id;
  const adminRole = auth.context.adminUser.role;
  const canDelete =
    roleAtLeast(adminRole, AdminRole.SUPER_ADMIN) || existing.ownerId === adminId;

  if (!canDelete) {
    return NextResponse.json({ error: "이 메모를 삭제할 권한이 없습니다." }, { status: 403 });
  }

  await getPrisma().adminMemo.delete({ where: { id: memoIdNum } });

  return NextResponse.json({ data: { success: true } });
}
