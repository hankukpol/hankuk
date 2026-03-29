import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearParam(param: string | null): number {
  if (param && /^\d{4}$/.test(param)) {
    const y = parseInt(param, 10);
    if (y >= 2020 && y <= 2099) return y;
  }
  return new Date().getFullYear();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const year = parseYearParam(sp.get("year"));
  const prisma = getPrisma();

  // 12개월 데이터 집계
  type MonthData = {
    month: string; // "YYYY-MM"
    monthLabel: string; // "1월"
    paymentNet: number;
    paymentGross: number;
    paymentCount: number;
    refundTotal: number;
    refundCount: number;
    newEnrollments: number;
    cancelledEnrollments: number;
    writtenPass: number;
    finalPass: number;
  };

  const months: MonthData[] = [];

  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, "0")}`;
    const monthStart = new Date(year, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, m, 0, 23, 59, 59, 999);

    let paymentNet = 0;
    let paymentGross = 0;
    let paymentCount = 0;
    let refundTotal = 0;
    let refundCount = 0;
    let newEnrollments = 0;
    let cancelledEnrollments = 0;
    let writtenPass = 0;
    let finalPass = 0;

    try {
      const [payAgg, refAgg, newEnroll, cancelledEnroll] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { netAmount: true, grossAmount: true },
          _count: { id: true },
        }),
        prisma.refund.aggregate({
          where: {
            status: "COMPLETED",
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.courseEnrollment.count({
          where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } },
        }),
        prisma.courseEnrollment.count({
          where: {
            status: { in: ["CANCELLED", "WITHDRAWN"] },
            updatedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      paymentNet = payAgg._sum.netAmount ?? 0;
      paymentGross = payAgg._sum.grossAmount ?? 0;
      paymentCount = payAgg._count.id ?? 0;
      refundTotal = refAgg._sum.amount ?? 0;
      refundCount = refAgg._count.id ?? 0;
      newEnrollments = newEnroll;
      cancelledEnrollments = cancelledEnroll;
    } catch {
      // 집계 실패 시 기본값 유지
    }

    try {
      const [written, final] = await Promise.all([
        prisma.graduateRecord.count({
          where: {
            passType: "WRITTEN_PASS",
            writtenPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
        prisma.graduateRecord.count({
          where: {
            passType: "FINAL_PASS",
            finalPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);
      writtenPass = written;
      finalPass = final;
    } catch {
      // 합격자 데이터 없음
    }

    months.push({
      month: monthStr,
      monthLabel: `${m}월`,
      paymentNet,
      paymentGross,
      paymentCount,
      refundTotal,
      refundCount,
      newEnrollments,
      cancelledEnrollments,
      writtenPass,
      finalPass,
    });
  }

  // 연간 합계
  const annual = {
    paymentNet: months.reduce((s, m) => s + m.paymentNet, 0),
    paymentGross: months.reduce((s, m) => s + m.paymentGross, 0),
    paymentCount: months.reduce((s, m) => s + m.paymentCount, 0),
    refundTotal: months.reduce((s, m) => s + m.refundTotal, 0),
    refundCount: months.reduce((s, m) => s + m.refundCount, 0),
    newEnrollments: months.reduce((s, m) => s + m.newEnrollments, 0),
    cancelledEnrollments: months.reduce((s, m) => s + m.cancelledEnrollments, 0),
    writtenPass: months.reduce((s, m) => s + m.writtenPass, 0),
    finalPass: months.reduce((s, m) => s + m.finalPass, 0),
  };

  // 현재 수강생 수 (연간 통계용 스냅샷)
  let currentActiveEnrollments = 0;
  try {
    currentActiveEnrollments = await prisma.courseEnrollment.count({
      where: { status: "ACTIVE" },
    });
  } catch {
    // 기본값 유지
  }

  return NextResponse.json({
    data: {
      year,
      months,
      annual,
      currentActiveEnrollments,
    },
  });
}
