import { BonusType, ExamType, Prisma } from "@prisma/client";
import { invalidateCorrectRateCache } from "@/lib/correct-rate";
import { normalizeSubjectName } from "@/lib/exam-utils";
import { SUBJECT_CUTOFF_RATE } from "@/lib/policy";
import { prisma } from "@/lib/prisma";

const RESCORE_BATCH_SIZE = 100;

const BONUS_RATE_BY_TYPE: Record<BonusType, number> = {
  [BonusType.NONE]: 0,
  [BonusType.VETERAN_5]: 0.05,
  [BonusType.VETERAN_10]: 0.1,
  [BonusType.HERO_3]: 0.03,
  [BonusType.HERO_5]: 0.05,
};

const SUBJECT_RULES: Partial<Record<
  ExamType,
  ReadonlyArray<{
    name: string;
    questionCount: number;
    pointPerQuestion: number;
    maxScore: number;
  }>
>> = {
  [ExamType.PUBLIC]: [
    { name: "헌법", questionCount: 20, pointPerQuestion: 2.5, maxScore: 50 },
    { name: "형사법", questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
    { name: "경찰학", questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
  ],
  [ExamType.CAREER]: [
    { name: "범죄학", questionCount: 20, pointPerQuestion: 2.5, maxScore: 50 },
    { name: "형사법", questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
    { name: "경찰학", questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
  ],
};

const VALID_BONUS_TYPES = new Set(Object.values(BonusType));

interface SubjectMeta {
  id: number;
  name: string;
  questionCount: number;
  pointPerQuestion: number;
  maxScore: number;
}

interface ScoringContext {
  subjects: SubjectMeta[];
  answerKeyMap: Map<string, number>;
}

export interface AnswerInput {
  subjectName: string;
  questionNo: number;
  answer: number;
}

export interface UserAnswerResult {
  subjectId: number;
  subjectName: string;
  questionNo: number;
  selectedAnswer: number;
  isCorrect: boolean;
}

export interface SubjectScoreResult {
  subjectId: number;
  subjectName: string;
  questionCount: number;
  correctCount: number;
  rawScore: number;
  maxScore: number;
  bonusScore: number;
  finalScore: number;
  isCutoff: boolean;
}

export interface ScoreResult {
  examType: ExamType;
  totalScore: number;
  bonusScore: number;
  finalScore: number;
  hasCutoff: boolean;
  scores: SubjectScoreResult[];
  userAnswers: UserAnswerResult[];
}

interface CalculateScoreParams {
  examId: number;
  examType: ExamType;
  answers: AnswerInput[];
  bonusType?: BonusType | null;
  bonusRate?: number | null;
  tx?: Prisma.TransactionClient;
}

export interface RescoreChangedQuestion {
  subjectName: string;
  questionNumber: number;
  oldAnswer: number | null;
  newAnswer: number;
}

export interface RescoreOptions {
  reason?: string;
  adminUserId: number;
  examType: ExamType;
  changedQuestions?: RescoreChangedQuestion[];
}

export interface RescoreResult {
  rescoredCount: number;
  rescoreEventId: number | null;
  scoreChanges: {
    increased: number;
    decreased: number;
    unchanged: number;
  };
}

function toAnswerKey(subjectId: number, questionNo: number): string {
  return `${subjectId}:${questionNo}`;
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function isSameScore(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function toRankGroupKey(regionId: number, examType: ExamType): string {
  return `${regionId}:${examType}`;
}

function buildRankMapBySubmission<T extends { id: number; regionId: number; examType: ExamType; finalScore: number }>(
  rows: T[]
): Map<number, number> {
  const byGroup = new Map<string, T[]>();

  for (const row of rows) {
    const key = toRankGroupKey(row.regionId, row.examType);
    const group = byGroup.get(key) ?? [];
    group.push(row);
    byGroup.set(key, group);
  }

  const rankBySubmissionId = new Map<number, number>();

  for (const groupRows of byGroup.values()) {
    const sorted = [...groupRows].sort((a, b) => b.finalScore - a.finalScore || a.id - b.id);
    let processed = 0;
    let index = 0;

    while (index < sorted.length) {
      const bandScore = roundScore(sorted[index].finalScore);
      const bandRows: T[] = [];

      while (index < sorted.length && isSameScore(roundScore(sorted[index].finalScore), bandScore)) {
        bandRows.push(sorted[index]);
        index += 1;
      }

      const rank = processed + 1;
      for (const row of bandRows) {
        rankBySubmissionId.set(row.id, rank);
      }
      processed += bandRows.length;
    }
  }

  return rankBySubmissionId;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sortAndValidateSubjects(examType: ExamType, subjects: SubjectMeta[]): SubjectMeta[] {
  const rule = SUBJECT_RULES[examType] ?? [];
  const subjectByName = new Map(
    subjects.map((subject) => [normalizeSubjectName(subject.name), subject] as const)
  );

  const ordered = rule.map((required) => {
    const matched = subjectByName.get(normalizeSubjectName(required.name));
    if (!matched) {
      throw new Error(`${examType} 과목 구성에 ${required.name}이(가) 없습니다.`);
    }

    const point = roundScore(matched.pointPerQuestion);
    if (
      matched.questionCount !== required.questionCount ||
      point !== required.pointPerQuestion ||
      matched.maxScore !== required.maxScore
    ) {
      throw new Error(`${required.name} 과목 설정이 경찰 규정과 일치하지 않습니다.`);
    }

    return matched;
  });

  return ordered;
}

function buildSelectedAnswerMapFromInput(
  answers: AnswerInput[],
  subjects: SubjectMeta[]
): Map<string, number> {
  const selectedAnswers = new Map<string, number>();
  const subjectByName = new Map(
    subjects.map((subject) => [normalizeSubjectName(subject.name), subject] as const)
  );

  for (const answer of answers) {
    const subject = subjectByName.get(normalizeSubjectName(answer.subjectName));
    if (!subject) {
      throw new Error(`유효하지 않은 과목입니다: ${answer.subjectName}`);
    }

    if (
      !Number.isInteger(answer.questionNo) ||
      answer.questionNo < 1 ||
      answer.questionNo > subject.questionCount
    ) {
      throw new Error(`${subject.name} 문항 번호가 올바르지 않습니다.`);
    }

    if (!Number.isInteger(answer.answer) || answer.answer < 1 || answer.answer > 4) {
      throw new Error(`${subject.name} ${answer.questionNo}번 문항 답안은 1~4만 가능합니다.`);
    }

    selectedAnswers.set(toAnswerKey(subject.id, answer.questionNo), answer.answer);
  }

  return selectedAnswers;
}

function normalizeBonusRate(
  bonusType: BonusType | null | undefined,
  bonusRate: number | null | undefined
): number {
  if (typeof bonusRate === "number" && Number.isFinite(bonusRate)) {
    const rounded = roundScore(bonusRate);
    if (rounded >= 0 && rounded <= 0.1) {
      return rounded;
    }
  }

  return getBonusPercent(bonusType);
}

function scoreByAnswerMap(params: {
  examType: ExamType;
  subjects: SubjectMeta[];
  answerKeyMap: Map<string, number>;
  selectedAnswers: Map<string, number>;
  bonusRate: number;
}): ScoreResult {
  const { examType, subjects, answerKeyMap, selectedAnswers, bonusRate } = params;
  const scores: SubjectScoreResult[] = [];
  const userAnswers: UserAnswerResult[] = [];
  let totalScore = 0;
  let totalBonusScore = 0;
  let hasCutoff = false;

  for (const subject of subjects) {
    let correctCount = 0;

    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      const key = toAnswerKey(subject.id, questionNo);
      const correctAnswer = answerKeyMap.get(key);
      if (correctAnswer === undefined) {
        throw new Error(`${subject.name} ${questionNo}번 정답키가 없습니다.`);
      }

      const selectedAnswer = selectedAnswers.get(key);
      if (selectedAnswer === undefined) {
        continue;
      }

      const isCorrect = selectedAnswer === correctAnswer;
      if (isCorrect) {
        correctCount += 1;
      }

      userAnswers.push({
        subjectId: subject.id,
        subjectName: subject.name,
        questionNo,
        selectedAnswer,
        isCorrect,
      });
    }

    const rawScore = roundScore(correctCount * subject.pointPerQuestion);
    const cutoffScore = roundScore(subject.maxScore * SUBJECT_CUTOFF_RATE);
    const isCutoff = rawScore < cutoffScore;
    const bonusScore = isCutoff ? 0 : roundScore(subject.maxScore * bonusRate);
    const finalScore = roundScore(rawScore + bonusScore);

    if (isCutoff) {
      hasCutoff = true;
    }

    totalScore = roundScore(totalScore + rawScore);
    totalBonusScore = roundScore(totalBonusScore + bonusScore);

    scores.push({
      subjectId: subject.id,
      subjectName: subject.name,
      questionCount: subject.questionCount,
      correctCount,
      rawScore,
      maxScore: subject.maxScore,
      bonusScore,
      finalScore,
      isCutoff,
    });
  }

  return {
    examType,
    totalScore,
    bonusScore: totalBonusScore,
    finalScore: roundScore(totalScore + totalBonusScore),
    hasCutoff,
    scores,
    userAnswers,
  };
}

async function loadScoringContext(
  tx: Prisma.TransactionClient,
  examId: number,
  examType: ExamType
): Promise<ScoringContext> {
  const subjectsRaw = await tx.subject.findMany({
    where: { examType },
    select: {
      id: true,
      name: true,
      questionCount: true,
      pointPerQuestion: true,
      maxScore: true,
    },
  });

  if (subjectsRaw.length === 0) {
    throw new Error(`${examType} 과목 설정이 존재하지 않습니다.`);
  }

  const subjects = sortAndValidateSubjects(examType, subjectsRaw);
  const subjectIds = subjects.map((subject) => subject.id);

  const answerKeys = await tx.answerKey.findMany({
    where: {
      examId,
      subjectId: { in: subjectIds },
    },
    select: {
      subjectId: true,
      questionNumber: true,
      correctAnswer: true,
    },
  });

  const answerKeyMap = new Map<string, number>();
  for (const answerKey of answerKeys) {
    answerKeyMap.set(toAnswerKey(answerKey.subjectId, answerKey.questionNumber), answerKey.correctAnswer);
  }

  for (const subject of subjects) {
    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      if (!answerKeyMap.has(toAnswerKey(subject.id, questionNo))) {
        throw new Error(`${subject.name} 정답키가 모두 입력되지 않았습니다.`);
      }
    }
  }

  return { subjects, answerKeyMap };
}

export function isValidBonusType(bonusType: string | null | undefined): bonusType is BonusType {
  return typeof bonusType === "string" && VALID_BONUS_TYPES.has(bonusType as BonusType);
}

export function getBonusPercent(bonusType: BonusType | string | null | undefined): number {
  if (!bonusType || typeof bonusType !== "string") {
    return 0;
  }

  if (!isValidBonusType(bonusType)) {
    return 0;
  }

  return BONUS_RATE_BY_TYPE[bonusType];
}

export function getBonusTypeFromPercent(veteranPercent: number, heroPercent: number): BonusType {
  if (veteranPercent > 0 && heroPercent > 0) {
    throw new Error("취업지원과 의사상자 가산점은 동시에 적용할 수 없습니다.");
  }

  if (![0, 5, 10].includes(veteranPercent)) {
    throw new Error("취업지원 가산점은 0%, 5%, 10%만 가능합니다.");
  }

  if (![0, 3, 5].includes(heroPercent)) {
    throw new Error("의사상자 가산점은 0%, 3%, 5%만 가능합니다.");
  }

  if (veteranPercent === 10) return BonusType.VETERAN_10;
  if (veteranPercent === 5) return BonusType.VETERAN_5;
  if (heroPercent === 5) return BonusType.HERO_5;
  if (heroPercent === 3) return BonusType.HERO_3;
  return BonusType.NONE;
}

export async function calculateScore(params: CalculateScoreParams): Promise<ScoreResult> {
  const { examId, examType, answers, bonusType, bonusRate } = params;

  if (!Number.isInteger(examId) || examId <= 0) {
    throw new Error("유효한 examId가 필요합니다.");
  }

  const tx = params.tx ?? prisma;
  const { subjects, answerKeyMap } = await loadScoringContext(tx, examId, examType);
  const selectedAnswers = buildSelectedAnswerMapFromInput(answers, subjects);
  const normalizedBonusRate = normalizeBonusRate(bonusType, bonusRate);

  return scoreByAnswerMap({
    examType,
    subjects,
    answerKeyMap,
    selectedAnswers,
    bonusRate: normalizedBonusRate,
  });
}

export async function rescoreExam(examId: number, options?: RescoreOptions): Promise<RescoreResult> {
  if (!Number.isInteger(examId) || examId <= 0) {
    throw new Error("유효한 examId가 필요합니다.");
  }

  const targetExamType = options?.examType;
  const submissionWhere: Prisma.SubmissionWhereInput = {
    examId,
    ...(targetExamType ? { examType: targetExamType } : {}),
  };

  const allSubmissions = await prisma.submission.findMany({
    where: submissionWhere,
    select: {
      id: true,
      userId: true,
      regionId: true,
      examType: true,
      totalScore: true,
      finalScore: true,
    },
    orderBy: { id: "asc" },
  });

  if (allSubmissions.length === 0) {
    return {
      rescoredCount: 0,
      rescoreEventId: null,
      scoreChanges: {
        increased: 0,
        decreased: 0,
        unchanged: 0,
      },
    };
  }

  const detailedMode =
    options !== undefined &&
    Number.isInteger(options.adminUserId) &&
    options.adminUserId > 0 &&
    (options.examType === ExamType.PUBLIC || options.examType === ExamType.CAREER);
  const changedQuestions = options?.changedQuestions ?? [];

  let rescoreEventId: number | null = null;
  if (detailedMode && options) {
    const summaryPayload = {
      examType: options.examType,
      changedQuestions,
    };
    const event = await prisma.rescoreEvent.create({
      data: {
        examId,
        examType: options.examType,
        reason: options.reason?.trim() || null,
        summary: JSON.stringify(summaryPayload),
        createdBy: options.adminUserId,
      },
      select: { id: true },
    });
    rescoreEventId = event.id;
  }

  const oldRankMap = detailedMode ? buildRankMapBySubmission(allSubmissions) : new Map<number, number>();
  const detailRows: Array<{
    submissionId: number;
    userId: number;
    oldTotalScore: number;
    newTotalScore: number;
    oldFinalScore: number;
    newFinalScore: number;
    scoreDelta: number;
  }> = [];

  let increased = 0;
  let decreased = 0;
  let unchanged = 0;

  const submissionIdChunks = chunkArray(
    allSubmissions.map((submission) => submission.id),
    RESCORE_BATCH_SIZE
  );

  for (const idChunk of submissionIdChunks) {
    const submissions = await prisma.submission.findMany({
        where: { id: { in: idChunk } },
        select: {
          id: true,
          userId: true,
          regionId: true,
          examType: true,
          totalScore: true,
          finalScore: true,
          bonusType: true,
          bonusRate: true,
          userAnswers: {
            select: {
              id: true,
              subjectId: true,
              questionNumber: true,
              selectedAnswer: true,
              isCorrect: true,
            },
          },
        },
        orderBy: { id: "asc" },
      });

    if (submissions.length === 0) {
      continue;
    }

    const requiredTypes = Array.from(new Set(submissions.map((submission) => submission.examType)));
    const contextByExamType = new Map<ExamType, ScoringContext>();
    for (const examType of requiredTypes) {
      const context = await loadScoringContext(prisma, examId, examType);
      contextByExamType.set(examType, context);
    }

    const batchWrites: Prisma.PrismaPromise<unknown>[] = [];

    for (const submission of submissions) {
      const context = contextByExamType.get(submission.examType);
        if (!context) {
          throw new Error(`${submission.examType} 채점 컨텍스트를 찾을 수 없습니다.`);
        }

      const selectedAnswers = new Map<string, number>();
      for (const userAnswer of submission.userAnswers) {
        selectedAnswers.set(
          toAnswerKey(userAnswer.subjectId, userAnswer.questionNumber),
          userAnswer.selectedAnswer
        );
      }

      const normalizedBonusRate = normalizeBonusRate(submission.bonusType, submission.bonusRate);
      const oldTotalScore = roundScore(submission.totalScore);
      const oldFinalScore = roundScore(submission.finalScore);
      const result = scoreByAnswerMap({
        examType: submission.examType,
        subjects: context.subjects,
        answerKeyMap: context.answerKeyMap,
        selectedAnswers,
        bonusRate: normalizedBonusRate,
      });

      batchWrites.push(
        prisma.submission.update({
          where: { id: submission.id },
          data: {
            totalScore: result.totalScore,
            finalScore: result.finalScore,
            bonusRate: normalizedBonusRate,
          },
        })
      );

        const scoreDelta = roundScore(result.finalScore - oldFinalScore);
        if (isSameScore(scoreDelta, 0)) {
          unchanged += 1;
        } else if (scoreDelta > 0) {
          increased += 1;
        } else {
          decreased += 1;
        }

        if (detailedMode) {
          detailRows.push({
            submissionId: submission.id,
            userId: submission.userId,
            oldTotalScore,
            newTotalScore: result.totalScore,
            oldFinalScore,
            newFinalScore: result.finalScore,
            scoreDelta,
          });
        }

      const correctnessByKey = new Map(
        result.userAnswers.map((answer) => [
          toAnswerKey(answer.subjectId, answer.questionNo),
          answer.isCorrect,
        ] as const)
      );
      const correctAnswerIds: number[] = [];
      const incorrectAnswerIds: number[] = [];

      for (const userAnswer of submission.userAnswers) {
        const key = toAnswerKey(userAnswer.subjectId, userAnswer.questionNumber);
        const nextIsCorrect = correctnessByKey.get(key) ?? false;
        if (userAnswer.isCorrect === nextIsCorrect) {
          continue;
        }

        if (nextIsCorrect) {
          correctAnswerIds.push(userAnswer.id);
        } else {
          incorrectAnswerIds.push(userAnswer.id);
        }
      }

      if (correctAnswerIds.length > 0) {
        batchWrites.push(
          prisma.userAnswer.updateMany({
            where: { id: { in: correctAnswerIds } },
            data: { isCorrect: true },
          })
        );
      }

      if (incorrectAnswerIds.length > 0) {
        batchWrites.push(
          prisma.userAnswer.updateMany({
            where: { id: { in: incorrectAnswerIds } },
            data: { isCorrect: false },
          })
        );
      }

      batchWrites.push(
        prisma.subjectScore.deleteMany({
          where: { submissionId: submission.id },
        })
      );

      if (result.scores.length > 0) {
        batchWrites.push(
          prisma.subjectScore.createMany({
            data: result.scores.map((score) => ({
              submissionId: submission.id,
              subjectId: score.subjectId,
              rawScore: score.rawScore,
              isFailed: score.isCutoff,
            })),
          })
        );
      }
    }

    if (batchWrites.length > 0) {
      await prisma.$transaction(batchWrites);
    }
  }

  if (detailedMode && rescoreEventId !== null && detailRows.length > 0) {
    const newSubmissionScores = await prisma.submission.findMany({
      where: submissionWhere,
      select: {
        id: true,
        regionId: true,
        examType: true,
        finalScore: true,
      },
    });
    const newRankMap = buildRankMapBySubmission(
      newSubmissionScores.map((row) => ({
        ...row,
        finalScore: Number(row.finalScore),
      }))
    );

    await prisma.rescoreDetail.createMany({
      data: detailRows.map((row) => ({
        rescoreEventId,
        submissionId: row.submissionId,
        userId: row.userId,
        oldTotalScore: row.oldTotalScore,
        newTotalScore: row.newTotalScore,
        oldFinalScore: row.oldFinalScore,
        newFinalScore: row.newFinalScore,
        oldRank: oldRankMap.get(row.submissionId) ?? null,
        newRank: newRankMap.get(row.submissionId) ?? null,
        scoreDelta: row.scoreDelta,
        isRead: false,
      })),
    });
  }

  invalidateCorrectRateCache(examId);

  return {
    rescoredCount: allSubmissions.length,
    rescoreEventId,
    scoreChanges: {
      increased,
      decreased,
      unchanged,
    },
  };
}
