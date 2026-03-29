import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";
import { rescoreExam } from "@/lib/scoring";

export const runtime = "nodejs";

interface RescoreRequestBody {
  examId?: unknown;
  examType?: unknown;
  reason?: unknown;
}

function parseExamType(value: unknown): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER_RESCUE) return ExamType.CAREER_RESCUE;
  if (value === ExamType.CAREER_ACADEMIC) return ExamType.CAREER_ACADEMIC;
  if (value === ExamType.CAREER_EMT) return ExamType.CAREER_EMT;
  return null;
}

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  try {
    let body: RescoreRequestBody;
    try {
      body = (await request.json()) as RescoreRequestBody;
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const adminUserId = parsePositiveInt(guard.session.user.id);
    if (!adminUserId) {
      return NextResponse.json({ error: "관리자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    const examId = parsePositiveInt(body.examId);
    if (!examId) {
      return NextResponse.json({ error: "유효한 examId가 필요합니다." }, { status: 400 });
    }

    const hasExamTypeField = body.examType !== undefined && body.examType !== null;
    const requestedExamType = parseExamType(body.examType);
    if (hasExamTypeField && !requestedExamType) {
      return NextResponse.json({ error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT만 가능합니다." }, { status: 400 });
    }

    const reason = parseOptionalText(body.reason);
    const targetExamTypes = requestedExamType
      ? [requestedExamType]
      : (
          await prisma.submission.findMany({
            where: { examId },
            select: { examType: true },
            distinct: ["examType"],
          })
        ).map((row) => row.examType);

    if (targetExamTypes.length < 1) {
      const rescoreResult = await rescoreExam(examId);
      return NextResponse.json({
        success: true,
        examId,
        examTypes: [],
        rescoredCount: rescoreResult.rescoredCount,
        rescoreEventId: rescoreResult.rescoreEventId,
        rescoreEventIds: [],
        scoreChanges: rescoreResult.scoreChanges,
        message: `${rescoreResult.rescoredCount}건의 제출 데이터 재채점이 완료되었습니다.`,
      });
    }

    const scoreChanges = {
      increased: 0,
      decreased: 0,
      unchanged: 0,
    };
    const rescoreEventIds: number[] = [];
    let rescoredCount = 0;

    for (const examType of targetExamTypes) {
      const result = await rescoreExam(examId, {
        reason,
        adminUserId,
        examType,
        changedQuestions: [],
      });
      rescoredCount += result.rescoredCount;
      scoreChanges.increased += result.scoreChanges.increased;
      scoreChanges.decreased += result.scoreChanges.decreased;
      scoreChanges.unchanged += result.scoreChanges.unchanged;
      if (result.rescoreEventId !== null) {
        rescoreEventIds.push(result.rescoreEventId);
      }
    }

    return NextResponse.json({
      success: true,
      examId,
      examTypes: targetExamTypes,
      rescoredCount,
      rescoreEventId: rescoreEventIds.length === 1 ? rescoreEventIds[0] : null,
      rescoreEventIds,
      scoreChanges,
      message: `${rescoredCount}건의 제출 데이터 재채점이 완료되었습니다.`,
    });
  } catch (error) {
    console.error("재채점 처리 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "재채점 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
