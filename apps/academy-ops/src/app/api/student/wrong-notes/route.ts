import { Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import {
  clearStudentWrongNotes,
  createStudentWrongNote,
  listStudentWrongNotes,
} from "@/lib/student-portal/service";

type RequestBody = {
  questionId?: number;
  memo?: string | null;
};

function parseSubject(value: string | null) {
  if (!value) {
    return undefined;
  }

  return Object.values(Subject).includes(value as Subject)
    ? (value as Subject)
    : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const notes = await listStudentWrongNotes({
      examNumber: auth.student.examNumber,
      subject: parseSubject(request.nextUrl.searchParams.get("subject")),
      startDate: request.nextUrl.searchParams.get("startDate") ?? undefined,
      endDate: request.nextUrl.searchParams.get("endDate") ?? undefined,
    });

    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오답 노트를 불러오지 못했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const note = await createStudentWrongNote({
      examNumber: auth.student.examNumber,
      questionId: Number(body.questionId ?? 0),
      memo: body.memo ?? null,
    });

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오답 노트 저장에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await clearStudentWrongNotes({
      examNumber: auth.student.examNumber,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오답 노트를 삭제하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}

