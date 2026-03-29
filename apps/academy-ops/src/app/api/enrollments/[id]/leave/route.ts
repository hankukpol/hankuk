import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

// POST /api/enrollments/[id]/leave
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = context.params;
    const body = await request.json();
    const { leaveDate, reason } = body;

    if (!leaveDate) {
      return NextResponse.json(
        { error: "휴원일을 입력해주세요." },
        { status: 400 },
      );
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.findUniqueOrThrow({ where: { id } });

      if (enrollment.status !== "ACTIVE") {
        throw new Error("수강 중인 등록만 휴원 처리할 수 있습니다.");
      }

      const leaveRecord = await tx.leaveRecord.create({
        data: {
          enrollmentId: id,
          leaveDate: new Date(leaveDate),
          reason: reason?.trim() || null,
          approvedBy: auth.context.adminUser.id,
        },
      });

      await tx.courseEnrollment.update({
        where: { id },
        data: { status: "SUSPENDED" },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "ENROLLMENT_LEAVE",
          targetType: "courseEnrollment",
          targetId: id,
          before: { status: "ACTIVE" },
          after: { status: "SUSPENDED", leaveDate },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return leaveRecord;
    });

    return NextResponse.json(
      {
        leaveRecord: {
          ...result,
          leaveDate: result.leaveDate.toISOString(),
          returnDate: null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "휴원 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

// PATCH /api/enrollments/[id]/leave
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = context.params;
    const body = await request.json();
    const { leaveRecordId, returnDate } = body;

    if (!leaveRecordId) {
      return NextResponse.json(
        { error: "휴원 기록 ID가 필요합니다." },
        { status: 400 },
      );
    }

    if (!returnDate) {
      return NextResponse.json(
        { error: "복귀일을 입력해주세요." },
        { status: 400 },
      );
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const leaveRecord = await tx.leaveRecord.findUniqueOrThrow({
        where: { id: leaveRecordId },
      });

      if (leaveRecord.enrollmentId !== id) {
        throw new Error("잘못된 휴원 기록입니다.");
      }

      if (leaveRecord.returnDate) {
        throw new Error("이미 복귀 처리된 휴원 기록입니다.");
      }

      const updated = await tx.leaveRecord.update({
        where: { id: leaveRecordId },
        data: { returnDate: new Date(returnDate) },
      });

      await tx.courseEnrollment.update({
        where: { id },
        data: { status: "ACTIVE" },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "ENROLLMENT_RETURN",
          targetType: "courseEnrollment",
          targetId: id,
          before: { status: "SUSPENDED" },
          after: { status: "ACTIVE", returnDate },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({
      leaveRecord: {
        ...result,
        leaveDate: result.leaveDate.toISOString(),
        returnDate: result.returnDate ? result.returnDate.toISOString() : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "복귀 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

