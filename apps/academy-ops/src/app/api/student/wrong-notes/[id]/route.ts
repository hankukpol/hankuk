import { NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import {
  deleteStudentWrongNote,
  updateStudentWrongNote,
} from "@/lib/student-portal/service";

type RouteContext = {
  params: {
    id: string;
  };
};

type RequestBody = {
  memo?: string | null;
};

function parseNoteId(value: string) {
  const noteId = Number(value);

  if (!Number.isInteger(noteId) || noteId <= 0) {
    throw new Error("오답 노트 ID를 확인해 주세요.");
  }

  return noteId;
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const note = await updateStudentWrongNote({
      examNumber: auth.student.examNumber,
      noteId: parseNoteId(context.params.id),
      memo: body.memo ?? null,
    });

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오답 노트 수정에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteStudentWrongNote({
      examNumber: auth.student.examNumber,
      noteId: parseNoteId(context.params.id),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오답 노트 삭제에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}


