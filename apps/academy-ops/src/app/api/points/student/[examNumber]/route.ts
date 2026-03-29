import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ examNumber: string }> };

/**
 * GET /api/points/student/[examNumber]
 * 특정 학생의 포인트 잔액 + 최근 이력 조회.
 * 권한: ACADEMIC_ADMIN 이상
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber } = await context.params;
  const cleanExamNumber = String(examNumber ?? "").trim();
  if (!cleanExamNumber) {
    return NextResponse.json({ error: "수험번호를 입력하세요." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();

    const student = await prisma.student.findUnique({
      where: { examNumber: cleanExamNumber },
      select: { name: true, examNumber: true, phone: true },
    });
    if (!student) {
      return NextResponse.json({ error: `학생을 찾을 수 없습니다: ${cleanExamNumber}` }, { status: 404 });
    }

    const [balanceResult, logs] = await Promise.all([
      prisma.pointLog.aggregate({
        where: { examNumber: cleanExamNumber },
        _sum: { amount: true },
      }),
      prisma.pointLog.findMany({
        where: { examNumber: cleanExamNumber },
        orderBy: { grantedAt: "desc" },
        take: 50,
      }),
    ]);

    const balance = balanceResult._sum.amount ?? 0;

    return NextResponse.json({ student, balance, logs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
