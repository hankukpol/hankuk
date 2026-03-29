import { ExamType, Subject } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type MissingScoreStudent = {
  examNumber: string;
  name: string;
  phone: string | null;
  examType: ExamType;
  notificationConsent: boolean;
};

export type MissingScoreSessionSummary = {
  session: {
    id: number;
    periodId: number;
    examType: ExamType;
    week: number;
    subject: Subject;
    displaySubjectName: string | null;
    examDate: Date;
    isCancelled: boolean;
    period: {
      name: string;
    };
  };
  expectedCount: number;
  scoreCount: number;
  missingCount: number;
  students: MissingScoreStudent[];
};

export function parseMissingScoreSessionId(sessionIdValue: string | null) {
  if (!sessionIdValue) {
    return {
      ok: false as const,
      error: "sessionId가 필요합니다.",
    };
  }

  const sessionId = Number(sessionIdValue);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return {
      ok: false as const,
      error: "유효한 sessionId가 필요합니다.",
    };
  }

  return {
    ok: true as const,
    sessionId,
  };
}

export async function getMissingScoreSessionSummary(sessionId: number) {
  const prisma = getPrisma();
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      periodId: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      isCancelled: true,
      period: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const [enrollments, scores] = await Promise.all([
    prisma.periodEnrollment.findMany({
      where: {
        periodId: session.periodId,
        student: {
          examType: session.examType,
          isActive: true,
        },
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
            notificationConsent: true,
          },
        },
      },
    }),
    prisma.score.findMany({
      where: { sessionId },
      select: { examNumber: true },
    }),
  ]);

  const scoredExamNumbers = new Set(scores.map((score) => score.examNumber));
  const students = enrollments
    .filter((enrollment) => !scoredExamNumbers.has(enrollment.student.examNumber))
    .map((enrollment) => ({
      examNumber: enrollment.student.examNumber,
      name: enrollment.student.name,
      phone: enrollment.student.phone,
      examType: enrollment.student.examType,
      notificationConsent: enrollment.student.notificationConsent,
    }));

  return {
    session,
    expectedCount: enrollments.length,
    scoreCount: scores.length,
    missingCount: students.length,
    students,
  } satisfies MissingScoreSessionSummary;
}
