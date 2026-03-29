import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  ABSENCE_ATTACHMENT_LOCKED_MESSAGE,
  uploadAbsenceNoteAttachments,
} from "@/lib/absence-notes/service";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
  };
};

function parseNoteId(context: RouteContext) {
  return Number(context.params.id);
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const noteId = parseNoteId(context);

    if (!Number.isInteger(noteId) || noteId <= 0) {
      return NextResponse.json({ error: "사유서 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "첨부 파일을 선택해 주세요." }, { status: 400 });
    }

    const result = await uploadAbsenceNoteAttachments({
      adminId: auth.context.adminUser.id,
      noteId,
      files: await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          buffer: Buffer.from(await file.arrayBuffer()),
        })),
      ),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(
      { attachments: result.uploaded, failed: result.failed },
      { status: result.failed.length > 0 ? 207 : 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "첨부 업로드에 실패했습니다.";
    const status = message === ABSENCE_ATTACHMENT_LOCKED_MESSAGE ? 409 : 400;
    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
