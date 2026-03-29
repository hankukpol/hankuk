import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

function maskPhone(phone: string): string {
  // "01012345678" → "010****5678", "010-1234-5678" → "010-****-5678"
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return digits.slice(0, 3) + "****" + digits.slice(-4);
}

export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("id"));
  if (!submissionId) {
    return NextResponse.json({ error: "조회할 제출 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        examId: true,
        userId: true,
        regionId: true,
        examType: true,
        gender: true,
        examNumber: true,
        totalScore: true,
        finalScore: true,
        bonusType: true,
        bonusRate: true,
        isSuspicious: true,
        suspiciousReason: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
        exam: {
          select: {
            name: true,
            year: true,
            round: true,
          },
        },
        region: {
          select: {
            name: true,
          },
        },
        subjectScores: {
          select: {
            id: true,
            subjectId: true,
            rawScore: true,
            isFailed: true,
            subject: {
              select: {
                name: true,
                maxScore: true,
              },
            },
          },
          orderBy: [{ subjectId: "asc" }],
        },
        userAnswers: {
          select: {
            id: true,
            subjectId: true,
            questionNumber: true,
            selectedAnswer: true,
            isCorrect: true,
            subject: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ subjectId: "asc" }, { questionNumber: "asc" }],
        },
        logs: {
          select: {
            id: true,
            action: true,
            ipAddress: true,
            submitDurationMs: true,
            changedFields: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "제출 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        examId: submission.examId,
        examName: submission.exam.name,
        examYear: submission.exam.year,
        examRound: submission.exam.round,
        userId: submission.userId,
        userName: submission.user.name,
        userPhone: maskPhone(submission.user.phone),
        regionId: submission.regionId,
        regionName: submission.region.name,
        examType: submission.examType,
        gender: submission.gender,
        examNumber: submission.examNumber,
        totalScore: Number(submission.totalScore),
        finalScore: Number(submission.finalScore),
        bonusType: submission.bonusType,
        bonusRate: Number(submission.bonusRate),
        isSuspicious: submission.isSuspicious,
        suspiciousReason: submission.suspiciousReason,
        createdAt: submission.createdAt,
      },
      subjectScores: submission.subjectScores.map((subjectScore) => ({
        id: subjectScore.id,
        subjectId: subjectScore.subjectId,
        subjectName: subjectScore.subject.name,
        rawScore: Number(subjectScore.rawScore),
        maxScore: Number(subjectScore.subject.maxScore),
        isFailed: subjectScore.isFailed,
      })),
      answers: submission.userAnswers.map((answer) => ({
        id: answer.id,
        subjectId: answer.subjectId,
        subjectName: answer.subject.name,
        questionNumber: answer.questionNumber,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: answer.isCorrect,
      })),
      logs: submission.logs.map((log) => ({
        id: log.id,
        action: log.action,
        ipAddress: log.ipAddress,
        submitDurationMs: log.submitDurationMs,
        changedFields: log.changedFields,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error("제출 상세 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "제출 상세 조회에 실패했습니다." }, { status: 500 });
  }
}
