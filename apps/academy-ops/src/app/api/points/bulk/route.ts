import { AdminRole, PointType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

/**
 * POST /api/points/bulk
 * 여러 학생에게 포인트 일괄 지급.
 * Body: { examNumbers: string[], amount: number, reason: string }
 * 권한: MANAGER 이상
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      examNumbers?: unknown;
      amount?: unknown;
      reason?: unknown;
    };

    const { examNumbers, amount, reason } = body;

    // Validate examNumbers
    if (!Array.isArray(examNumbers) || examNumbers.length === 0) {
      return NextResponse.json({ error: "학번 목록을 입력하세요." }, { status: 400 });
    }
    const cleanExamNumbers = examNumbers
      .map((e) => String(e ?? "").trim())
      .filter(Boolean);
    if (cleanExamNumbers.length === 0) {
      return NextResponse.json({ error: "유효한 학번이 없습니다." }, { status: 400 });
    }

    // Validate amount
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
      return NextResponse.json({ error: "지급 포인트는 양의 정수여야 합니다." }, { status: 400 });
    }

    // Validate reason
    const cleanReason = String(reason ?? "").trim();
    if (cleanReason.length < 5) {
      return NextResponse.json({ error: "사유는 5자 이상 입력하세요." }, { status: 400 });
    }

    const prisma = getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      // Verify all students exist
      const students = await tx.student.findMany({
        where: { examNumber: { in: cleanExamNumbers } },
        select: { examNumber: true, name: true },
      });

      const foundNumbers = new Set(students.map((s) => s.examNumber));
      const notFound = cleanExamNumbers.filter((n) => !foundNumbers.has(n));
      if (notFound.length > 0) {
        throw new Error(`존재하지 않는 학번: ${notFound.slice(0, 5).join(", ")}${notFound.length > 5 ? ` 외 ${notFound.length - 5}건` : ""}`);
      }

      // Create PointLog for each student
      const logs = await Promise.all(
        students.map((student) =>
          tx.pointLog.create({
            data: {
              examNumber: student.examNumber,
              type: PointType.MANUAL,
              amount: numAmount,
              reason: cleanReason,
              grantedBy: auth.context.adminUser.name,
            },
          }),
        ),
      );

      // Single audit log for the bulk operation
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "POINT_GRANT",
          targetType: "PointLog",
          targetId: logs.map((l) => String(l.id)).join(","),
          before: toAuditJson(null),
          after: toAuditJson({
            examNumbers: cleanExamNumbers,
            amount: numAmount,
            reason: cleanReason,
            count: logs.length,
          }),
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return { count: logs.length, logs };
    });

    return NextResponse.json(
      { data: { count: result.count, message: `${result.count}명에게 ${numAmount.toLocaleString()}P가 지급되었습니다.` } },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
