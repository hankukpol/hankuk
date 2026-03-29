import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { getStudentMonthlyBreakdown } from "@/lib/analytics/analysis";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

/**
 * GET /api/admin/students/[examNumber]/monthly-analysis
 *
 * Returns:
 * - monthlyRows: last 6 months of exam scores grouped by month
 * - currentEnrollment: active/suspended enrollment with cohort info
 * - hasOverduePayment: whether there is any overdue installment
 * - lastScoreDate: ISO string of the most recent scored session
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();
  const { examNumber } = params;

  try {
    // Load the student to get examType
    const student = await prisma.student.findUnique({
      where: { examNumber },
      select: { examNumber: true, examType: true },
    });

    if (!student) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    // Find the active period for this exam type
    const activePeriod = await prisma.examPeriod.findFirst({
      where: {
        isActive: true,
        sessions: { some: { examType: student.examType } },
      },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });

    // Build monthly breakdown rows (last 6 months from active period or fallback)
    let monthlyRows: Awaited<ReturnType<typeof getStudentMonthlyBreakdown>> = [];

    if (activePeriod?.id) {
      monthlyRows = await getStudentMonthlyBreakdown({
        examNumber,
        periodId: activePeriod.id,
      });
    }

    // Limit to last 6 months
    const last6 = monthlyRows.slice(-6);

    // Enrich with per-month subject breakdown (last 6 months sessions)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const sessions = await prisma.examSession.findMany({
      where: {
        examType: student.examType,
        isCancelled: false,
        examDate: { gte: sixMonthsAgo, lt: new Date() },
        ...(activePeriod?.id ? { periodId: activePeriod.id } : {}),
      },
      select: { id: true, subject: true, examDate: true },
      orderBy: { examDate: "asc" },
    });

    const sessionIds = sessions.map((s) => s.id);

    const studentScores =
      sessionIds.length > 0
        ? await prisma.score.findMany({
            where: { sessionId: { in: sessionIds }, examNumber },
            select: {
              sessionId: true,
              finalScore: true,
              rawScore: true,
              oxScore: true,
              attendType: true,
            },
          })
        : [];

    // Build per-month subject average map
    type MonthKey = string; // "YYYY-MM"
    const monthSubjectMap = new Map<MonthKey, Map<string, number[]>>();

    for (const session of sessions) {
      const mk = `${session.examDate.getFullYear()}-${String(session.examDate.getMonth() + 1).padStart(2, "0")}`;
      const score = studentScores.find((s) => s.sessionId === session.id);
      if (!score) continue;

      const finalScore = score.finalScore ?? score.rawScore ?? null;
      if (finalScore === null) continue;
      if (score.attendType === "ABSENT") continue;

      const subjectLabel = SUBJECT_LABEL_MAP[session.subject as keyof typeof SUBJECT_LABEL_MAP] ?? session.subject;

      const subjectMap = monthSubjectMap.get(mk) ?? new Map<string, number[]>();
      const existing = subjectMap.get(subjectLabel) ?? [];
      existing.push(finalScore);
      subjectMap.set(subjectLabel, existing);
      monthSubjectMap.set(mk, subjectMap);
    }

    // Find last score date
    const lastScoreSession =
      sessions.length > 0
        ? sessions.filter((s) => studentScores.some((sc) => sc.sessionId === s.id && sc.attendType !== "ABSENT")).pop()
        : null;

    // Merge subjectScores into monthly rows
    const enrichedRows = last6.map((row) => {
      const monthKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
      const subjectMap = monthSubjectMap.get(monthKey);
      const subjectScores: Record<string, number | null> = {};

      if (subjectMap) {
        for (const [subject, scores] of Array.from(subjectMap.entries())) {
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          subjectScores[subject] = avg !== null ? Math.round(avg * 10) / 10 : null;
        }
      }

      const participationRate =
        row.sessionCount > 0 ? Math.round((row.attendedCount / row.sessionCount) * 100) : 0;

      return {
        month: monthKey,
        monthLabel: row.monthLabel,
        sessionCount: row.sessionCount,
        attendedCount: row.attendedCount,
        absentCount: row.absentCount,
        excusedCount: row.excusedCount,
        studentAverage: row.studentAverage,
        cohortAverage: row.cohortAverage,
        studentRank: row.studentRank,
        totalParticipants: row.totalParticipants,
        changeFromPrevMonth: row.changeFromPrevMonth,
        participationRate,
        subjectScores,
        avg: row.studentAverage,
        changeFromPrev: row.changeFromPrevMonth,
      };
    });

    // Get current enrollment (ACTIVE or SUSPENDED, most recent)
    const currentEnrollmentRaw = await prisma.courseEnrollment.findFirst({
      where: {
        examNumber,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        cohort: { select: { name: true } },
        product: { select: { name: true } },
      },
    });

    const currentEnrollment = currentEnrollmentRaw
      ? {
          cohortName:
            currentEnrollmentRaw.cohort?.name ?? currentEnrollmentRaw.product?.name ?? "수강",
          status: currentEnrollmentRaw.status,
          endDate: currentEnrollmentRaw.endDate ? currentEnrollmentRaw.endDate.toISOString() : null,
        }
      : null;

    // Check overdue installments
    const now = new Date();
    const overdueCount = await prisma.installment.count({
      where: {
        payment: { examNumber },
        dueDate: { lt: now },
        paidAt: null,
      },
    });

    return NextResponse.json({
      data: {
        monthlyRows: enrichedRows,
        currentEnrollment,
        hasOverduePayment: overdueCount > 0,
        lastScoreDate: lastScoreSession ? lastScoreSession.examDate.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Failed to load monthly student analysis", error);
    return NextResponse.json(
      { error: "월별 분석 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

// Subject label mapping (Korean)
const SUBJECT_LABEL_MAP = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형소법",
  POLICE_SCIENCE: "경찰학",
  CRIMINOLOGY: "범죄학",
  CUMULATIVE: "누적",
} as const;
