import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface RescoreSummaryPayload {
  changedQuestions?: Array<{
    subjectName: string;
    questionNumber: number;
    oldAnswer: number | null;
    newAnswer: number;
  }>;
}

function parseSummary(summaryText: string): RescoreSummaryPayload {
  try {
    return JSON.parse(summaryText) as RescoreSummaryPayload;
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const [unreadCount, details] = await Promise.all([
    prisma.rescoreDetail.count({
      where: {
        userId,
        isRead: false,
      },
    }),
    prisma.rescoreDetail.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        rescoreEventId: true,
        oldTotalScore: true,
        newTotalScore: true,
        oldFinalScore: true,
        newFinalScore: true,
        oldRank: true,
        newRank: true,
        scoreDelta: true,
        createdAt: true,
        rescoreEvent: {
          select: {
            id: true,
            createdAt: true,
            reason: true,
            summary: true,
            exam: {
              select: {
                id: true,
                name: true,
                year: true,
                round: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: details.map((detail) => {
      const summary = parseSummary(detail.rescoreEvent.summary);
      return {
        notificationId: detail.id,
        rescoreEventId: detail.rescoreEventId,
        examName: detail.rescoreEvent.exam.name,
        examYear: detail.rescoreEvent.exam.year,
        examRound: detail.rescoreEvent.exam.round,
        createdAt: detail.rescoreEvent.createdAt.toISOString(),
        reason: detail.rescoreEvent.reason,
        changedQuestions: summary.changedQuestions ?? [],
        myScoreChange: {
          oldTotalScore: Number(detail.oldTotalScore),
          newTotalScore: Number(detail.newTotalScore),
          oldFinalScore: Number(detail.oldFinalScore),
          newFinalScore: Number(detail.newFinalScore),
          scoreDelta: Number(detail.scoreDelta),
          oldRank: detail.oldRank,
          newRank: detail.newRank,
        },
      };
    }),
  });
}
