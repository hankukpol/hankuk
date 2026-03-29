import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const academyId = resolveVisibleAcademyId(auth.context);

  const startDate = sp.get("startDate") ?? "";
  const endDate = sp.get("endDate") ?? "";
  const cohortId = sp.get("cohortId") ?? "";
  const status = sp.get("status") as EnrollmentStatus | null;
  const courseType = sp.get("courseType") as CourseType | null;

  const fromDate = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
  const toDate = endDate ? new Date(`${endDate}T23:59:59`) : undefined;

  const where = applyAcademyScope(
    {
      ...(cohortId ? { cohortId } : {}),
      ...(status ? { status } : {}),
      ...(courseType ? { courseType } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    academyId,
  );

  const enrollments = await getPrisma().courseEnrollment.findMany({
    where,
    include: {
      student: { select: { name: true, examNumber: true, phone: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { student: { examNumber: "asc" } },
    take: 1000,
  });

  const data = enrollments.map((enrollment) => ({
    ...enrollment,
    startDate: enrollment.startDate.toISOString(),
    endDate: enrollment.endDate?.toISOString() ?? null,
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
    cohort: enrollment.cohort
      ? {
          ...enrollment.cohort,
          startDate: enrollment.cohort.startDate.toISOString(),
          endDate: enrollment.cohort.endDate.toISOString(),
        }
      : null,
  }));

  return NextResponse.json({ data });
}