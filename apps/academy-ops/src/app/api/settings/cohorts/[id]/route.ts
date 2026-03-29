import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 기수 ID");
    const body = await request.json();
    const { name, examCategory, startDate, endDate, targetExamYear, isActive, maxCapacity } = body;

    const cohort = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.cohort.findUniqueOrThrow({ where: { id } });
      const updated = await tx.cohort.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(examCategory !== undefined ? { examCategory } : {}),
          ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
          ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
          ...(targetExamYear !== undefined
            ? { targetExamYear: targetExamYear ? Number(targetExamYear) : null }
            : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          ...(maxCapacity !== undefined
            ? { maxCapacity: maxCapacity === null ? null : Number(maxCapacity) }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_COHORT",
          targetType: "cohort",
          targetId: id,
          before: { name: existing.name, examCategory: existing.examCategory },
          after: { name: updated.name, examCategory: updated.examCategory },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return updated;
    });

    return NextResponse.json({ cohort });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 기수 ID");

    await getPrisma().$transaction(async (tx) => {
      const existing = await tx.cohort.findUniqueOrThrow({ where: { id } });
      await tx.cohort.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "DELETE_COHORT",
          targetType: "cohort",
          targetId: id,
          before: { name: existing.name },
          after: undefined,
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
