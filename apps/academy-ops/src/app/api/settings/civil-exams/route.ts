import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const exams = await getPrisma().civilServiceExam.findMany({
    orderBy: [{ year: "desc" }, { examType: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ exams });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, examType, year, writtenDate, interviewDate, resultDate, description, isActive } =
      body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "시험명을 입력해주세요." }, { status: 400 });
    }
    if (!examType || !Object.values(ExamType).includes(examType)) {
      return NextResponse.json({ error: "시험 유형을 선택해주세요." }, { status: 400 });
    }
    if (!year || isNaN(Number(year))) {
      return NextResponse.json({ error: "연도를 입력해주세요." }, { status: 400 });
    }

    const exam = await getPrisma().civilServiceExam.create({
      data: {
        name: name.trim(),
        examType,
        year: Number(year),
        writtenDate: writtenDate ? new Date(writtenDate) : null,
        interviewDate: interviewDate ? new Date(interviewDate) : null,
        resultDate: resultDate ? new Date(resultDate) : null,
        description: description?.trim() || null,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ exam }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
