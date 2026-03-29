import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/cohorts/[id]/graduate-all
 *
 * Body: { sendNotification?: boolean }
 *   - Marks ALL ACTIVE enrollments in the cohort as COMPLETED
 *
 * Returns: { data: { completedCount: number } }
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!id) throw new Error("잘못된 기수 ID");

    const body = await request.json() as { sendNotification?: boolean };
    const sendNotification = body.sendNotification ?? false;

    const result = await getPrisma().$transaction(async (tx) => {
      // 기수 존재 확인 (없으면 예외 발생)
      await tx.cohort.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });

      // 수료 대상: ACTIVE 상태인 수강 건만
      const activeEnrollments = await tx.courseEnrollment.findMany({
        where: {
          cohortId: id,
          status: "ACTIVE",
        },
        select: { id: true, examNumber: true },
      });

      if (activeEnrollments.length === 0) {
        return { completedCount: 0 };
      }

      const enrollmentIds = activeEnrollments.map((e) => e.id);

      // 일괄 수료 처리
      await tx.courseEnrollment.updateMany({
        where: { id: { in: enrollmentIds } },
        data: { status: "COMPLETED" },
      });

      // 감사 로그: 수강 건별 1개씩
      await tx.auditLog.createMany({
        data: activeEnrollments.map((e) => ({
          adminId: auth.context.adminUser.id,
          action: "ENROLLMENT_COMPLETED",
          targetType: "enrollment",
          targetId: e.id,
          before: { status: "ACTIVE" },
          after: { status: "COMPLETED" },
          ipAddress: request.headers.get("x-forwarded-for"),
        })),
      });

      void sendNotification; // reserved for future notification logic

      return { completedCount: activeEnrollments.length };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 수료 처리 실패" },
      { status: 400 },
    );
  }
}
