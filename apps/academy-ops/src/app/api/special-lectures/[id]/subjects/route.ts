import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { subjectName, instructorId, price, instructorRate, sortOrder } = body;

    if (!subjectName?.trim()) return NextResponse.json({ error: "과목명을 입력하세요." }, { status: 400 });
    if (!instructorId) return NextResponse.json({ error: "강사를 선택하세요." }, { status: 400 });
    if (price === undefined || price === null) return NextResponse.json({ error: "수강료를 입력하세요." }, { status: 400 });
    if (instructorRate === undefined || instructorRate === null) return NextResponse.json({ error: "강사 배분율을 입력하세요." }, { status: 400 });

    const existing = await getPrisma().specialLectureSubject.count({ where: { lectureId: params.id } });

    const subject = await getPrisma().specialLectureSubject.create({
      data: {
        lectureId: params.id,
        subjectName: subjectName.trim(),
        instructorId,
        price: Number(price),
        instructorRate: Number(instructorRate),
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing,
      },
      include: { instructor: { select: { id: true, name: true, subject: true } } },
    });

    return NextResponse.json({ subject }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
