import { NextRequest, NextResponse } from "next/server";
import { parseExamType, parsePositiveInt } from "@/lib/admin-answer-keys";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }
  return Math.min(parsed, 300);
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const examId = parsePositiveInt(searchParams.get("examId"));
  const examType = parseExamType(searchParams.get("examType"));
  const limit = parseLimit(searchParams.get("limit"));

  if (!examId) {
    return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
  }

  if (!examType) {
    return NextResponse.json(
      { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 이어야 합니다." },
      { status: 400 }
    );
  }

  const logs = await prisma.answerKeyLog.findMany({
    where: {
      examId,
      examType,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      questionNumber: true,
      oldAnswer: true,
      newAnswer: true,
      createdAt: true,
      subject: {
        select: {
          id: true,
          name: true,
        },
      },
      admin: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      subjectId: log.subject.id,
      subjectName: log.subject.name,
      questionNumber: log.questionNumber,
      oldAnswer: log.oldAnswer,
      newAnswer: log.newAnswer,
      changedById: log.admin.id,
      changedByName: log.admin.name,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
