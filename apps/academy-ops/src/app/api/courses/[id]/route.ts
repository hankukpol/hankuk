import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 강좌 ID");
    const body = await request.json();
    const {
      name,
      category,
      examType,
      tuitionFee,
      description,
      status,
      isActive,
      maxCapacity,
      cohortStartDate,
      cohortEndDate,
    } = body;

    const course = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.course.findUniqueOrThrow({ where: { id } });
      const updated = await tx.course.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(examType !== undefined ? { examType: examType || null } : {}),
          ...(tuitionFee !== undefined ? { tuitionFee: Number(tuitionFee) } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(maxCapacity !== undefined
            ? { maxCapacity: maxCapacity ? Number(maxCapacity) : null }
            : {}),
          ...(cohortStartDate !== undefined
            ? { cohortStartDate: cohortStartDate ? new Date(cohortStartDate) : null }
            : {}),
          ...(cohortEndDate !== undefined
            ? { cohortEndDate: cohortEndDate ? new Date(cohortEndDate) : null }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_COURSE",
          targetType: "course",
          targetId: String(id),
          before: { name: existing.name, status: existing.status },
          after: { name: updated.name, status: updated.status },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return updated;
    });

    return NextResponse.json({ course });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 강좌 ID");

    await getPrisma().$transaction(async (tx) => {
      const existing = await tx.course.findUniqueOrThrow({ where: { id } });
      await tx.course.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "DELETE_COURSE",
          targetType: "course",
          targetId: String(id),
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
