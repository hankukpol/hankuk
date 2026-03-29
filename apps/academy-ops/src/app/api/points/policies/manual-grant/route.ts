import { AdminRole, PointType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/points/policies/manual-grant
 * 관리자 수동 포인트 지급 (단일 학생).
 * Body: { studentId: string, points: number, reason: string }
 * 권한: COUNSELOR+
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { studentId, points, reason } = body as {
      studentId?: unknown;
      points?: unknown;
      reason?: unknown;
    };

    const examNumber = String(studentId ?? "").trim();
    if (!examNumber) throw new Error("학번을 입력하세요.");

    const amount = Number(points);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("포인트는 1 이상의 숫자여야 합니다.");

    const cleanReason = String(reason ?? "").trim();
    if (!cleanReason) throw new Error("지급 사유를 입력하세요.");

    const prisma = getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { examNumber },
        select: { name: true, examNumber: true },
      });
      if (!student) throw new Error(`학생을 찾을 수 없습니다: ${examNumber}`);

      const log = await tx.pointLog.create({
        data: {
          examNumber,
          type: PointType.MANUAL,
          amount,
          reason: cleanReason,
          grantedBy: auth.context.adminUser.name,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "POINT_GRANT",
          targetType: "PointLog",
          targetId: String(log.id),
          before: toAuditJson(null),
          after: toAuditJson({ examNumber, amount, reason: cleanReason }),
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return { log, student };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "포인트 지급에 실패했습니다." },
      { status: 400 },
    );
  }
}
