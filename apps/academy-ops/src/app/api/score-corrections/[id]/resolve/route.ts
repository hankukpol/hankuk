import { AdminMemoStatus, AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

interface RouteContext {
  params: { id: string };
}

interface RequestBody {
  action: "resolve" | "dismiss";
  note?: string;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const id = Number(params.id);
  if (isNaN(id)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { action, note } = body;
  if (action !== "resolve" && action !== "dismiss") {
    return Response.json({ error: "action은 resolve 또는 dismiss여야 합니다." }, { status: 400 });
  }

  const prisma = getPrisma();
  const memo = await prisma.adminMemo.findFirst({
    where: {
      id,
      content: { contains: "[성적 오류 신고]" },
    },
    select: {
      id: true,
      status: true,
      relatedStudentExamNumber: true,
      relatedExamSessionId: true,
      ownerId: true,
    },
  });

  if (!memo) {
    return Response.json({ error: "성적 오류 신고 건을 찾을 수 없습니다." }, { status: 404 });
  }

  if (memo.status === AdminMemoStatus.DONE) {
    return Response.json({ error: "이미 처리 완료된 신고입니다." }, { status: 409 });
  }

  const newStatus = action === "resolve" ? AdminMemoStatus.DONE : AdminMemoStatus.OPEN;

  await prisma.adminMemo.update({
    where: { id },
    data: { status: newStatus },
  });

  if (note && note.trim()) {
    const prefix = action === "resolve" ? "[성적 오류 처리]" : "[성적 오류 반려]";
    await prisma.adminMemo.create({
      data: {
        title: `${prefix} 신고 #${id} 처리 메모`,
        content: `${prefix}\n\n원본 신고 ID: ${id}\n\n처리 내용:\n${note.trim()}`,
        relatedStudentExamNumber: memo.relatedStudentExamNumber,
        relatedExamSessionId: memo.relatedExamSessionId,
        ownerId: auth.context.adminUser.id,
        status: AdminMemoStatus.DONE,
      },
    });
  }

  return Response.json({ data: { ok: true, action, memoId: id } });
}