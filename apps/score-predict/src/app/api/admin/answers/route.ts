import { ExamType, SubmissionScoringStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  buildAnswerKey,
  getSubjectsByExamType,
  normalizeAnswerRows,
  parseBoolean,
  parseCsvRows,
  parseExamType,
  parsePositiveInt,
  type NormalizedAnswerRow,
  type RawAnswerRow,
} from "@/lib/admin-answer-keys";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { invalidateCorrectRateCache } from "@/lib/correct-rate";
import { prisma } from "@/lib/prisma";
import { rescoreExam } from "@/lib/scoring";

export const runtime = "nodejs";

type ExistingAnswerRow = {
  subjectId: number;
  questionNumber: number;
  correctAnswer: number;
  isConfirmed: boolean;
};

type AnswerChangeRow = {
  subjectId: number;
  questionNumber: number;
  oldAnswer: number | null;
  newAnswer: number;
};

function buildNextByKey(rows: NormalizedAnswerRow[]): Map<string, NormalizedAnswerRow> {
  return new Map(rows.map((row) => [buildAnswerKey(row.subjectId, row.questionNumber), row] as const));
}

function collectChanges(params: {
  existingRows: ExistingAnswerRow[];
  nextRows: NormalizedAnswerRow[];
  isConfirmed: boolean;
}) {
  const { existingRows, nextRows, isConfirmed } = params;

  const existingByKey = new Map<string, ExistingAnswerRow>();
  for (const row of existingRows) {
    existingByKey.set(buildAnswerKey(row.subjectId, row.questionNumber), row);
  }

  const nextByKey = buildNextByKey(nextRows);
  const allKeys = new Set([...existingByKey.keys(), ...nextByKey.keys()]);

  const answerChanges: AnswerChangeRow[] = [];
  let statusChangedCount = 0;

  for (const key of allKeys) {
    const existing = existingByKey.get(key);
    const next = nextByKey.get(key);

    if (!next) {
      continue;
    }

    if (!existing) {
      answerChanges.push({
        subjectId: next.subjectId,
        questionNumber: next.questionNumber,
        oldAnswer: null,
        newAnswer: next.answer,
      });
      continue;
    }

    if (existing.correctAnswer !== next.answer) {
      answerChanges.push({
        subjectId: next.subjectId,
        questionNumber: next.questionNumber,
        oldAnswer: existing.correctAnswer,
        newAnswer: next.answer,
      });
    }

    if (existing.isConfirmed !== isConfirmed) {
      statusChangedCount += 1;
    }
  }

  return {
    answerChanges,
    changedQuestions: answerChanges.length,
    statusChangedCount,
    hasAnyChange: answerChanges.length > 0 || statusChangedCount > 0,
  };
}

