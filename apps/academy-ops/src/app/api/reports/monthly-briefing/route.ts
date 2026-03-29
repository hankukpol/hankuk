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
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseMonthParam(sp.get("month"));

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // ── 1. 이번 달 결시 횟수 집계 (학생별) ───────────────────────────────────────
  type AbsenceByStudent = { examNumber: string; absCount: number };
  let absenceByStudent: AbsenceByStudent[] = [];
  try {
    const absentScores = await prisma.score.groupBy({
      by: ["examNumber"],
      where: {
        attendType: "ABSENT",
        session: { examDate: { gte: monthStart, lte: monthEnd } },
      },
      _count: { id: true },
    });
    absenceByStudent = absentScores.map((r) => ({
      examNumber: r.examNumber,
      absCount: r._count.id,
    }));
  } catch {
    // 결시 데이터 없음
  }

  // ── 2. 이번 달 평균 점수 집계 (학생별) ────────────────────────────────────────
  type AvgByStudent = { examNumber: string; avgScore: number; scoreCount: number };
  let avgByStudent: AvgByStudent[] = [];
  try {
    const scoreAgg = await prisma.score.groupBy({
      by: ["examNumber"],
      where: {
        finalScore: { not: null },
        attendType: { not: "ABSENT" },
        session: { examDate: { gte: monthStart, lte: monthEnd } },
      },
      _avg: { finalScore: true },
      _count: { id: true },
    });
    avgByStudent = scoreAgg
      .filter((r) => r._avg.finalScore !== null)
      .map((r) => ({
        examNumber: r.examNumber,
        avgScore: Math.round((r._avg.finalScore ?? 0) * 10) / 10,
        scoreCount: r._count.id,
      }));
  } catch {
    // 점수 데이터 없음
  }

  // ── 3. 전체 시험 횟수 (출석률 계산용) ─────────────────────────────────────────
  // 이달 각 학생의 전체 시험 횟수 = 결시 + 출석
  type TotalByStudent = { examNumber: string; totalCount: number };
  let totalByStudent: TotalByStudent[] = [];
  try {
    const totals = await prisma.score.groupBy({
      by: ["examNumber"],
      where: {
        session: { examDate: { gte: monthStart, lte: monthEnd } },
      },
      _count: { id: true },
    });
    totalByStudent = totals.map((r) => ({
      examNumber: r.examNumber,
      totalCount: r._count.id,
    }));
  } catch {
    // 데이터 없음
  }

  // Map 구성
  const absenceMap = new Map(absenceByStudent.map((r) => [r.examNumber, r.absCount]));
  const avgScoreMap = new Map(avgByStudent.map((r) => [r.examNumber, r.avgScore]));
  const totalMap = new Map(totalByStudent.map((r) => [r.examNumber, r.totalCount]));

  // ── 4. 위험 학생 + 우수 학생 대상 학번 집합 ──────────────────────────────────
  const atRiskExamNumbers = new Set<string>();
  const topExamNumbers = new Set<string>();

  // 결시 3회 초과 학생
  for (const { examNumber, absCount } of absenceByStudent) {
    if (absCount > 3) atRiskExamNumbers.add(examNumber);
  }

  // 평균 점수 < 50 학생
  for (const { examNumber, avgScore } of avgByStudent) {
    if (avgScore < 50) atRiskExamNumbers.add(examNumber);
  }

  // 우수 학생: 평균 > 80 이고 출석률 > 95%
  for (const { examNumber, avgScore } of avgByStudent) {
    const total = totalMap.get(examNumber) ?? 0;
    const absent = absenceMap.get(examNumber) ?? 0;
    const attendanceRate = total > 0 ? ((total - absent) / total) * 100 : 0;
    if (avgScore > 80 && attendanceRate > 95) {
      topExamNumbers.add(examNumber);
    }
  }

  // ── 5. 위험 학생 상세 조회 ────────────────────────────────────────────────────
  type AtRiskStudent = {
    examNumber: string;
    name: string;
    mobile: string | null;
    absCount: number;
    avgScore: number | null;
    attendanceRate: number | null;
    riskReasons: string[];
  };
  let atRiskStudents: AtRiskStudent[] = [];

  if (atRiskExamNumbers.size > 0) {
    try {
      const students = await prisma.student.findMany({
        where: { examNumber: { in: [...atRiskExamNumbers] } },
        select: { examNumber: true, name: true, phone: true },
      });
      atRiskStudents = students.map((s) => {
        const absCount = absenceMap.get(s.examNumber) ?? 0;
        const avgScore = avgScoreMap.get(s.examNumber) ?? null;
        const total = totalMap.get(s.examNumber) ?? 0;
        const absent = absenceMap.get(s.examNumber) ?? 0;
        const attendanceRate = total > 0 ? Math.round(((total - absent) / total) * 100) : null;

        const riskReasons: string[] = [];
        if (absCount > 3) riskReasons.push(`결시 ${absCount}회`);
        if (avgScore !== null && avgScore < 50) riskReasons.push(`평균 ${avgScore}점`);

        return {
          examNumber: s.examNumber,
          name: s.name,
          mobile: s.phone ?? null,
          absCount,
          avgScore,
          attendanceRate,
          riskReasons,
        };
      });
      // 위험도 높은 순으로 정렬 (결시 많은 순)
      atRiskStudents.sort((a, b) => b.absCount - a.absCount);
    } catch {
      // 학생 조회 실패
    }
  }

  // ── 6. 우수 학생 상세 조회 ────────────────────────────────────────────────────
  type TopStudent = {
    examNumber: string;
    name: string;
    mobile: string | null;
    avgScore: number;
    attendanceRate: number;
  };
  let topStudents: TopStudent[] = [];

  if (topExamNumbers.size > 0) {
    try {
      const students = await prisma.student.findMany({
        where: { examNumber: { in: [...topExamNumbers] } },
        select: { examNumber: true, name: true, phone: true },
      });
      topStudents = students
        .map((s) => {
          const avgScore = avgScoreMap.get(s.examNumber) ?? 0;
          const total = totalMap.get(s.examNumber) ?? 0;
          const absent = absenceMap.get(s.examNumber) ?? 0;
          const attendanceRate = total > 0 ? Math.round(((total - absent) / total) * 100) : 0;
          return {
            examNumber: s.examNumber,
            name: s.name,
            mobile: s.phone ?? null,
            avgScore,
            attendanceRate,
          };
        })
        .sort((a, b) => b.avgScore - a.avgScore);
    } catch {
      // 학생 조회 실패
    }
  }

  // ── 7. 이번 달 수강 현황 요약 ─────────────────────────────────────────────────
  let newEnrollments = 0;
  let withdrawals = 0;
  let totalActive = 0;
  try {
    [newEnrollments, withdrawals, totalActive] = await Promise.all([
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
    ]);
  } catch {
    // 집계 실패
  }

  const netChange = newEnrollments - withdrawals;

  // ── 8. 기수별 현황 ────────────────────────────────────────────────────────────
  type CohortStat = {
    id: string;
    name: string;
    examCategory: string;
    activeStudents: number;
    avgScore: number | null;
    attendanceRate: number | null;
  };
  let cohortStats: CohortStat[] = [];
  try {
    const cohortRows = await prisma.cohort.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        examCategory: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: { examNumber: true },
        },
      },
      orderBy: { startDate: "desc" },
    });

    // 기수별 활성 학생들의 점수·결시 집계
    for (const cohort of cohortRows) {
      const examNumbers = cohort.enrollments.map((e) => e.examNumber);
      let cohortAvgScore: number | null = null;
      let cohortAttRate: number | null = null;

      if (examNumbers.length > 0) {
        try {
          const [scoreAgg, absentCount, totalCount] = await Promise.all([
            prisma.score.aggregate({
              where: {
                examNumber: { in: examNumbers },
                finalScore: { not: null },
                attendType: { not: "ABSENT" },
                session: { examDate: { gte: monthStart, lte: monthEnd } },
              },
              _avg: { finalScore: true },
            }),
            prisma.score.count({
              where: {
                examNumber: { in: examNumbers },
                attendType: "ABSENT",
                session: { examDate: { gte: monthStart, lte: monthEnd } },
              },
            }),
            prisma.score.count({
              where: {
                examNumber: { in: examNumbers },
                session: { examDate: { gte: monthStart, lte: monthEnd } },
              },
            }),
          ]);

          if (scoreAgg._avg.finalScore !== null) {
            cohortAvgScore = Math.round((scoreAgg._avg.finalScore ?? 0) * 10) / 10;
          }
          if (totalCount > 0) {
            cohortAttRate = Math.round(((totalCount - absentCount) / totalCount) * 100);
          }
        } catch {
          // 기수 통계 실패 시 null 유지
        }
      }

      cohortStats.push({
        id: cohort.id,
        name: cohort.name,
        examCategory: cohort.examCategory,
        activeStudents: examNumbers.length,
        avgScore: cohortAvgScore,
        attendanceRate: cohortAttRate,
      });
    }
  } catch {
    // 기수 정보 없음
  }

  return NextResponse.json({
    data: {
      month: `${year}-${String(month).padStart(2, "0")}`,
      atRiskStudents,
      topStudents,
      summary: {
        newEnrollments,
        withdrawals,
        netChange,
        totalActive,
      },
      cohortStats,
    },
  });
}
