import { AdminRole, PassType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const passType = searchParams.get("passType") as PassType | null;
  const year = searchParams.get("year");

  const graduates = await getPrisma().graduateRecord.findMany({
    where: {
      ...(passType ? { passType } : {}),
      ...(year
        ? {
            OR: [
              { writtenPassDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } },
              { finalPassDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } },
            ],
          }
        : {}),
    },
    include: {
      student: { select: { name: true, generation: true } },
      staff: { select: { name: true } },
      scoreSnapshots: { select: { snapshotType: true, overallAverage: true, totalEnrolledMonths: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ graduates });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, examName, passType, writtenPassDate, finalPassDate, appointedDate, enrolledMonths, testimony, isPublic, note } = body;

    if (!examNumber || !examName || !passType) {
      return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    const student = await getPrisma().student.findUnique({ where: { examNumber } });
    if (!student) return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });

    const record = await getPrisma().graduateRecord.create({
      data: {
        examNumber,
        examName: examName.trim(),
        passType,
        writtenPassDate: writtenPassDate ? new Date(writtenPassDate) : null,
        finalPassDate: finalPassDate ? new Date(finalPassDate) : null,
        appointedDate: appointedDate ? new Date(appointedDate) : null,
        enrolledMonths: enrolledMonths ? Number(enrolledMonths) : null,
        testimony: testimony?.trim() || null,
        isPublic: Boolean(isPublic),
        staffId: auth.context.adminUser.id,
        note: note?.trim() || null,
      },
      include: {
        student: { select: { name: true, generation: true } },
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
