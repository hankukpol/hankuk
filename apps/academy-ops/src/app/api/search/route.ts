import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json(
      { error: "검색어는 2자 이상이어야 합니다." },
      { status: 400 }
    );
  }
  if (q.length > 50) {
    return NextResponse.json(
      { error: "검색어는 50자 이하여야 합니다." },
      { status: 400 }
    );
  }

  const db = getPrisma();

  const [students, enrollments, payments] = await Promise.all([
    db.student.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { examNumber: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      select: { examNumber: true, name: true, phone: true, isActive: true },
      orderBy: { name: "asc" },
      take: 10,
    }),
    db.courseEnrollment.findMany({
      where: {
        OR: [
          { student: { name: { contains: q } } },
          { student: { examNumber: { contains: q } } },
          { examNumber: { contains: q } },
          { cohort: { name: { contains: q } } },
          { product: { name: { contains: q } } },
          { specialLecture: { name: { contains: q } } },
        ],
      },
      select: {
        id: true,
        examNumber: true,
        courseType: true,
        status: true,
        startDate: true,
        student: { select: { name: true } },
        product: { select: { name: true } },
        cohort: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.payment.findMany({
      where: {
        student: {
          OR: [
            { name: { contains: q } },
            { examNumber: { contains: q } },
          ],
        },
      },
      select: {
        id: true,
        examNumber: true,
        category: true,
        status: true,
        netAmount: true,
        processedAt: true,
        student: { select: { name: true, examNumber: true } },
      },
      orderBy: { processedAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({ data: { students, enrollments, payments } });
}
