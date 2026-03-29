import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseMonthParam(param: string | null): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseMonthParam(sp.get("month"));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // ── 수강 등록 집계 ──
  let newEnrollments = 0;
  let cancelledEnrollments = 0;
  let activeEnrollments = 0;
  let waitingEnrollments = 0;
  try {
    [newEnrollments, cancelledEnrollments, activeEnrollments, waitingEnrollments] = await Promise.all([
      prisma.courseEnrollment.count({
        where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.courseEnrollment.count({
        where: {
          status: { in: ["CANCELLED", "WITHDRAWN"] },
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.courseEnrollment.count({ where: { status: "ACTIVE" } }),
      prisma.courseEnrollment.count({ where: { status: "WAITING" } }),
    ]);
  } catch {
    // 집계 실패 시 기본값 유지
  }

  // ── 수납 집계 ──
  let paymentGross = 0;
  let paymentNet = 0;
  let paymentCount = 0;
  try {
    const payments = await prisma.payment.aggregate({
      where: {
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { netAmount: true, grossAmount: true },
      _count: { id: true },
    });
    paymentGross = payments._sum.grossAmount ?? 0;
    paymentNet = payments._sum.netAmount ?? 0;
    paymentCount = payments._count.id ?? 0;
  } catch {
    // 집계 실패 시 기본값 유지
  }

  // ── 환불 집계 ──
  let refundTotal = 0;
  let refundCount = 0;
  try {
    const refunds = await prisma.refund.aggregate({
      where: {
        status: "COMPLETED",
        processedAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    });
    refundTotal = refunds._sum.amount ?? 0;
    refundCount = refunds._count.id ?? 0;
  } catch {
    // 집계 실패 시 기본값 유지
  }

  // ── 미수금 (미납 분할납부) ──
  let unpaidAmount = 0;
  let unpaidCount = 0;
  try {
    const unpaid = await prisma.installment.aggregate({
      where: { paidAt: null, dueDate: { lte: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    });
    unpaidAmount = unpaid._sum.amount ?? 0;
    unpaidCount = unpaid._count.id ?? 0;
  } catch {
    // 집계 실패 시 기본값 유지
  }

  // ── 기수별 수강 현황 ──
  type CohortOccupancy = {
    id: string;
    name: string;
    examCategory: string;
    maxCapacity: number | null;
    enrolled: number;
    waiting: number;
  };
  let cohorts: CohortOccupancy[] = [];
  try {
    const cohortRows = await prisma.cohort.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        examCategory: true,
        maxCapacity: true,
        _count: {
          select: {
            enrollments: { where: { status: "ACTIVE" } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });
    const waitingCounts = await prisma.courseEnrollment.groupBy({
      by: ["cohortId"],
      where: {
        cohortId: { in: cohortRows.map((c) => c.id) },
        status: "WAITING",
      },
      _count: { id: true },
    });
    const waitingMap = new Map(waitingCounts.map((w) => [w.cohortId, w._count.id]));

    cohorts = cohortRows.map((c) => ({
      id: c.id,
      name: c.name,
      examCategory: c.examCategory,
      maxCapacity: c.maxCapacity,
      enrolled: c._count.enrollments,
      waiting: waitingMap.get(c.id) ?? 0,
    }));
  } catch {
    // 기수 정보 없음
  }

  // ── 교재 판매 현황 ──
  let textbookSalesCount = 0;
  let textbookSalesTotal = 0;
  try {
    const tbSales = await prisma.textbookSale.aggregate({
      where: { soldAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalPrice: true, quantity: true },
      _count: { id: true },
    });
    textbookSalesCount = tbSales._count.id ?? 0;
    textbookSalesTotal = tbSales._sum.totalPrice ?? 0;
  } catch {
    // 교재 판매 데이터 없음
  }

  // ── 강사 정산 요약 ──
  type SettlementRow = {
    id: string;
    instructorId: string;
    instructorName: string;
    amount: number;
    status: string;
  };
  let settlements: SettlementRow[] = [];
  try {
    const rows = await prisma.specialLectureSettlement.findMany({
      where: { settlementMonth: monthStr },
      orderBy: { instructorAmount: "desc" },
    });
    // 강사 이름 별도 조회
    const instructorIds = [...new Set(rows.map((r) => r.instructorId))];
    const instructors = await prisma.instructor.findMany({
      where: { id: { in: instructorIds } },
      select: { id: true, name: true },
    });
    const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));

    settlements = rows.map((r) => ({
      id: r.id,
      instructorId: r.instructorId,
      instructorName: instructorMap.get(r.instructorId) ?? r.instructorId,
      amount: r.instructorAmount,
      status: r.status,
    }));
  } catch {
    // 정산 데이터 없음
  }

  // ── 출결 현황 (경고·탈락) ──
  let warningCount = 0;
  let dropoutCount = 0;
  let attendanceTotal = 0;
  let attendanceAbsent = 0;
  try {
    const [warning1, warning2, dropout, scores] = await Promise.all([
      prisma.score.count({
        where: {
          attendType: "ABSENT",
          session: { examDate: { gte: monthStart, lte: monthEnd } },
        },
      }),
      prisma.weeklyStatusSnapshot.count({
        where: {
          status: "WARNING_1",
          weekStartDate: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.weeklyStatusSnapshot.count({
        where: {
          status: "DROPOUT",
          weekStartDate: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.score.aggregate({
        where: {
          session: { examDate: { gte: monthStart, lte: monthEnd } },
        },
        _count: { id: true },
      }),
    ]);
    attendanceAbsent = warning1;
    warningCount = warning2;
    dropoutCount = dropout;
    attendanceTotal = scores._count.id ?? 0;
  } catch {
    // 출결 데이터 없음
  }

  const attendanceRate =
    attendanceTotal > 0
      ? Math.round(((attendanceTotal - attendanceAbsent) / attendanceTotal) * 1000) / 10
      : null;

  return NextResponse.json({
    data: {
      month: monthStr,
      kpi: {
        newEnrollments,
        cancelledEnrollments,
        activeEnrollments,
        waitingEnrollments,
        paymentGross,
        paymentNet,
        paymentCount,
        refundTotal,
        refundCount,
        unpaidAmount,
        unpaidCount,
      },
      cohorts,
      textbook: {
        salesCount: textbookSalesCount,
        salesTotal: textbookSalesTotal,
      },
      settlements,
      attendance: {
        totalRecords: attendanceTotal,
        absentCount: attendanceAbsent,
        attendanceRate,
        warningCount,
        dropoutCount,
      },
    },
  });
}
