import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  bulkDeactivateStudents,
  bulkUpdateStudentGeneration,
} from "@/lib/students/service";

function parseExamNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("수강생을 하나 이상 선택해 주세요.");
  }

  const examNumbers = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (examNumbers.length === 0) {
    throw new Error("수강생을 하나 이상 선택해 주세요.");
  }

  return examNumbers;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      examNumbers?: unknown;
      generation?: unknown;
    };
    const examNumbers = parseExamNumbers(body.examNumbers);

    if (body.action === "deactivate") {
      const result = await bulkDeactivateStudents({
        adminId: auth.context.adminUser.id,
        examNumbers,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    if (body.action === "setGeneration") {
      const rawGeneration = body.generation;
      let generation: number | null = null;

      if (rawGeneration !== null && rawGeneration !== "" && typeof rawGeneration !== "undefined") {
        const parsedGeneration = Number(rawGeneration);

        if (!Number.isInteger(parsedGeneration) || parsedGeneration < 0) {
          return NextResponse.json(
            { error: "기수는 0 이상의 정수로 입력해 주세요." },
            { status: 400 },
          );
        }

        generation = parsedGeneration;
      }

      const result = await bulkUpdateStudentGeneration({
        adminId: auth.context.adminUser.id,
        examNumbers,
        generation,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "지원하지 않는 일괄 작업입니다." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 학생 작업에 실패했습니다." },
      { status: 400 },
    );
  }
}
