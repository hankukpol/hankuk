import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { resolveVisibleScoreSessionAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

export type ScoreProgressData = {
  sessionId: number;
  totalEnrolled: number;
  scoredCount: number;
  missingCount: number;
  progressPercent: number;
  missingStudents: Array<{
    examNumber: string;
    name: string;
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sessionIdRaw = request.nextUrl.searchParams.get("sessionId");
  const sessionId = sessionIdRaw ? Number(sessionIdRaw) : Number.NaN;

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "시험 회차를 선택해 주세요." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const academyId = await resolveVisibleScoreSessionAcademyId();

    const session = await prisma.examSession.findFirst({
      where: {
        id: sessionId,
        ...(academyId === null
          ? {}
          : {
              period: {
                academyId,
              },
            }),
      },
      select: { id: true, periodId: true, examType: true },
    });

    if (!session) {
      return NextResponse.json({ error: "시험 회차를 찾을 수 없습니다." }, { status: 404 });
    }

    const enrolledStudents = await prisma.periodEnrollment.findMany({
      where: {
        periodId: session.periodId,
        ...(academyId === null ? {} : { student: { academyId } }),
      },
      select: {
        examNumber: true,
        student: {
          select: {
            name: true,
            examType: true,
            isActive: true,
          },
        },
      },
    });

    const filteredStudents = enrolledStudents.filter(
      (enrollment) => enrollment.student.examType === session.examType && enrollment.student.isActive,
    );

    const existingScores = await prisma.score.findMany({
      where: { sessionId },
      select: { examNumber: true },
    });

    const scoredSet = new Set(existingScores.map((score) => score.examNumber));

    const missingStudents = filteredStudents
      .filter((enrollment) => !scoredSet.has(enrollment.examNumber))
      .map((enrollment) => ({
        examNumber: enrollment.examNumber,
        name: enrollment.student.name,
      }))
      .sort((left, right) => left.examNumber.localeCompare(right.examNumber));

    const totalEnrolled = filteredStudents.length;
    const scoredCount = filteredStudents.filter((enrollment) => scoredSet.has(enrollment.examNumber)).length;
    const missingCount = missingStudents.length;
    const progressPercent = totalEnrolled > 0 ? Math.round((scoredCount / totalEnrolled) * 100) : 0;

    const data: ScoreProgressData = {
      sessionId,
      totalEnrolled,
      scoredCount,
      missingCount,
      progressPercent,
      missingStudents,
    };

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "진행률 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
