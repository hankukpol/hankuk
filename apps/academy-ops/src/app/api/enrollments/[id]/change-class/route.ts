import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

// POST /api/enrollments/[id]/change-class — 반/기수 변경
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!id) throw new Error("잘못된 수강 ID");

    const body = await request.json();
    const { newCohortId, reason } = body;

    if (!newCohortId) {
      return NextResponse.json({ error: "새로운 기수를 선택해주세요." }, { status: 400 });
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.findUniqueOrThrow({
        where: { id },
        include: { cohort: { select: { name: true } } },
      });

      if (!["ACTIVE", "SUSPENDED", "PENDING"].includes(enrollment.status)) {
        throw new Error("수강 중, 휴원, 또는 대기 상태의 수강만 변경할 수 있습니다.");
      }

      const newCohort = await tx.cohort.findUnique({
        where: { id: newCohortId },
        select: { id: true, name: true, isActive: true },
      });

      if (!newCohort) {
        throw new Error("존재하지 않는 기수입니다.");
      }
      if (!newCohort.isActive) {
        throw new Error("비활성 기수로는 변경할 수 없습니다.");
      }

      const prevCohortName = enrollment.cohort?.name ?? null;
      const prevCohortId = enrollment.cohortId;

      const updated = await tx.courseEnrollment.update({
        where: { id },
        data: { cohortId: newCohortId },
        include: {
          cohort: { select: { name: true } },
        },
      });

      // 수강 이력 기록
      await tx.enrollmentHistory.create({
        data: {
          enrollmentId: id,
          changeType: "CLASS_CHANGE",
          prevValue: { cohortId: prevCohortId, cohortName: prevCohortName },
          newValue: { cohortId: newCohortId, cohortName: newCohort.name },
          reason: reason?.trim() || null,
          changedBy: auth.context.adminUser.id,
        },
      });

      // 감사 로그
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "ENROLLMENT_CLASS_CHANGE",
          targetType: "courseEnrollment",
          targetId: id,
          before: { cohortId: prevCohortId, cohortName: prevCohortName },
          after: { cohortId: newCohortId, cohortName: newCohort.name },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({ enrollment: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "반 변경 처리 실패" },
      { status: 400 },
    );
  }
}
