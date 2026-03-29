import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChangedQuestionSummary = {
  subjectName: string;
  questionNumber: number;
  oldAnswer: number | null;
  newAnswer: number;
};

type RescoreSummaryPayload = {
  examType?: "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
  changedQuestions?: ChangedQuestionSummary[];
};

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function parseSummary(summaryText: string): RescoreSummaryPayload {
  try {
    return JSON.parse(summaryText) as RescoreSummaryPayload;
  } catch {
    return {};
  }
}

function toImpactText(totalDelta: number, rankDelta: number | null): string {
  if (totalDelta > 0 && rankDelta !== null && rankDelta > 0) {
    return `정답 변경으로 ${totalDelta.toFixed(2)}점 상승, 석차 ${rankDelta}단계 상승했습니다.`;
  }
  if (totalDelta > 0) {
    return `정답 변경으로 ${totalDelta.toFixed(2)}점 상승했습니다.`;
  }
  if (totalDelta < 0 && rankDelta !== null && rankDelta < 0) {
    return `정답 변경으로 ${Math.abs(totalDelta).toFixed(2)}점 하락, 석차 ${Math.abs(rankDelta)}단계 하락했습니다.`;
  }
  if (totalDelta < 0) {
    return `정답 변경으로 ${Math.abs(totalDelta).toFixed(2)}점 하락했습니다.`;
  }
  return "정답 변경이 있었지만 내 점수 변동은 없습니다.";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const isAdmin = ((session.user.role as Role | undefined) ?? Role.USER) === Role.ADMIN;
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("submissionId"));
  if (searchParams.get("submissionId") && !submissionId) {
    return NextResponse.json({ error: "submissionId가 올바르지 않습니다." }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: submissionId
      ? {
          id: submissionId,
          ...(isAdmin ? {} : { userId }),
        }
      : { userId },
    orderBy: submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      examId: true,
      examType: true,
      subjectScores: {
        select: {
          subjectId: true,
          rawScore: true,
          subject: {
            select: {
              name: true,
              pointPerQuestion: true,
            },
          },
        },
      },
      userAnswers: {
        select: {
          subjectId: true,
          questionNumber: true,
          selectedAnswer: true,
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "조회할 성적 데이터가 없습니다." }, { status: 404 });
  }

  const rescoreEvent = await prisma.rescoreEvent.findFirst({
    where: {
      examId: submission.examId,
      examType: submission.examType,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      reason: true,
      summary: true,
      createdAt: true,
    },
  });

  if (!rescoreEvent) {
    return NextResponse.json({
      success: true,
      data: {
        hasChanges: false,
        rescoreEventId: null,
        rescoreDate: null,
        reason: null,
        changedQuestions: [],
        scoreChange: null,
        analysisComment: "아직 정답 변경이 없습니다.",
      },
    });
  }

  const summary = parseSummary(rescoreEvent.summary);
  const changedQuestionsRaw = Array.isArray(summary.changedQuestions) ? summary.changedQuestions : [];

  const detail = await prisma.rescoreDetail.findFirst({
    where: {
      rescoreEventId: rescoreEvent.id,
      submissionId: submission.id,
    },
    select: {
      oldTotalScore: true,
      newTotalScore: true,
      oldFinalScore: true,
      newFinalScore: true,
      oldRank: true,
      newRank: true,
      scoreDelta: true,
    },
  });

  const subjectByName = new Map(submission.subjectScores.map((score) => [score.subject.name, score] as const));

  const answerByKey = new Map(
    submission.userAnswers.map((answer) => [
      `${answer.subjectId}:${answer.questionNumber}`,
      answer.selectedAnswer,
    ] as const)
  );

  const deltaBySubjectName = new Map<string, number>();
  const changedQuestions = changedQuestionsRaw.map((question) => {
    const subject = subjectByName.get(question.subjectName);
    const myAnswer = subject ? answerByKey.get(`${subject.subjectId}:${question.questionNumber}`) ?? null : null;

    const oldCorrect = question.oldAnswer !== null && myAnswer === question.oldAnswer;
    const newCorrect = myAnswer !== null && myAnswer === question.newAnswer;

    let impact: "GAINED" | "LOST" | "NO_CHANGE" = "NO_CHANGE";
    if (!oldCorrect && newCorrect) {
      impact = "GAINED";
    } else if (oldCorrect && !newCorrect) {
      impact = "LOST";
    }

    if (subject && impact !== "NO_CHANGE") {
      const point = Number(subject.subject.pointPerQuestion);
      const signedPoint = impact === "GAINED" ? point : -point;
      deltaBySubjectName.set(question.subjectName, (deltaBySubjectName.get(question.subjectName) ?? 0) + signedPoint);
    }

    return {
      subjectName: question.subjectName,
      questionNumber: question.questionNumber,
      oldAnswer: question.oldAnswer,
      newAnswer: question.newAnswer,
      myAnswer,
      impact,
    };
  });

  const subjectScoreChanges = submission.subjectScores.map((subjectScore) => {
    const subjectName = subjectScore.subject.name;
    const delta = roundNumber(deltaBySubjectName.get(subjectName) ?? 0);
    const newScore = roundNumber(Number(subjectScore.rawScore));
    const oldScore = roundNumber(newScore - delta);
    return {
      subjectName,
      oldScore,
      newScore,
      delta,
    };
  });

  const currentTotalScore = roundNumber(
    submission.subjectScores.reduce((sum, score) => sum + Number(score.rawScore), 0)
  );

  const totalDelta = detail
    ? roundNumber(Number(detail.scoreDelta))
    : roundNumber(subjectScoreChanges.reduce((sum, row) => sum + row.delta, 0));

  const rankDelta =
    detail && detail.oldRank !== null && detail.newRank !== null ? detail.oldRank - detail.newRank : null;

  return NextResponse.json({
    success: true,
    data: {
      hasChanges: changedQuestions.length > 0,
      rescoreEventId: rescoreEvent.id,
      rescoreDate: rescoreEvent.createdAt.toISOString(),
      reason: rescoreEvent.reason,
      changedQuestions,
      scoreChange: {
        subjects: subjectScoreChanges,
        oldTotalScore: detail ? roundNumber(Number(detail.oldTotalScore)) : roundNumber(currentTotalScore - totalDelta),
        newTotalScore: detail ? roundNumber(Number(detail.newTotalScore)) : currentTotalScore,
        totalDelta,
        oldFinalScore: detail ? roundNumber(Number(detail.oldFinalScore)) : null,
        newFinalScore: detail ? roundNumber(Number(detail.newFinalScore)) : null,
        oldRank: detail?.oldRank ?? null,
        newRank: detail?.newRank ?? null,
        rankDelta,
      },
      analysisComment: toImpactText(totalDelta, rankDelta),
    },
  });
}

