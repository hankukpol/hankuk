import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import {
  hydrateDefaultExamSubjectsForAcademy,
  listExamSubjectsForAcademy,
  parseExamSubjectCreateInput,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "1";
    const rows = await listExamSubjectsForAcademy(academyId, { includeInactive });

    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 과목 목록을 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const payload = parseExamSubjectCreateInput((await request.json()) as Record<string, unknown>);
    const prisma = getPrisma();

    await hydrateDefaultExamSubjectsForAcademy(academyId, prisma);

    const existing = await prisma.examSubject.findFirst({
      where: {
        academyId,
        examType: payload.examType,
        code: payload.code,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 직렬·과목 조합입니다. 기존 행을 수정해 주세요." },
        { status: 400 },
      );
    }

    const row = await prisma.examSubject.create({
      data: {
        academyId,
        ...payload,
      },
    });

    return NextResponse.json({ data: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 과목을 등록하지 못했습니다." },
      { status: 400 },
    );
  }
}
