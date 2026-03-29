import { AdminRole, EnrollmentStatus, EnrollSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 수강 ID");

    const body = await request.json();
    const { status, endDate, discountAmount, finalFee, enrollSource, extraData, cohortId, note } = body;

    const enrollment = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.courseEnrollment.findUniqueOrThrow({ where: { id } });

      // If cohortId is provided, validate it exists
      if (cohortId !== undefined && cohortId !== null) {
        await tx.cohort.findUniqueOrThrow({ where: { id: cohortId as string } });
      }

      // Merge note into extraData
      let mergedExtraData = extraData;
      if (note !== undefined) {
        const existingExtra = (existing.extraData as Record<string, unknown> | null) ?? {};
        mergedExtraData = { ...existingExtra, note: note?.trim() || null };
      }

      const updated = await tx.courseEnrollment.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status: status as EnrollmentStatus } : {}),
          ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
          ...(discountAmount !== undefined ? { discountAmount: Number(discountAmount) } : {}),
          ...(finalFee !== undefined ? { finalFee: Number(finalFee) } : {}),
          ...(enrollSource !== undefined
            ? { enrollSource: (enrollSource as EnrollSource) ?? null }
            : {}),
          ...(mergedExtraData !== undefined ? { extraData: mergedExtraData } : {}),
          ...(cohortId !== undefined ? { cohortId: (cohortId as string) ?? null } : {}),
        },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true, examCategory: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_ENROLLMENT",
          targetType: "courseEnrollment",
          targetId: id,
          before: { status: existing.status, finalFee: existing.finalFee, cohortId: existing.cohortId },
          after: { status: updated.status, finalFee: updated.finalFee, cohortId: updated.cohortId },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return updated;
    });

    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 수강 ID");

    const enrollment = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.courseEnrollment.findUniqueOrThrow({ where: { id } });
      const updated = await tx.courseEnrollment.update({
        where: { id },
        data: { status: "WITHDRAWN" },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true, examCategory: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "WITHDRAW_ENROLLMENT",
          targetType: "courseEnrollment",
          targetId: id,
          before: { status: existing.status },
          after: { status: "WITHDRAWN" },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return updated;
    });

    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "퇴원 처리 실패" },
      { status: 400 },
    );
  }
}
