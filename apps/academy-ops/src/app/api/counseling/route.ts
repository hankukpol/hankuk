import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  createCounselingRecord,
  getCounselingProfile,
  listCounselingStudents,
} from "@/lib/counseling/service";

type RequestBody = {
  examNumber?: string;
  counselorName?: string;
  content?: string;
  recommendation?: string | null;
  counseledAt?: string;
  nextSchedule?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const examNumber = searchParams.get("examNumber");

  if (examNumber) {
    const profile = await getCounselingProfile(examNumber);
    return NextResponse.json({ profile });
  }

  const students = await listCounselingStudents({
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  return NextResponse.json({ students });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const record = await createCounselingRecord({
      adminId: auth.context.adminUser.id,
      payload: {
        examNumber: String(body.examNumber ?? ""),
        counselorName: String(body.counselorName ?? ""),
        content: String(body.content ?? ""),
        recommendation: body.recommendation ?? null,
        counseledAt: new Date(String(body.counseledAt ?? "")),
        nextSchedule: body.nextSchedule ? new Date(body.nextSchedule) : null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "면담 기록 저장에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
