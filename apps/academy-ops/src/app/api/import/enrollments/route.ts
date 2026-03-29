import { NextRequest } from "next/server";
import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseCourseType(raw: string): CourseType | null {
  const value = raw.trim();
  if (value === "종합" || value === "COMPREHENSIVE") return "COMPREHENSIVE";
  if (value === "단과" || value === "개별" || value === "SINGLE") return "COMPREHENSIVE";
  if (value === "특강" || value === "SPECIAL" || value === "SPECIAL_LECTURE") return "SPECIAL_LECTURE";
  return null;
}

function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const date = new Date(raw.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: { enrollments?: unknown };
  try {
    body = (await request.json()) as { enrollments?: unknown };
  } catch {
    return Response.json({ error: "JSON 파싱 중 오류가 발생했습니다." }, { status: 400 });
  }

  if (!Array.isArray(body.enrollments)) {
    return Response.json({ error: "enrollments 배열이 필요합니다." }, { status: 400 });
  }

  if (body.enrollments.length === 0) {
    return Response.json({ error: "등록할 수강 데이터가 없습니다." }, { status: 400 });
  }

  if (body.enrollments.length > 500) {
    return Response.json(
      { error: "한 번에 최대 500건까지 처리할 수 있습니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  let created = 0;
  const errors: string[] = [];
  const staffCache = new Map<string, string>();
  const defaultStaffId = auth.context.adminUser.id;

  for (let index = 0; index < body.enrollments.length; index += 1) {
    const raw = body.enrollments[index] as Record<string, unknown>;
    const examNumber = typeof raw.examNumber === "string" ? raw.examNumber.trim() : "";
    if (!examNumber) {
      errors.push(`행 ${index + 1}: 학번이 비어 있습니다.`);
      continue;
    }

    const courseTypeRaw = typeof raw.courseType === "string" ? raw.courseType.trim() : "";
    const courseType = parseCourseType(courseTypeRaw);
    if (!courseType) {
      errors.push(`행 ${index + 1} (${examNumber}): 강좌유형 '${courseTypeRaw}'을(를) 해석할 수 없습니다.`);
      continue;
    }

    const courseName = typeof raw.courseName === "string" ? raw.courseName.trim() : "";
    const startDateRaw = typeof raw.startDate === "string" ? raw.startDate : "";
    const startDate = parseDate(startDateRaw);
    if (!startDate) {
      errors.push(`행 ${index + 1} (${examNumber}): 시작일 '${startDateRaw}' 형식이 올바르지 않습니다.`);
      continue;
    }

    const endDateRaw = typeof raw.endDate === "string" ? raw.endDate : "";
    const endDate = parseDate(endDateRaw);
    const regularFee =
      typeof raw.regularFee === "number"
        ? raw.regularFee
        : Number.parseInt(String(raw.regularFee ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
    const discountAmount =
      typeof raw.discountAmount === "number"
        ? raw.discountAmount
        : Number.parseInt(String(raw.discountAmount ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
    const finalFee = Math.max(0, regularFee - discountAmount);

    let staffId = defaultStaffId;
    const staffExamNumber = typeof raw.staffExamNumber === "string" ? raw.staffExamNumber.trim() : "";
    if (staffExamNumber) {
      if (staffCache.has(staffExamNumber)) {
        staffId = staffCache.get(staffExamNumber) ?? defaultStaffId;
      } else {
        staffCache.set(staffExamNumber, staffId);
      }
    }

    try {
      const student = await prisma.student.findUnique({
        where: { examNumber },
        select: { examNumber: true },
      });
      if (!student) {
        errors.push(`행 ${index + 1}: 학번 '${examNumber}'에 해당하는 학생이 없습니다.`);
        continue;
      }

      let cohortId: string | null = null;
      let specialLectureId: string | null = null;
      let productId: string | null = null;

      if (courseName) {
        if (courseType === "COMPREHENSIVE") {
          const cohort = await prisma.cohort.findFirst({
            where: { name: { contains: courseName, mode: "insensitive" }, isActive: true },
            select: { id: true },
          });
          cohortId = cohort?.id ?? null;

          if (!cohortId) {
            const product = await prisma.comprehensiveCourseProduct.findFirst({
              where: { name: { contains: courseName, mode: "insensitive" }, isActive: true },
              select: { id: true },
            });
            productId = product?.id ?? null;
          }
        } else if (courseType === "SPECIAL_LECTURE") {
          const lecture = await prisma.specialLecture.findFirst({
            where: { name: { contains: courseName, mode: "insensitive" }, isActive: true },
            select: { id: true },
          });
          specialLectureId = lecture?.id ?? null;
        }
      }

      await prisma.courseEnrollment.create({
        data: {
          examNumber,
          courseType,
          productId: productId ?? undefined,
          cohortId: cohortId ?? undefined,
          specialLectureId: specialLectureId ?? undefined,
          startDate,
          endDate: endDate ?? undefined,
          regularFee,
          discountAmount,
          finalFee,
          status: EnrollmentStatus.ACTIVE,
          staffId,
        },
      });

      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`행 ${index + 1} (${examNumber}): ${message.slice(0, 120)}`);
    }
  }

  return Response.json({
    data: { created, errors },
  });
}