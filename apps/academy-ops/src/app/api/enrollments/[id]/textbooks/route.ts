import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const enrollmentId = params.id;

  // Fetch the enrollment with student and course info
  const enrollment = await getPrisma().courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { select: { name: true, examNumber: true } },
      cohort: { select: { name: true, examCategory: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  if (!enrollment) {
    return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
  }

  // Determine course name for display
  const courseName =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    "수강 정보";

  // Fetch all active textbooks
  // Textbook model does not have an examCategory field — we return all active textbooks
  const textbooks = await getPrisma().textbook.findMany({
    where: { isActive: true },
    orderBy: [{ title: "asc" }],
    select: {
      id: true,
      title: true,
      author: true,
      publisher: true,
      price: true,
      stock: true,
      subject: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    data: {
      textbooks: textbooks.map((t) => ({ ...t, id: String(t.id) })),
      enrollment: {
        id: enrollment.id,
        studentName: enrollment.student.name,
        studentExamNumber: enrollment.student.examNumber,
        courseName,
        status: enrollment.status,
      },
    },
  });
}
