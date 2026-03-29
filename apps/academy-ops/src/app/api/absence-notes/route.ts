import {
  AbsenceCategory,
  AbsenceStatus,
  AdminRole,
  ExamType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  createAbsenceNote,
  listAbsenceNotes,
} from "@/lib/absence-notes/service";

type RequestBody = {
  examNumber?: string;
  sessionId?: number;
  reason?: string;
  absenceCategory?: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const periodId = searchParams.get("periodId");
  const data = await listAbsenceNotes({
    periodId: periodId ? Number(periodId) : undefined,
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
    status: (searchParams.get("status") as AbsenceStatus | null) ?? undefined,
    absenceCategory:
      (searchParams.get("absenceCategory") as AbsenceCategory | null) ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  return NextResponse.json({ notes: data });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const note = await createAbsenceNote({
      adminId: auth.context.adminUser.id,
      payload: {
        examNumber: String(body.examNumber ?? ""),
        sessionId: Number(body.sessionId ?? 0),
        reason: String(body.reason ?? ""),
        absenceCategory: body.absenceCategory ?? AbsenceCategory.OTHER,
        attendCountsAsAttendance: Boolean(body.attendCountsAsAttendance),
        attendGrantsPerfectAttendance: Boolean(body.attendGrantsPerfectAttendance),
        adminNote: body.adminNote ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "사유서 등록에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
