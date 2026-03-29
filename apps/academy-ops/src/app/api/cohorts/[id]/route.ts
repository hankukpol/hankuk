import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!id) throw new Error("잘못된 기수 ID");

    const cohort = await getPrisma().cohort.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: {
            student: { select: { name: true, phone: true } },
            staff: { select: { name: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!cohort) throw new Error("기수를 찾을 수 없습니다.");

    const activeCount = cohort.enrollments.filter(
      (e) => e.status === "PENDING" || e.status === "ACTIVE",
    ).length;
    const waitlistCount = cohort.enrollments.filter((e) => e.status === "WAITING").length;
    const availableSeats =
      cohort.maxCapacity != null ? Math.max(0, cohort.maxCapacity - activeCount) : null;

    return NextResponse.json({
      cohort: {
        ...cohort,
        activeCount,
        waitlistCount,
        availableSeats,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
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
          before: { name: existing.name, endDate: existing.endDate },
          after: { name: updated.name, endDate: updated.endDate },
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
