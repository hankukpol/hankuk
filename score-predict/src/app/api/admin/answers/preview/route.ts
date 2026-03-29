import { NextRequest, NextResponse } from "next/server";
import {
  buildAnswerKey,
  getSubjectsByExamType,
  normalizeAnswerRows,
  parseExamType,
  parsePositiveInt,
  type RawAnswerRow,
} from "@/lib/admin-answer-keys";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

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

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function isSameScore(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function collectChanges(params: {
  existingRows: ExistingAnswerRow[];
  nextRows: Array<{ subjectId: number; questionNumber: number; answer: number }>;
  isConfirmed: boolean;
}) {
  const { existingRows, nextRows, isConfirmed } = params;
  const existingByKey = new Map(
    existingRows.map((row) => [buildAnswerKey(row.subjectId, row.questionNumber), row] as const)
  );
  const nextByKey = new Map(
    nextRows.map((row) => [buildAnswerKey(row.subjectId, row.questionNumber), row] as const)
  );
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

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("answers");
  if (featureError) return featureError;

  try {
    const body = (await request.json()) as {
      examId?: number;
      examType?: string;
      isConfirmed?: boolean;
      answers?: RawAnswerRow[];
    };

    const examId = parsePositiveInt(body.examId);
    const examType = parseExamType(body.examType ?? null);

    if (!examId) {
      return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
    }

    if (!examType) {
      return NextResponse.json(
        { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 이어야 합니다." },
        { status: 400 }
      );
    }

    const isConfirmed = body.isConfirmed === true;
    const rawRows = Array.isArray(body.answers) ? body.answers : [];

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

    if (!hasAnyChange) {
      return NextResponse.json({
        changedQuestions: 0,
        statusChangedCount: 0,
        affectedSubmissions: 0,
        scoreChanges: {
          increased: 0,
          decreased: 0,
          unchanged: 0,
        },
      });
    }

    if (changedQuestions < 1) {
      return NextResponse.json({
        changedQuestions: 0,
        statusChangedCount,
        affectedSubmissions: 0,
        scoreChanges: {
          increased: 0,
          decreased: 0,
          unchanged: 0,
        },
      });
    }

    const pointBySubjectId = new Map(
      subjects.map((subject) => [subject.id, subject.pointPerQuestion] as const)
    );
    const changedByKey = new Map(
      answerChanges.map((change) => [buildAnswerKey(change.subjectId, change.questionNumber), change] as const)
    );

    const submissions = await prisma.submission.findMany({
      where: {
        examId,
        examType,
      },
      select: {
        id: true,
        finalScore: true,
        userAnswers: {
          select: {
            subjectId: true,
            questionNumber: true,
            selectedAnswer: true,
          },
        },
      },
    });

    let increased = 0;
    let decreased = 0;
    let unchanged = 0;

    for (const submission of submissions) {
      const selectedByKey = new Map(
        submission.userAnswers.map((row) => [
          buildAnswerKey(row.subjectId, row.questionNumber),
          row.selectedAnswer,
        ] as const)
      );

      let delta = 0;
      for (const [key, change] of changedByKey) {
        const selected = selectedByKey.get(key);
        if (!selected) {
          continue;
        }

        const oldCorrect = change.oldAnswer !== null && selected === change.oldAnswer;
        const newCorrect = selected === change.newAnswer;
        if (oldCorrect === newCorrect) {
          continue;
        }

        const pointPerQuestion = pointBySubjectId.get(change.subjectId) ?? 0;
        delta += newCorrect ? pointPerQuestion : -pointPerQuestion;
      }

      const currentFinalScore = roundScore(submission.finalScore);
      const nextFinalScore = roundScore(currentFinalScore + delta);

      if (isSameScore(currentFinalScore, nextFinalScore)) {
        unchanged += 1;
      } else if (nextFinalScore > currentFinalScore) {
        increased += 1;
      } else {
        decreased += 1;
      }
    }

    return NextResponse.json({
      changedQuestions,
      statusChangedCount,
      affectedSubmissions: submissions.length,
      scoreChanges: {
        increased,
        decreased,
        unchanged,
      },
    });
  } catch (error) {
    console.error("정답 재채점 미리보기 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "정답 재채점 미리보기 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
