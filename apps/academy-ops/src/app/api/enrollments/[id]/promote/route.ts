import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 수강 ID");

    const enrollment = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.courseEnrollment.findUniqueOrThrow({
        where: { id },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true, examCategory: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      });

      if (existing.status !== "WAITING") {
        throw new Error("대기 상태인 수강 건만 수강 확정할 수 있습니다.");
      }

      const updated = await tx.courseEnrollment.update({
        where: { id },
        data: {
          status: "PENDING",
          waitlistOrder: null,
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
          action: "PROMOTE_WAITLIST",
          targetType: "courseEnrollment",
          targetId: id,
          before: { status: existing.status, waitlistOrder: existing.waitlistOrder },
          after: { status: "PENDING", waitlistOrder: null },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강 확정 실패" },
      { status: 400 },
    );
  }
}
