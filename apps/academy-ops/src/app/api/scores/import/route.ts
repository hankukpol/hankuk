import { AdminRole, AttendType, ExamType, ScoreSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import { SCORE_SESSION_LOCKED_MESSAGE } from "@/lib/scores/service";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ImportRequestBody = {
  periodId: number;
  examDate: string;
  examType: string;
  entries: Array<{
    examNumber: string;
    scores: Record<string, number>;
  }>;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = (await request.json()) as ImportRequestBody;
    const { periodId, examDate, examType, entries } = body;

    if (!periodId || !examDate || !examType) {
      return NextResponse.json(
        { error: "periodId, examDate, examType는 필수입니다." },
        { status: 400 },
      );
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "성적 데이터가 없습니다." }, { status: 400 });
    }

    const validExamTypes = Object.values(ExamType);
    if (!validExamTypes.includes(examType as ExamType)) {
      return NextResponse.json(
        { error: `유효하지 않은 시험 유형입니다: ${examType}` },
        { status: 400 },
      );
    }

    const parsedExamDate = new Date(examDate);
    if (Number.isNaN(parsedExamDate.getTime())) {
      return NextResponse.json(
        { error: "examDate 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용해 주세요." },
        { status: 400 },
      );
    }

    const prisma = getPrisma();
    const period = await prisma.examPeriod.findFirst({
      where: {
        id: periodId,
        academyId,
      },
      select: {
        id: true,
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "해당 지점의 시험 기간을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const subjectKeys = new Set<string>();
    for (const entry of entries) {
      Object.keys(entry.scores).forEach((key) => subjectKeys.add(key));
    }

    if (subjectKeys.size === 0) {
      return NextResponse.json({ error: "유효한 과목 점수가 없습니다." }, { status: 400 });
    }

    const allSessions = await prisma.examSession.findMany({
      where: {
        periodId,
        examType: examType as ExamType,
        isCancelled: false,
        period: {
          academyId,
        },
      },
      select: {
        id: true,
        subject: true,
        examDate: true,
        week: true,
        isLocked: true,
      },
    });

    const dayStart = new Date(`${examDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${examDate}T23:59:59.999Z`);
    const sessionBySubject = new Map<string, { id: number; isLocked: boolean }>();

    for (const session of allSessions) {
      if (session.examDate >= dayStart && session.examDate <= dayEnd) {
        sessionBySubject.set(session.subject, { id: session.id, isLocked: session.isLocked });
      }
    }

    if (sessionBySubject.size === 0) {
      const dayStartWide = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
      const dayEndWide = new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000);
      for (const session of allSessions) {
        if (session.examDate >= dayStartWide && session.examDate <= dayEndWide) {
          sessionBySubject.set(session.subject, { id: session.id, isLocked: session.isLocked });
        }
      }
    }

    const examNumbers = [...new Set(entries.map((entry) => entry.examNumber).filter(Boolean))];
    const existingStudents = await prisma.student.findMany({
      where: {
        academyId,
        examNumber: { in: examNumbers },
      },
      select: {
        examNumber: true,
      },
    });
    const validExamNumbers = new Set(existingStudents.map((student) => student.examNumber));

    let successCount = 0;
    const failed: Array<{ examNumber: string; subject: string; reason: string }> = [];

    for (const entry of entries) {
      if (!entry.examNumber || !validExamNumbers.has(entry.examNumber)) {
        const firstSubject = Object.keys(entry.scores)[0] ?? "";
        failed.push({
          examNumber: entry.examNumber || "(빈 학번)",
          subject: firstSubject,
          reason: `학번 '${entry.examNumber}' 학생을 현재 지점에서 찾을 수 없습니다.`,
        });
        continue;
      }

      for (const [subjectKey, rawScore] of Object.entries(entry.scores)) {
        const session = sessionBySubject.get(subjectKey);
        if (!session) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: `해당 날짜의 '${subjectKey}' 회차를 찾을 수 없습니다.`,
          });
          continue;
        }

        if (session.isLocked) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: SCORE_SESSION_LOCKED_MESSAGE,
          });
          continue;
        }

        if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: `점수 값이 올바르지 않습니다: ${rawScore}`,
          });
          continue;
        }

        try {
          await prisma.score.upsert({
            where: {
              examNumber_sessionId: {
                examNumber: entry.examNumber,
                sessionId: session.id,
              },
            },
            create: {
              academyId,
              examNumber: entry.examNumber,
              sessionId: session.id,
              rawScore,
              finalScore: rawScore,
              attendType: AttendType.NORMAL,
              sourceType: ScoreSource.MANUAL_INPUT,
            },
            update: {
              academyId,
              rawScore,
              finalScore: rawScore,
              sourceType: ScoreSource.MANUAL_INPUT,
            },
          });
          successCount += 1;
        } catch (error) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: error instanceof Error ? error.message : "성적 저장 중 오류가 발생했습니다.",
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        success: successCount,
        failed,
        sessionsFound: sessionBySubject.size,
        totalEntries: entries.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적 가져오기에 실패했습니다." },
      { status: 400 },
    );
  }
}
