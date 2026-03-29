import { AdminMemoColor, AdminMemoScope, AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const memoInclude = {
  owner: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} as const;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ examNumber: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber } = await context.params;

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { examNumber: true },
  });
  if (!student) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  const viewerId = auth.context.adminUser.id;

  const memos = await getPrisma().adminMemo.findMany({
    where: {
      relatedStudentExamNumber: examNumber,
      OR: [
        { scope: AdminMemoScope.TEAM },
        { ownerId: viewerId },
        { assigneeId: viewerId },
      ],
    },
    include: memoInclude,
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  const data = memos.map((m) => ({
    id: m.id,
    title: m.title,
    content: m.content,
    color: m.color,
    scope: m.scope,
    status: m.status,
    isPinned: m.isPinned,
    dueAt: m.dueAt ? m.dueAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    owner: m.owner,
    assignee: m.assignee,
  }));

  return NextResponse.json({ data });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examNumber: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber } = await context.params;

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { examNumber: true },
  });
  if (!student) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: {
    title?: string;
    content?: string | null;
    color?: AdminMemoColor;
    scope?: AdminMemoScope;
    dueAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "메모 제목을 입력해 주세요." }, { status: 400 });
  }

  let dueAt: Date | null = null;
  if (body.dueAt) {
    const parsed = new Date(body.dueAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "마감일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    dueAt = parsed;
  }

  const memo = await getPrisma().adminMemo.create({
    data: {
      title,
      content: body.content?.trim() || null,
      color: body.color ?? AdminMemoColor.SAND,
      scope: body.scope ?? AdminMemoScope.PRIVATE,
      dueAt,
      relatedStudentExamNumber: examNumber,
      ownerId: auth.context.adminUser.id,
    },
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

  return NextResponse.json({ data }, { status: 201 });
}
