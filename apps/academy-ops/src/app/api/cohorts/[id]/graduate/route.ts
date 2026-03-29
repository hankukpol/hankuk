import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/cohorts/[id]/graduate
 *
 * Body: { graduateExamNumbers: string[] }
 *   - graduateExamNumbers: 수료 처리할 수강생 학번 배열 (나머지는 퇴원 처리)
 *
 * Returns: { data: { graduatedCount, withdrawnCount, cohortId } }
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!id) throw new Error("잘못된 기수 ID");

    const body = await request.json() as { graduateExamNumbers?: string[] };
    const { graduateExamNumbers } = body;

    if (!Array.isArray(graduateExamNumbers)) {
      return NextResponse.json(
        { error: "graduateExamNumbers 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const result = await getPrisma().$transaction(async (tx) => {
      // 기수 존재 확인
      const cohort = await tx.cohort.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true, isActive: true },
      });

      if (!cohort.isActive) {
        throw new Error("이미 비활성 처리된 기수입니다.");
      }

      // 이 기수의 ACTIVE/PENDING 수강 건 조회
      const activeEnrollments = await tx.courseEnrollment.findMany({
        where: {
          cohortId: id,
          status: { in: ["ACTIVE", "PENDING"] },
        },
        select: { id: true, examNumber: true, status: true },
      });

      const graduateSet = new Set(graduateExamNumbers);

      // 수료 대상
      const toGraduate = activeEnrollments.filter((e) => graduateSet.has(e.examNumber));
      // 퇴원 대상 (체크 해제된 학생)
      const toWithdraw = activeEnrollments.filter((e) => !graduateSet.has(e.examNumber));

      const now = new Date();

      // 수료 처리
      if (toGraduate.length > 0) {
        await tx.courseEnrollment.updateMany({
          where: { id: { in: toGraduate.map((e) => e.id) } },
          data: { status: "COMPLETED" },
        });
      }

      // 퇴원 처리
      if (toWithdraw.length > 0) {
        await tx.courseEnrollment.updateMany({
          where: { id: { in: toWithdraw.map((e) => e.id) } },
          data: { status: "WITHDRAWN" },
        });
      }

      // 기수 비활성화
      await tx.cohort.update({
        where: { id },
        data: { isActive: false },
      });

      // 감사 로그 기록
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "COHORT_GRADUATION",
          targetType: "cohort",
          targetId: id,
          before: { isActive: true, activeEnrollmentCount: activeEnrollments.length },
          after: {
            isActive: false,
            graduatedCount: toGraduate.length,
            withdrawnCount: toWithdraw.length,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return {
        cohortId: id,
        cohortName: cohort.name,
        graduatedCount: toGraduate.length,
        withdrawnCount: toWithdraw.length,
      };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수료 처리 실패" },
      { status: 400 },
    );
  }
}
