import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { parseExamSubjectUpdateInput } from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const id = Number(params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "과목 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const payload = parseExamSubjectUpdateInput((await request.json()) as Record<string, unknown>);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });
    }

    const prisma = getPrisma();
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.examSubject.findFirst({
        where: { id, academyId },
      });

      if (!before) {
        throw new Error("현재 지점에서 관리할 수 없는 시험 과목입니다.");
      }

      const updated = await tx.examSubject.update({
        where: { id },
        data: payload,
      });

      if (payload.displayName !== undefined && payload.displayName !== before.displayName) {
        const sessionIds = await tx.examSession.findMany({
          where: {
            examType: before.examType,
            subject: before.code,
            period: { academyId },
            OR: [{ displaySubjectName: before.displayName }, { displaySubjectName: null }],
          },
          select: { id: true },
        });

        if (sessionIds.length > 0) {
          await tx.examSession.updateMany({
            where: { id: { in: sessionIds.map((session) => session.id) } },
            data: { displaySubjectName: updated.displayName },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({ data: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 과목을 수정하지 못했습니다." },
      { status: 400 },
    );
  }
}
