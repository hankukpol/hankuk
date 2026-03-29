import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

type RequestBody = {
  examNumbers?: unknown;
  isActive?: unknown;
};

function parseExamNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("학번을 하나 이상 선택해 주세요.");
  }
  const examNumbers = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (examNumbers.length === 0) {
    throw new Error("학번을 하나 이상 선택해 주세요.");
  }
  return examNumbers;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = (await request.json()) as RequestBody;
    const examNumbers = parseExamNumbers(body.examNumbers);

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive는 boolean이어야 합니다." }, { status: 400 });
    }

    const isActive = body.isActive;
    const db = getPrisma();

    const existing = await db.student.findMany({
      where: { examNumber: { in: examNumbers }, academyId },
      select: { examNumber: true, isActive: true },
    });

    const existingNumbers = new Set(existing.map((s) => s.examNumber));
    const notFound = examNumbers.filter((en) => !existingNumbers.has(en));

    if (notFound.length > 0) {
      return NextResponse.json(
        {
          error: `존재하지 않는 학생이 포함되어 있습니다: ${notFound.slice(0, 5).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const updateResult = await db.student.updateMany({
      where: { examNumber: { in: examNumbers }, academyId },
      data: { isActive },
    });

    await db.auditLog.create({
      data: {
        adminId: auth.context.adminUser.id,
        action: isActive ? "STUDENT_BULK_ACTIVATE" : "STUDENT_BULK_DEACTIVATE",
        targetType: "Student",
        targetId: "bulk",
        after: {
          isActive,
          examNumbers,
          count: updateResult.count,
        },
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return NextResponse.json({ data: { updated: updateResult.count } });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "일괄 처리 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}