/**
 * GET /api/analytics/enrollments?months=6
 * 수강 등록 통계 API
 * - 월별 신규 등록 수 (최근 N개월)
 * - 시험 유형별(ExamType) 카운트
 * - 수강 상태별(EnrollmentStatus) 카운트
 */
import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const months = Math.min(Math.max(parseInt(searchParams.get("months") ?? "6", 10), 1), 24);

  try {
    const prisma = getPrisma();

    // Date range: first day of (today - months + 1) month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    // ─── 1. 월별 신규 등록 수 ─────────────────────────────────────────────
    const allEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { not: "WAITING" }, // 대기자는 실 등록으로 보지 않음
      },
      select: {
        createdAt: true,
        status: true,
        examNumber: true,
        student: { select: { examType: true } },
      },
    });

    // Build monthly counts
    const monthlyMap = new Map<string, number>();
    // Pre-fill with zeros for all months in range
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    for (const e of allEnrollments) {
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
    }
    const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    // ─── 2. 시험 유형별(ExamType) 분포 (전체 활성 등록 기준) ─────────────
    const activeEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] },
      },
      select: {
        student: { select: { examType: true } },
      },
    });

    const examTypeMap = new Map<string, number>();
    for (const e of activeEnrollments) {
      const key = e.student.examType;
      examTypeMap.set(key, (examTypeMap.get(key) ?? 0) + 1);
    }
    const examTypeDistribution = Array.from(examTypeMap.entries()).map(([examType, count]) => ({
      examType,
      count,
    }));

    // ─── 3. 수강 상태별(EnrollmentStatus) 카운트 ──────────────────────────
    const statusCounts = await prisma.courseEnrollment.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const statusDistribution = statusCounts.map((row) => ({
      status: row.status,
      count: row._count.status,
    }));

    return NextResponse.json({
      data: {
        monthlyTrend,
        examTypeDistribution,
        statusDistribution,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "통계 조회 실패" },
      { status: 500 },
    );
  }
}