async function parseRequestPayload(request: NextRequest): Promise<{
  examId: number | null;
  examType: ExamType | null;
  isConfirmed: boolean;
  reason: string | null;
  rawRows: RawAnswerRow[];
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const examId = parsePositiveInt(formData.get("examId")?.toString());
    const examType = parseExamType(formData.get("examType")?.toString() ?? null);
    const isConfirmed = parseBoolean(formData.get("isConfirmed")?.toString() ?? null, false);
    const reasonRaw = formData.get("reason")?.toString() ?? "";
    const reason = reasonRaw.trim() ? reasonRaw.trim() : null;

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("CSV 파일을 첨부해 주세요.");
    }

    const MAX_CSV_SIZE = 1024 * 1024; // 1MB
    if (file.size > MAX_CSV_SIZE) {
      throw new Error("CSV 파일 크기는 1MB 이하여야 합니다.");
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".txt")) {
      throw new Error("CSV 또는 TXT 파일만 업로드할 수 있습니다.");
    }

    const csvText = await file.text();
    const rawRows = parseCsvRows(csvText);
    return { examId, examType, isConfirmed, reason, rawRows };
  }

  const body = (await request.json()) as {
    examId?: number;
    examType?: string;
    isConfirmed?: unknown;
    reason?: string;
    answers?: RawAnswerRow[];
  };

  const examId = parsePositiveInt(body.examId);
  const examType = parseExamType(body.examType ?? null);

  if (body.isConfirmed !== undefined && typeof body.isConfirmed !== "boolean") {
    throw new Error("isConfirmed는 boolean 타입이어야 합니다.");
  }

  return {
    examId,
    examType,
    isConfirmed: typeof body.isConfirmed === "boolean" ? body.isConfirmed : false,
    reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
    rawRows: Array.isArray(body.answers) ? body.answers : [],
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const examId = parsePositiveInt(searchParams.get("examId"));
  const examType = parseExamType(searchParams.get("examType"));

  if (!examId) {
    return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
  }

  if (!examType) {
    return NextResponse.json(
      { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 이어야 합니다." },
      { status: 400 }
    );
  }

  const confirmedParam = searchParams.get("confirmed");
  const confirmedFilter =
    confirmedParam === null ? undefined : parseBoolean(confirmedParam, false);

  const subjects = await getSubjectsByExamType(examType);

  const answerKeys = await prisma.answerKey.findMany({
    where: {
      examId,
      subjectId: { in: subjects.map((subject) => subject.id) },
      ...(confirmedFilter === undefined ? {} : { isConfirmed: confirmedFilter }),
    },
    orderBy: [{ subjectId: "asc" }, { questionNumber: "asc" }],
    include: {
      subject: {
        select: {
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    examId,
    examType,
    confirmed: confirmedFilter ?? null,
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      questionCount: subject.questionCount,
    })),
    answers: answerKeys.map((answerKey) => ({
      subjectId: answerKey.subjectId,
      subjectName: answerKey.subject.name,
      questionNumber: answerKey.questionNumber,
      answer: answerKey.correctAnswer,
      isConfirmed: answerKey.isConfirmed,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  try {
    let body: {
      examId?: number;
      examType?: string;
      reason?: string;
    };

    try {
      body = (await request.json()) as {
        examId?: number;
        examType?: string;
        reason?: string;
      };
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const examId = parsePositiveInt(body.examId);
    const examType = parseExamType(body.examType ?? null);
    if (!examId) {
      return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
    }
    if (!examType) {
      return NextResponse.json(
        { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 중 하나여야 합니다." },
        { status: 400 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true },
    });
    if (!exam) {
      return NextResponse.json({ error: "해당 시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const subjects = await getSubjectsByExamType(examType);
    if (subjects.length < 1) {
      return NextResponse.json({ error: "해당 유형의 시험 과목 정보를 찾을 수 없습니다." }, { status: 400 });
    }
    const subjectIds = subjects.map((subject) => subject.id);

    const resetResult = await prisma.$transaction(async (tx) => {
      const deletedAnswerKeys = await tx.answerKey.deleteMany({
        where: {
          examId,
          subjectId: { in: subjectIds },
        },
      });

      const affectedSubmissions = await tx.submission.count({
        where: {
          examId,
          examType,
        },
      });

      const pendingUpdated = await tx.submission.updateMany({
        where: {
          examId,
          examType,
        },
        data: {
          scoringStatus: SubmissionScoringStatus.PENDING,
        },
      });

      const clearedSubjectScores = await tx.subjectScore.deleteMany({
        where: {
          submission: {
            examId,
            examType,
          },
        },
      });

      return {
        deletedQuestions: deletedAnswerKeys.count,
        affectedSubmissions,
        pendingUpdatedCount: pendingUpdated.count,
        clearedSubjectScoreCount: clearedSubjectScores.count,
      };
    });

    invalidateCorrectRateCache(examId, examType);

    return NextResponse.json({
      success: true,
      ...resetResult,
    });
  } catch (error) {
    console.error("정답 초기화 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "정답 초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  const adminUserId = Number(guard.session.user.id);
  if (!Number.isInteger(adminUserId) || adminUserId < 1) {
    return NextResponse.json({ error: "관리자 사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  try {
    const { examId, examType, isConfirmed, reason, rawRows } = await parseRequestPayload(request);

    if (!examId) {
      return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
    }

    if (!examType) {
      return NextResponse.json(
        { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 이어야 합니다." },
      { status: 400 }
    );
  }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true },
    });

    if (!exam) {
      return NextResponse.json({ error: "해당 시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const subjects = await getSubjectsByExamType(examType);
    if (subjects.length === 0) {
      return NextResponse.json({ error: "시험 과목 정보를 찾을 수 없습니다." }, { status: 400 });
    }

    const normalized = normalizeAnswerRows(rawRows, subjects);
    if (!normalized.data) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const normalizedRows = normalized.data;

    const existingAnswerKeys = await prisma.answerKey.findMany({
      where: {
        examId,
        subjectId: { in: subjects.map((subject) => subject.id) },
      },
      select: {
        subjectId: true,
        questionNumber: true,
        correctAnswer: true,
        isConfirmed: true,
      },
    });

    const { answerChanges, changedQuestions, statusChangedCount, hasAnyChange } = collectChanges({
      existingRows: existingAnswerKeys,
      nextRows: normalizedRows,
      isConfirmed,
    });
    const pendingSubmissionCount = await prisma.submission.count({
      where: {
        examId,
        examType,
        scoringStatus: SubmissionScoringStatus.PENDING,
      },
    });
    const shouldRunRescore = changedQuestions > 0 || pendingSubmissionCount > 0;
    const subjectNameById = new Map(subjects.map((subject) => [subject.id, subject.name] as const));
    const runRescore = () =>
      rescoreExam(examId, {
        reason: reason ?? undefined,
        adminUserId,
        examType,
        changedQuestions: answerChanges.map((change) => ({
          subjectName: subjectNameById.get(change.subjectId) ?? `subject#${change.subjectId}`,
          questionNumber: change.questionNumber,
          oldAnswer: change.oldAnswer,
          newAnswer: change.newAnswer,
        })),
      });

    if (!hasAnyChange) {
      if (!shouldRunRescore) {
        return NextResponse.json({
          success: true,
          savedCount: normalizedRows.length,
          isConfirmed,
          changedQuestions: 0,
          statusChangedCount: 0,
          rescoredCount: 0,
          message: "변경된 정답이 없어 저장을 생략했습니다.",
        });
      }
      const rescoreResult = await runRescore();
      return NextResponse.json({
        success: true,
        savedCount: normalizedRows.length,
        isConfirmed,
        changedQuestions: 0,
        statusChangedCount: 0,
        rescoredCount: rescoreResult.rescoredCount,
        rescoreEventId: rescoreResult.rescoreEventId,
        scoreChanges: rescoreResult.scoreChanges,
        message: "정답 변경은 없지만 채점 대기 제출을 자동 채점했습니다.",
      });
    }

    if (changedQuestions < 1 && statusChangedCount > 0) {
      await prisma.answerKey.updateMany({
        where: {
          examId,
          subjectId: { in: subjects.map((subject) => subject.id) },
        },
        data: { isConfirmed },
      });

      if (!shouldRunRescore) {
        return NextResponse.json({
          success: true,
          savedCount: normalizedRows.length,
          isConfirmed,
          changedQuestions: 0,
          statusChangedCount,
          rescoredCount: 0,
          message: "정답 상태만 변경되어 재채점을 생략했습니다.",
        });
      }

      const rescoreResult = await runRescore();
      return NextResponse.json({
        success: true,
        savedCount: normalizedRows.length,
        isConfirmed,
        changedQuestions: 0,
        statusChangedCount,
        rescoredCount: rescoreResult.rescoredCount,
        rescoreEventId: rescoreResult.rescoreEventId,
        scoreChanges: rescoreResult.scoreChanges,
        message: "정답 상태 변경 후 채점 대기 제출을 자동 채점했습니다.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.answerKey.deleteMany({
        where: {
          examId,
          subjectId: { in: subjects.map((subject) => subject.id) },
        },
      });

      await tx.answerKey.createMany({
        data: normalizedRows.map((row) => ({
          examId,
          subjectId: row.subjectId,
          questionNumber: row.questionNumber,
          correctAnswer: row.answer,
          isConfirmed,
        })),
      });

      if (answerChanges.length > 0) {
        await tx.answerKeyLog.createMany({
          data: answerChanges.map((change) => ({
            examId,
            examType,
            subjectId: change.subjectId,
            questionNumber: change.questionNumber,
            oldAnswer: change.oldAnswer,
            newAnswer: change.newAnswer,
            changedBy: adminUserId,
          })),
        });
      }
    });

    const rescoreResult = await runRescore();

    return NextResponse.json(
      {
        success: true,
        savedCount: normalizedRows.length,
        isConfirmed,
        changedQuestions,
        statusChangedCount,
        rescoredCount: rescoreResult.rescoredCount,
        rescoreEventId: rescoreResult.rescoreEventId,
        scoreChanges: rescoreResult.scoreChanges,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      const userErrors = [
        "CSV 파일을 첨부해 주세요.",
        "isConfirmed는 boolean 타입이어야 합니다.",
        "CSV 파일 크기는 1MB 이하여야 합니다.",
        "CSV 또는 TXT 파일만 업로드할 수 있습니다.",
      ];
      if (userErrors.includes(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.error("정답 저장 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "정답 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
