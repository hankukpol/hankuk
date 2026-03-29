import { AdminRole, EnrollmentStatus, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VISIBLE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.SUSPENDED,
  EnrollmentStatus.PENDING,
];

function buildEnrollmentScope(periodId: number, academyId: number | null) {
  if (academyId === null) {
    return { periodId };
  }

  return {
    periodId,
    period: { academyId },
  };
}

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "수강 정보 없음";
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = resolveVisibleAcademyId(auth.context);
  const prisma = getPrisma();

  let body: { periodId?: unknown; examNumber?: unknown; examNumbers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const periodId = Number(body.periodId);
  if (!periodId || Number.isNaN(periodId) || periodId <= 0) {
    return NextResponse.json({ error: "유효한 periodId가 필요합니다." }, { status: 400 });
  }

  let examNumbers: string[] = [];
  if (Array.isArray(body.examNumbers)) {
    examNumbers = body.examNumbers.map((value) => String(value).trim()).filter(Boolean);
  } else if (typeof body.examNumber === "string" && body.examNumber.trim()) {
    examNumbers = [body.examNumber.trim()];
  }

  if (examNumbers.length === 0) {
    return NextResponse.json({ error: "등록할 학번을 입력해 주세요." }, { status: 400 });
  }

  const period = await prisma.examPeriod.findFirst({
    where: applyAcademyScope({ id: periodId }, academyId),
    select: { id: true },
  });
  if (!period) {
    return NextResponse.json({ error: "현재 지점에서 접근할 수 없는 시험 기간입니다." }, { status: 404 });
  }

  const students = await prisma.student.findMany({
    where: applyAcademyScope(
      {
        examNumber: { in: examNumbers },
        isActive: true,
      },
      academyId,
    ),
    select: { examNumber: true },
  });

  const foundNumbers = new Set(students.map((student) => student.examNumber));
  const notFound = examNumbers.filter((examNumber) => !foundNumbers.has(examNumber));

  const existing = await prisma.periodEnrollment.findMany({
    where: {
      ...buildEnrollmentScope(periodId, academyId),
      examNumber: { in: Array.from(foundNumbers) },
    },
    select: { examNumber: true },
  });

  const alreadyEnrolled = new Set(existing.map((enrollment) => enrollment.examNumber));
  const toEnroll = Array.from(foundNumbers).filter((examNumber) => !alreadyEnrolled.has(examNumber));

  if (toEnroll.length > 0) {
    await prisma.periodEnrollment.createMany({
      data: toEnroll.map((examNumber) => ({ periodId, examNumber })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    data: {
      enrolled: toEnroll.length,
      skipped: alreadyEnrolled.size,
      notFound,
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = resolveVisibleAcademyId(auth.context);
  const searchParams = request.nextUrl.searchParams;
  const periodIdValue = searchParams.get("periodId");
  const examTypeValue = searchParams.get("examType") as ExamType | null;
  const query = searchParams.get("query")?.trim() ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  if (!periodIdValue) {
    return NextResponse.json({ error: "periodId가 필요합니다." }, { status: 400 });
  }

  const periodId = Number(periodIdValue);
  if (Number.isNaN(periodId) || periodId <= 0) {
    return NextResponse.json({ error: "유효하지 않은 periodId입니다." }, { status: 400 });
  }

  if (examTypeValue && !Object.values(ExamType).includes(examTypeValue)) {
    return NextResponse.json({ error: "유효하지 않은 examType입니다." }, { status: 400 });
  }

  const period = await getPrisma().examPeriod.findFirst({
    where: applyAcademyScope({ id: periodId }, academyId),
    select: { id: true },
  });
  if (!period) {
    return NextResponse.json({ error: "현재 지점에서 접근할 수 없는 시험 기간입니다." }, { status: 404 });
  }

  const studentWhere = {
    ...(academyId === null ? {} : { academyId }),
    ...(examTypeValue ? { examType: examTypeValue } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { examNumber: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const baseEnrollmentWhere = buildEnrollmentScope(periodId, academyId);
  const prisma = getPrisma();

  const [enrollments, total] = await prisma.$transaction([
    prisma.periodEnrollment.findMany({
      where: {
        ...baseEnrollmentWhere,
        student: studentWhere,
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
            onlineId: true,
            isActive: true,
            currentStatus: true,
            registeredAt: true,
            generation: true,
            className: true,
            courseEnrollments: {
              where: {
                ...(academyId === null ? {} : { academyId }),
                status: { in: VISIBLE_ENROLLMENT_STATUSES },
              },
              orderBy: [{ createdAt: "desc" }],
              take: 3,
              select: {
                id: true,
                status: true,
                cohort: { select: { name: true } },
                product: { select: { name: true } },
                specialLecture: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ student: { examType: "asc" } }, { student: { examNumber: "asc" } }],
      skip,
      take: limit,
    }),
    prisma.periodEnrollment.count({
      where: {
        ...baseEnrollmentWhere,
        student: studentWhere,
      },
    }),
  ]);

  const [totalCount, gongchaeCount, gyeongchaeCount, onlineCount] = await prisma.$transaction([
    prisma.periodEnrollment.count({ where: baseEnrollmentWhere }),
    prisma.periodEnrollment.count({
      where: {
        ...baseEnrollmentWhere,
        student: academyId === null ? { examType: ExamType.GONGCHAE } : { academyId, examType: ExamType.GONGCHAE },
      },
    }),
    prisma.periodEnrollment.count({
      where: {
        ...baseEnrollmentWhere,
        student: academyId === null ? { examType: ExamType.GYEONGCHAE } : { academyId, examType: ExamType.GYEONGCHAE },
      },
    }),
    prisma.periodEnrollment.count({
      where: {
        ...baseEnrollmentWhere,
        student: academyId === null ? { onlineId: { not: null } } : { academyId, onlineId: { not: null } },
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      subscriptions: enrollments.map((enrollment) => ({
        enrolledAt: enrollment.enrolledAt.toISOString(),
        student: {
          examNumber: enrollment.student.examNumber,
          name: enrollment.student.name,
          mobile: enrollment.student.phone ?? null,
          examType: enrollment.student.examType,
          onlineId: enrollment.student.onlineId ?? null,
          isActive: enrollment.student.isActive,
          currentStatus: enrollment.student.currentStatus,
          registeredAt: enrollment.student.registeredAt?.toISOString() ?? null,
          generation: enrollment.student.generation ?? null,
          className: enrollment.student.className ?? null,
          isOnline: enrollment.student.onlineId !== null,
          enrollments: enrollment.student.courseEnrollments.map((courseEnrollment) => ({
            id: courseEnrollment.id,
            status: courseEnrollment.status,
            label: courseNameOf(courseEnrollment),
          })),
        },
      })),
      total,
      page,
      limit,
      stats: {
        total: totalCount,
        gongchae: gongchaeCount,
        gyeongchae: gyeongchaeCount,
        online: onlineCount,
      },
    },
  });
}
