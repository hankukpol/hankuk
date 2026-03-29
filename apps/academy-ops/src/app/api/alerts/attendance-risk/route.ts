import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type AttendanceRiskLevel = "DANGER" | "WARNING" | "CAUTION";

export type AttendanceRiskStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  cohortId: string | null;
  cohortName: string | null;
  absenceCount: number;
  lastAbsenceDate: string | null;
  avgScore: number | null;
  riskLevel: AttendanceRiskLevel;
};

export type AttendanceRiskResponse = {
  danger: AttendanceRiskStudent[];
  warning: AttendanceRiskStudent[];
  caution: AttendanceRiskStudent[];
  totalActive: number;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const cohortId = sp.get("cohortId") ?? undefined;

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 1. 활성 수강 등록 조회 (종합반만 - cohortId가 있는 경우)
  const activeEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: "ACTIVE",
      courseType: "COMPREHENSIVE",
      ...(cohortId ? { cohortId } : {}),
    },
    select: {
      examNumber: true,
      cohortId: true,
      cohort: { select: { id: true, name: true, startDate: true, endDate: true } },
      student: { select: { examNumber: true, name: true, phone: true } },
    },
  });

  const totalActive = activeEnrollments.length;

  if (totalActive === 0) {
    return NextResponse.json({
      data: { danger: [], warning: [], caution: [], totalActive: 0 },
    });
  }

  // 중복 제거: 학생 한 명이 여러 종합반에 등록된 경우 첫 번째 기준
  const enrollmentByExamNumber = new Map<string, typeof activeEnrollments[0]>();
  for (const e of activeEnrollments) {
    if (!enrollmentByExamNumber.has(e.examNumber)) {
      enrollmentByExamNumber.set(e.examNumber, e);
    }
  }

  const uniqueExamNumbers = [...enrollmentByExamNumber.keys()];

  // 2. 이번 달 결석 AbsenceNote 집계 (PENDING + APPROVED)
  const absenceNotes = await prisma.absenceNote.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      status: { in: ["PENDING", "APPROVED"] },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: {
      examNumber: true,
      session: { select: { examDate: true } },
    },
    orderBy: { session: { examDate: "desc" } },
  });

  // 결석 횟수와 마지막 결석일 집계
  const absenceMap = new Map<string, { count: number; lastDate: Date | null }>();
  for (const note of absenceNotes) {
    const prev = absenceMap.get(note.examNumber) ?? { count: 0, lastDate: null };
    const noteDate = note.session.examDate;
    absenceMap.set(note.examNumber, {
      count: prev.count + 1,
      lastDate:
        prev.lastDate === null || noteDate > prev.lastDate ? noteDate : prev.lastDate,
    });
  }

  // 3. 이번 달 평균 점수 집계
  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: { not: "ABSENT" },
      finalScore: { not: null },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: {
      examNumber: true,
      finalScore: true,
    },
  });

  const scoreMap = new Map<string, { sum: number; count: number }>();
  for (const s of scores) {
    const prev = scoreMap.get(s.examNumber) ?? { sum: 0, count: 0 };
    scoreMap.set(s.examNumber, {
      sum: prev.sum + (s.finalScore ?? 0),
      count: prev.count + 1,
    });
  }

  // 4. 위험도 분류
  const danger: AttendanceRiskStudent[] = [];
  const warning: AttendanceRiskStudent[] = [];
  const caution: AttendanceRiskStudent[] = [];

  for (const [examNumber, enrollment] of enrollmentByExamNumber) {
    const absenceInfo = absenceMap.get(examNumber) ?? { count: 0, lastDate: null };
    const scoreInfo = scoreMap.get(examNumber);
    const avgScore =
      scoreInfo && scoreInfo.count > 0
        ? Math.round((scoreInfo.sum / scoreInfo.count) * 10) / 10
        : null;

    const absenceCount = absenceInfo.count;

    let riskLevel: AttendanceRiskLevel | null = null;

    if (absenceCount >= 5) {
      riskLevel = "DANGER";
    } else if (absenceCount >= 3) {
      riskLevel = "WARNING";
    } else if (absenceCount >= 1 && (avgScore === null || avgScore < 60)) {
      riskLevel = "CAUTION";
    }

    if (riskLevel === null) continue;

    const item: AttendanceRiskStudent = {
      examNumber,
      name: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      cohortId: enrollment.cohortId ?? null,
      cohortName: enrollment.cohort?.name ?? null,
      absenceCount,
      lastAbsenceDate: absenceInfo.lastDate ? absenceInfo.lastDate.toISOString() : null,
      avgScore,
      riskLevel,
    };

    if (riskLevel === "DANGER") danger.push(item);
    else if (riskLevel === "WARNING") warning.push(item);
    else caution.push(item);
  }

  // 결석 수 내림차순 정렬
  danger.sort((a, b) => b.absenceCount - a.absenceCount);
  warning.sort((a, b) => b.absenceCount - a.absenceCount);
  caution.sort((a, b) => b.absenceCount - a.absenceCount);

  return NextResponse.json({
    data: {
      danger,
      warning,
      caution,
      totalActive,
    } satisfies AttendanceRiskResponse,
  });
}
