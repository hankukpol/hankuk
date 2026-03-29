import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { reason?: string; returnDate?: string } = {};
  try {
    body = (await request.json()) as { reason?: string; returnDate?: string };
  } catch {
    // empty body is fine
  }

  const { reason, returnDate } = body;

  try {
    const prisma = getPrisma();
    const academyId = requireVisibleAcademyId(auth.context);
    const student = await prisma.student.findFirst({
      where: { examNumber: params.examNumber, academyId },
      select: { examNumber: true, name: true, isActive: true },
    });

    if (!student) {
      return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    const activeEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        academyId,
        examNumber: params.examNumber,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (activeEnrollments.length === 0) {
      return NextResponse.json({ error: "현재 수강 중인 등록이 없습니다." }, { status: 400 });
    }

    const leaveDate = new Date();
    const parsedReturnDate = returnDate ? new Date(returnDate) : null;

    await prisma.$transaction(async (tx) => {
      for (const enrollment of activeEnrollments) {
        await tx.courseEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "SUSPENDED" },
        });

        await tx.leaveRecord.create({
          data: {
            enrollmentId: enrollment.id,
            leaveDate,
            returnDate: parsedReturnDate,
            reason: reason ?? null,
            approvedBy: auth.context.adminUser.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "STUDENT_SUSPEND",
          targetType: "Student",
          targetId: params.examNumber,
          after: {
            reason,
            returnDate,
            enrollmentIds: activeEnrollments.map((enrollment) => enrollment.id),
          },
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    });

    return NextResponse.json({ success: true, suspended: activeEnrollments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "휴원 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const prisma = getPrisma();
    const academyId = requireVisibleAcademyId(auth.context);
    const student = await prisma.student.findFirst({
      where: { examNumber: params.examNumber, academyId },
      select: { examNumber: true, name: true },
    });

    if (!student) {
      return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    const suspendedEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        academyId,
        examNumber: params.examNumber,
        status: "SUSPENDED",
      },
      include: {
        leaveRecords: {
          where: { returnDate: null },
          orderBy: { leaveDate: "desc" },
          take: 1,
        },
      },
    });

    if (suspendedEnrollments.length === 0) {
      return NextResponse.json({ error: "현재 휴원 중인 등록이 없습니다." }, { status: 400 });
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const enrollment of suspendedEnrollments) {
        await tx.courseEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "ACTIVE" },
        });

        const openLeave = enrollment.leaveRecords[0];
        if (openLeave) {
          await tx.leaveRecord.update({
            where: { id: openLeave.id },
            data: { returnDate: now },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "STUDENT_RESTORE",
          targetType: "Student",
          targetId: params.examNumber,
          after: {
            enrollmentIds: suspendedEnrollments.map((enrollment) => enrollment.id),
            restoredAt: now.toISOString(),
          },
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    });

    return NextResponse.json({ success: true, restored: suspendedEnrollments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복교 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}
