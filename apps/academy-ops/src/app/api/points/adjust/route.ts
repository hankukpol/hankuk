import { AdminRole, PointType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

/**
 * POST /api/points/adjust
 * 관리자 포인트 수동 조정 (지급 또는 차감).
 * 지급: amount > 0 / 차감: amount < 0
 * 차감 시 잔액 부족 여부 확인 후 처리.
 * 권한: DIRECTOR 이상 (AdminRole.MANAGER)
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, amount, reason } = body;

    const cleanExamNumber = String(examNumber ?? "").trim();
    if (!cleanExamNumber) throw new Error("수험번호를 입력하세요.");

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount === 0)
      throw new Error("금액은 0이 아닌 숫자여야 합니다.");

    const cleanReason = String(reason ?? "").trim();
    if (!cleanReason) throw new Error("사유를 입력하세요.");

    const result = await getPrisma().$transaction(async (tx) => {
      // Validate student exists
      const student = await tx.student.findUnique({
        where: { examNumber: cleanExamNumber },
        select: { name: true, examNumber: true },
      });
      if (!student) throw new Error(`학생을 찾을 수 없습니다: ${cleanExamNumber}`);

      // If deduction, check current balance
      if (numAmount < 0) {
        const balanceResult = await tx.pointLog.aggregate({
          where: { examNumber: cleanExamNumber },
          _sum: { amount: true },
        });
        const currentBalance = balanceResult._sum.amount ?? 0;
        if (currentBalance + numAmount < 0) {
          throw new Error(
            `잔액 부족: 현재 잔액 ${currentBalance.toLocaleString()}P, 차감 요청 ${Math.abs(numAmount).toLocaleString()}P`,
          );
        }
      }

      const log = await tx.pointLog.create({
        data: {
          examNumber: cleanExamNumber,
          type: PointType.MANUAL,
          amount: numAmount,
          reason: cleanReason,
          grantedBy: auth.context.adminUser.name,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: numAmount > 0 ? "POINT_GRANT" : "POINT_DEDUCT",
          targetType: "PointLog",
          targetId: String(log.id),
          before: toAuditJson(null),
          after: toAuditJson({ examNumber: cleanExamNumber, amount: numAmount, reason: cleanReason }),
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return { log, student };
    });

    return NextResponse.json({ log: result.log, student: result.student });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
