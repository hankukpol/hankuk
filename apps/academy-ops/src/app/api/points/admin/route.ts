import { AdminRole, PointType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/points/admin
 * 전체 포인트 이력 조회 (관리자용)
 * Query: ?studentId=xxx&type=MANUAL&from=2026-01-01&to=2026-03-31&page=1&pageSize=20
 * 권한: COUNSELOR+
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId")?.trim() || undefined;
    const typeParam = searchParams.get("type")?.trim() || undefined;
    const from = searchParams.get("from")?.trim() || undefined;
    const to = searchParams.get("to")?.trim() || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    // Validate type if provided
    const validTypes = Object.values(PointType) as string[];
    const type = typeParam && validTypes.includes(typeParam) ? (typeParam as PointType) : undefined;

    const prisma = getPrisma();

    const where = {
      ...(studentId ? { examNumber: studentId } : {}),
      ...(type ? { type } : {}),
      ...(from || to
        ? {
            grantedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, logs, kpi] = await Promise.all([
      prisma.pointLog.count({ where }),
      prisma.pointLog.findMany({
        where,
        orderBy: { grantedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: {
            select: { name: true, examNumber: true, phone: true },
          },
        },
      }),
      // KPI 집계 (필터 없이 전체)
      (async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [totalIssued, thisMonthIssued, beneficiaryCount] = await Promise.all([
          prisma.pointLog.aggregate({
            where: { amount: { gt: 0 } },
            _sum: { amount: true },
          }),
          prisma.pointLog.aggregate({
            where: { amount: { gt: 0 }, grantedAt: { gte: startOfMonth } },
            _sum: { amount: true },
          }),
          prisma.pointLog.groupBy({
            by: ["examNumber"],
            where: { amount: { gt: 0 } },
            _count: true,
          }).then((r) => r.length),
        ]);

        // 총 잔액 = 전체 발행 + 전체 차감(음수)
        const totalBalance = await prisma.pointLog.aggregate({
          _sum: { amount: true },
        });

        return {
          totalIssued: totalIssued._sum.amount ?? 0,
          thisMonthIssued: thisMonthIssued._sum.amount ?? 0,
          totalBalance: totalBalance._sum.amount ?? 0,
          beneficiaryCount,
        };
      })(),
    ]);

    return NextResponse.json({
      data: logs,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
      kpi,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
