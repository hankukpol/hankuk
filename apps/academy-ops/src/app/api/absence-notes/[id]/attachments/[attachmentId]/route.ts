import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  ABSENCE_ATTACHMENT_LOCKED_MESSAGE,
  deleteAbsenceNoteAttachment,
} from "@/lib/absence-notes/service";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
    attachmentId: string;
  };
};

function parseIds(context: RouteContext) {
  return {
    noteId: Number(context.params.id),
    attachmentId: Number(context.params.attachmentId),
  };
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { noteId, attachmentId } = parseIds(context);

    if (!Number.isInteger(noteId) || noteId <= 0 || !Number.isInteger(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: "첨부 파일 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await deleteAbsenceNoteAttachment({
      adminId: auth.context.adminUser.id,
      noteId,
      attachmentId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "첨부 삭제에 실패했습니다.";
    const status = message === ABSENCE_ATTACHMENT_LOCKED_MESSAGE ? 409 : 400;
    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
