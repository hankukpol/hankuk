import { AdminRole, Subject } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { updateStudentTargetScores } from "@/lib/counseling/service";

type RequestBody = {
  targetScores?: Partial<Record<Subject, number | string>>;
};

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const targetScores = Object.fromEntries(
      Object.entries(body.targetScores ?? {}).map(([subject, value]) => [
        subject,
        value === "" || value === null || value === undefined ? 0 : Number(value),
      ]),
    ) as Partial<Record<Subject, number>>;
    const updated = await updateStudentTargetScores({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      targetScores,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ targetScores: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "목표 점수 저장에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
