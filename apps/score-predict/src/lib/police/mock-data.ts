import {
  BonusType,
  DifficultyRatingLevel,
  ExamType,
  Gender,
  Prisma,
  Role,
  SubmissionSuspicionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateKnownFinalScore,
  getAppliedPoliceWrittenBonusRate,
} from "@/lib/police/final-score-policy";

const MOCK_USER_PREFIX = "[MOCK]";
const MOCK_PHONE_PREFIX = "090999";
const MOCK_EXAM_NUMBER_PREFIX = "MOCK";
const MOCK_PASSWORD_HASH = "$2b$10$HAfAnxSKfZT/tKe9Gy7TquBLOLCOYOcunzMXDAbmX0CtjayhJBb5S";

const DEFAULT_PUBLIC_PER_REGION = 40;
const DEFAULT_CAREER_PER_REGION = 20;
const MIN_PER_REGION = 1;
const MAX_PER_REGION = 200;

interface SubjectInfo {
  id: number;
  name: string;
  examType: ExamType;
  questionCount: number;
  pointPerQuestion: number;
  maxScore: number;
}

interface RegionInfo {
  id: number;
  name: string;
  recruitCount: number;
  recruitCountCareer: number;
}

interface RegionRaw {
  id: number;
  name: string;
}

interface SubmissionDraft {
  phone: string;
  examType: ExamType;
  regionId: number;
  examNumber: string;
  gender: Gender;
  totalScore: number;
  bonusType: BonusType;
  bonusRate: number;
  finalScore: number;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  submitDurationMs: number;
  subjectScores: Array<{
    subjectId: number;
    correctCount: number;
    rawScore: number;
    isFailed: boolean;
    rating: DifficultyRatingLevel;
  }>;
}

interface FinalPredictionSeedRow {
  submissionId: number;
  userId: number;
  regionId: number;
  examType: ExamType;
  bonusType: BonusType;
  writtenScore: number;
  fitnessPassed: boolean;
  martialDanLevel: number;
  martialBonusPoint: number;
  score75: number | null;
}

export interface GenerateMockDataOptions {
  examId?: number;
  publicPerRegion?: number;
  careerPerRegion?: number;
  careerEnabled?: boolean;
  resetBeforeGenerate?: boolean;
  includeFinalPredictionMock?: boolean;
}

export interface GenerateMockDataResult {
  examId: number;
  examName: string;
  runKey: string;
  deletedBeforeGenerate: {
    submissions: number;
    users: number;
  };
  created: {
    users: number;
    submissions: number;
    subjectScores: number;
    userAnswers: number;
    difficultyRatings: number;
    finalPredictions: number;
  };
}

export interface ResetMockDataOptions {
  examId?: number;
}

export interface ResetMockDataResult {
  examId: number | null;
  deleted: {
    submissions: number;
    users: number;
  };
}

type MockDbClient = Prisma.TransactionClient | typeof prisma;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toSafeInt(value: unknown, fallbackValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  return clamp(Math.floor(parsed), min, max);
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}

function randomGender(): Gender {
  return Math.random() < 0.7 ? Gender.MALE : Gender.FEMALE;
}

function chooseBonusType(recruitCount: number, localIndex: number): BonusType {
  if (localIndex === 2) return BonusType.VETERAN_5;
  if (localIndex === 3) return BonusType.VETERAN_10;
  if (localIndex === 4 && recruitCount >= 10) return BonusType.HERO_3;
  if (localIndex === 5 && recruitCount >= 10) return BonusType.HERO_5;
  return BonusType.NONE;
}

function bonusRateOf(type: BonusType): number {
  if (type === BonusType.VETERAN_5) return 0.05;
  if (type === BonusType.VETERAN_10) return 0.1;
  if (type === BonusType.HERO_3) return 0.03;
  if (type === BonusType.HERO_5) return 0.05;
  return 0;
}

function isVeteranPreferredBonus(type: BonusType): boolean {
  return type === BonusType.VETERAN_5 || type === BonusType.VETERAN_10;
}

function pickMartialDanLevel(): number {
  const roll = Math.random();
  if (roll < 0.16) return 4 + Math.floor(Math.random() * 3); // 4~6단
  if (roll < 0.38) return 2 + Math.floor(Math.random() * 2); // 2~3단
  if (roll < 0.52) return 1;
  return 0;
}

function martialBonusPointByDanLevel(danLevel: number): number {
  if (danLevel >= 4) return 2;
  if (danLevel >= 2) return 1;
  return 0;
}

function compareFinalPredictionSeedRow(left: FinalPredictionSeedRow, right: FinalPredictionSeedRow): number {
  const leftScore = left.score75 ?? -1;
  const rightScore = right.score75 ?? -1;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const veteranCompare = Number(isVeteranPreferredBonus(right.bonusType)) - Number(isVeteranPreferredBonus(left.bonusType));
  if (veteranCompare !== 0) {
    return veteranCompare;
  }

  if (right.writtenScore !== left.writtenScore) {
    return right.writtenScore - left.writtenScore;
  }

  if (right.martialBonusPoint !== left.martialBonusPoint) {
    return right.martialBonusPoint - left.martialBonusPoint;
  }

  return left.submissionId - right.submissionId;
}

function buildFinalPredictionRankMap(rows: FinalPredictionSeedRow[]): Map<number, number> {
  const passRows = rows.filter((row) => row.fitnessPassed && row.score75 !== null);
  const grouped = new Map<string, FinalPredictionSeedRow[]>();

  for (const row of passRows) {
    const key = `${row.regionId}:${row.examType}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(key, [row]);
  }

  const rankMap = new Map<number, number>();

  for (const groupRows of grouped.values()) {
    const sorted = [...groupRows].sort(compareFinalPredictionSeedRow);
    for (let index = 0; index < sorted.length; index += 1) {
      // Competition ranking: 동점자 공동등수, 다음 등수 건너뛰기
      if (index === 0) {
        rankMap.set(sorted[index].submissionId, 1);
      } else {
        const prevScore = sorted[index - 1].score75;
        const currScore = sorted[index].score75;
        if (currScore === prevScore) {
          rankMap.set(sorted[index].submissionId, rankMap.get(sorted[index - 1].submissionId)!);
        } else {
          rankMap.set(sorted[index].submissionId, index + 1);
        }
      }
    }
  }

  return rankMap;
}

function pickDifficultyByPercent(percent: number): DifficultyRatingLevel {
  if (percent >= 90) return DifficultyRatingLevel.VERY_EASY;
  if (percent >= 80) return DifficultyRatingLevel.EASY;
  if (percent >= 65) return DifficultyRatingLevel.NORMAL;
  if (percent >= 50) return DifficultyRatingLevel.HARD;
  return DifficultyRatingLevel.VERY_HARD;
}

function createScoreDraft(
  subjects: SubjectInfo[],
  scorePercent: number,
  allowFailNoise: boolean,
  examType: ExamType
): SubmissionDraft["subjectScores"] {
  return subjects.map((subject) => {
    const localNoise = (Math.random() - 0.5) * 0.12;
    let percent = clamp(scorePercent + localNoise, 0.22, 0.99);

    // Keep a small low-tail to mimic real-world cutoff failures.
    if (allowFailNoise && Math.random() < 0.07) {
      percent = clamp(percent - 0.28, 0.18, 0.5);
    }

    const correctCount = Math.max(
      0,
      Math.min(subject.questionCount, Math.round(subject.questionCount * percent))
    );
    const rawScore = roundOne(correctCount * subject.pointPerQuestion);
    const isFailed = examType === ExamType.PUBLIC && rawScore < subject.maxScore * 0.4;
    const rating = pickDifficultyByPercent((rawScore / subject.maxScore) * 100);

    return {
      subjectId: subject.id,
      correctCount,
      rawScore,
      isFailed,
      rating,
    };
  });
}

function buildFinalPredictionSeedRow(params: {
  submissionId: number;
  userId: number;
  draft: SubmissionDraft;
}): FinalPredictionSeedRow {
  const hasCutoff = params.draft.examType === ExamType.CAREER
    ? params.draft.totalScore < 150
    : params.draft.subjectScores.some((score) => score.isFailed);
  const passChance = hasCutoff
    ? 0.08
    : clamp(0.58 + (params.draft.finalScore / 250) * 0.35, 0.58, 0.95);
  const fitnessPassed = Math.random() < passChance;

  if (!fitnessPassed) {
    return {
      submissionId: params.submissionId,
      userId: params.userId,
      regionId: params.draft.regionId,
      examType: params.draft.examType,
      bonusType: params.draft.bonusType,
      writtenScore: params.draft.finalScore,
      fitnessPassed: false,
      martialDanLevel: 0,
      martialBonusPoint: 0,
      score75: null,
    };
  }

  const martialDanLevel = pickMartialDanLevel();
  const martialBonusPoint = martialBonusPointByDanLevel(martialDanLevel);
  const calculated = calculateKnownFinalScore({
    writtenScore: params.draft.finalScore,
    fitnessPassed: true,
    martialDanLevel,
    appliedWrittenBonusRate: getAppliedPoliceWrittenBonusRate({
      rawWrittenScore: params.draft.totalScore,
      finalWrittenScore: params.draft.finalScore,
    }),
  });

  return {
    submissionId: params.submissionId,
    userId: params.userId,
    regionId: params.draft.regionId,
    examType: params.draft.examType,
    bonusType: params.draft.bonusType,
    writtenScore: params.draft.finalScore,
    fitnessPassed: true,
    martialDanLevel,
    martialBonusPoint,
    score75: calculated.score75,
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length < 1) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function resolveExam(examId?: number, db: MockDbClient = prisma) {
  if (examId && Number.isInteger(examId) && examId > 0) {
    const selected = await db.exam.findUnique({
      where: { id: examId },
      select: { id: true, name: true },
    });
    if (selected) return selected;
  }

  return db.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true },
  });
}

async function resetMockDataWithClient(
  db: MockDbClient,
  options: ResetMockDataOptions = {}
): Promise<ResetMockDataResult> {
  const examId = options.examId;
  const submissionWhere: Prisma.SubmissionWhereInput = {
    examNumber: {
      startsWith: `${MOCK_EXAM_NUMBER_PREFIX}-`,
    },
    ...(examId ? { examId } : {}),
  };

  const existing = await db.submission.findMany({
    where: submissionWhere,
    select: {
      id: true,
      userId: true,
    },
  });

  const submissionIds = existing.map((row) => row.id);
  const candidateUserIds: number[] = Array.from(new Set<number>(existing.map((row) => row.userId)));

  let deletedSubmissionCount = 0;
  for (const ids of chunkArray(submissionIds, 500)) {
    const deleted = await db.submission.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    deletedSubmissionCount += deleted.count;
  }

  const userDeleteWhere: Prisma.UserWhereInput =
    examId && candidateUserIds.length > 0
      ? {
          id: { in: candidateUserIds },
          name: { startsWith: `${MOCK_USER_PREFIX}:` },
          phone: { startsWith: MOCK_PHONE_PREFIX },
          role: Role.USER,
          submissions: { none: {} },
          comments: { none: {} },
          answerKeyLogs: { none: {} },
        }
      : {
          name: { startsWith: `${MOCK_USER_PREFIX}:` },
          phone: { startsWith: MOCK_PHONE_PREFIX },
          role: Role.USER,
          submissions: { none: {} },
          comments: { none: {} },
          answerKeyLogs: { none: {} },
        };

  let deletedUserCount = 0;
  const deletableUsers = await db.user.findMany({
    where: userDeleteWhere,
    select: { id: true },
  });

  for (const ids of chunkArray(deletableUsers.map((row) => row.id), 500)) {
    const deleted = await db.user.deleteMany({
      where: { id: { in: ids } },
    });
    deletedUserCount += deleted.count;
  }

  return {
    examId: examId ?? null,
    deleted: {
      submissions: deletedSubmissionCount,
      users: deletedUserCount,
    },
  };
}

export async function resetMockData(options: ResetMockDataOptions = {}): Promise<ResetMockDataResult> {
  return prisma.$transaction(async (tx) => resetMockDataWithClient(tx, options));
}

export async function generateMockData(
  options: GenerateMockDataOptions = {}
): Promise<GenerateMockDataResult> {
  const targetExam = await resolveExam(options.examId);
  if (!targetExam) {
    throw new Error("활성 시험이 없어 목업 데이터를 생성할 수 없습니다.");
  }

  const publicPerRegion = toSafeInt(
    options.publicPerRegion,
    DEFAULT_PUBLIC_PER_REGION,
    MIN_PER_REGION,
    MAX_PER_REGION
  );
  const careerPerRegion = toSafeInt(
    options.careerPerRegion,
    DEFAULT_CAREER_PER_REGION,
    MIN_PER_REGION,
    MAX_PER_REGION
  );
  const careerEnabled = options.careerEnabled !== false;
  const resetBeforeGenerate = options.resetBeforeGenerate !== false;
  const includeFinalPredictionMock = options.includeFinalPredictionMock !== false;

  const [regionsRaw, quotas, subjects, answerKeys] = await Promise.all([
    prisma.region.findMany({
      where: {
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.examRegionQuota.findMany({
      where: { examId: targetExam.id },
      select: { regionId: true, recruitCount: true, recruitCountCareer: true },
    }),
    prisma.subject.findMany({
      orderBy: [{ examType: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        examType: true,
        questionCount: true,
        pointPerQuestion: true,
        maxScore: true,
      },
    }),
    prisma.answerKey.findMany({
      where: { examId: targetExam.id },
      orderBy: [{ subjectId: "asc" }, { questionNumber: "asc" }],
      select: {
        subjectId: true,
        questionNumber: true,
        correctAnswer: true,
      },
    }),
  ]);

  const quotaByRegionId = new Map(quotas.map((q) => [q.regionId, q]));
  const regions: RegionInfo[] = regionsRaw.map((r: RegionRaw) => ({
    id: r.id,
    name: r.name,
    recruitCount: quotaByRegionId.get(r.id)?.recruitCount ?? 0,
    recruitCountCareer: quotaByRegionId.get(r.id)?.recruitCountCareer ?? 0,
  }));

  const subjectsByType: Partial<Record<ExamType, SubjectInfo[]>> = {
    [ExamType.PUBLIC]: subjects
      .filter((subject) => subject.examType === ExamType.PUBLIC)
      .map((subject) => ({
        ...subject,
        maxScore: Number(subject.maxScore),
      })),
    [ExamType.CAREER]: subjects
      .filter((subject) => subject.examType === ExamType.CAREER)
      .map((subject) => ({
        ...subject,
        maxScore: Number(subject.maxScore),
      })),
  };

  const runKey = `${Date.now()}`;
  const runPhoneSeed = runKey.slice(-8);

  const drafts: SubmissionDraft[] = [];
  const mockUsers: Array<{
    name: string;
    phone: string;
    password: string;
    role: Role;
  }> = [];

  let serial = 0;

  for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
    const region: RegionInfo = regions[regionIndex];

    const examTypes = careerEnabled
      ? ([ExamType.PUBLIC, ExamType.CAREER] as const)
      : ([ExamType.PUBLIC] as const);

    for (const examType of examTypes) {
      const subjectsOfType = subjectsByType[examType] ?? [];
      if (subjectsOfType.length < 1) continue;
      const hasCompleteAnswerKeys = subjectsOfType.every(
        (subject) =>
          answerKeys.filter((key) => key.subjectId === subject.id).length === subject.questionCount
      );
      if (!hasCompleteAnswerKeys) continue;

      const recruitCount =
        examType === ExamType.PUBLIC ? region.recruitCount : region.recruitCountCareer;
      if (!Number.isInteger(recruitCount) || recruitCount < 1) continue;

      const perRegionCount = examType === ExamType.PUBLIC ? publicPerRegion : careerPerRegion;
      const maxTotal = subjectsOfType.reduce((sum, subject) => sum + subject.maxScore, 0);
      const regionBias = ((regionIndex % 9) - 4) * 0.028;
      let tieAnchor: {
        subjectScores: SubmissionDraft["subjectScores"];
        totalScore: number;
        bonusType: BonusType;
        bonusRate: number;
        finalScore: number;
      } | null = null;

      for (let localIndex = 0; localIndex < perRegionCount; localIndex += 1) {
        serial += 1;
        const rankRatio = perRegionCount > 1 ? localIndex / (perRegionCount - 1) : 0;
        const basePercent = 0.92 - rankRatio * 0.36 + regionBias + (Math.random() - 0.5) * 0.03;
        const scorePercent = clamp(basePercent, 0.4, 0.98);
        const isCutoffScenario = localIndex === perRegionCount - 1;
        const isSuspiciousScenario = localIndex === perRegionCount - 2;
        let subjectScores = createScoreDraft(
          subjectsOfType,
          scorePercent,
          rankRatio > 0.82 && !isCutoffScenario && !isSuspiciousScenario,
          examType
        );

        if (isCutoffScenario && subjectScores.length > 0) {
          if (examType === ExamType.CAREER) {
            subjectScores = subjectScores.map((score) => {
              const subject = subjectsOfType.find((candidate) => candidate.id === score.subjectId)!;
              const correctCount = Math.floor(subject.questionCount * 0.5);
              const rawScore = roundOne(correctCount * subject.pointPerQuestion);
              return {
                ...score,
                correctCount,
                rawScore,
                isFailed: false,
                rating: pickDifficultyByPercent(50),
              };
            });
          } else {
            const cutoffSubject = subjectsOfType[0];
            const correctCount = Math.floor(cutoffSubject.questionCount * 0.3);
            const rawScore = roundOne(correctCount * cutoffSubject.pointPerQuestion);
            subjectScores = [
              {
                ...subjectScores[0],
                correctCount,
                rawScore,
                isFailed: true,
                rating: pickDifficultyByPercent(30),
              },
              ...subjectScores.slice(1),
            ];
          }
        } else if (isSuspiciousScenario) {
          subjectScores = subjectScores.map((score) => {
            const subject = subjectsOfType.find((candidate) => candidate.id === score.subjectId);
            if (!subject) return score;
            const correctCount = Math.max(
              score.correctCount,
              Math.ceil(subject.questionCount * 0.45)
            );
            const rawScore = roundOne(correctCount * subject.pointPerQuestion);
            return {
              ...score,
              correctCount,
              rawScore,
              isFailed: false,
              rating: pickDifficultyByPercent((rawScore / subject.maxScore) * 100),
            };
          });
        }

        let totalScore = roundOne(subjectScores.reduce((sum, item) => sum + item.rawScore, 0));
        let bonusType = chooseBonusType(recruitCount, localIndex);
        let bonusRate = bonusRateOf(bonusType);
        const hasSubjectCutoff = subjectScores.some((item) => {
          const subject = subjectsOfType.find((candidate) => candidate.id === item.subjectId);
          return subject ? item.rawScore < subject.maxScore * 0.4 : false;
        });
        const bonusScore = hasSubjectCutoff
          ? 0
          : roundTwo(
              subjectScores.reduce((sum, item) => {
                const subject = subjectsOfType.find((candidate) => candidate.id === item.subjectId);
                if (!subject) {
                  return sum;
                }
                return sum + subject.maxScore * bonusRate;
              }, 0)
            );
        let finalScore = roundTwo(totalScore + bonusScore);

        if (localIndex === 0) {
          bonusType = BonusType.NONE;
          bonusRate = 0;
          finalScore = totalScore;
          tieAnchor = {
            subjectScores: subjectScores.map((score) => ({ ...score })),
            totalScore,
            bonusType,
            bonusRate,
            finalScore,
          };
        } else if (localIndex === 1 && tieAnchor) {
          subjectScores = tieAnchor.subjectScores.map((score) => ({ ...score }));
          totalScore = tieAnchor.totalScore;
          bonusType = tieAnchor.bonusType;
          bonusRate = tieAnchor.bonusRate;
          finalScore = tieAnchor.finalScore;
        }

        const phone = `${MOCK_PHONE_PREFIX}${runPhoneSeed}${String(serial).padStart(4, "0")}`;
        const examNumber = `${MOCK_EXAM_NUMBER_PREFIX}-${targetExam.id}-${runKey}-${region.id}-${examType}-${String(
          localIndex + 1
        ).padStart(3, "0")}`;

        mockUsers.push({
          name: `${MOCK_USER_PREFIX}:${targetExam.id}:${runKey}:${serial}`,
          phone,
          password: MOCK_PASSWORD_HASH,
          role: Role.USER,
        });

        drafts.push({
          phone,
          examType,
          regionId: region.id,
          examNumber,
          gender: randomGender(),
          totalScore: clamp(totalScore, 0, maxTotal),
          bonusType,
          bonusRate,
          finalScore: clamp(finalScore, 0, maxTotal * 1.12),
          isSuspicious: isSuspiciousScenario,
          suspiciousReason: isSuspiciousScenario
            ? "[MOCK] 반복·편중 답안으로 자동 제외된 표본"
            : null,
          submitDurationMs: isSuspiciousScenario ? 1500 : 90_000 + localIndex * 1000,
          subjectScores,
        });
      }
    }
  }

  if (drafts.length < 1) {
    throw new Error("생성 가능한 지역/직렬 데이터가 없어 목업 데이터 생성을 건너뛰었습니다.");
  }

  return prisma.$transaction(async (tx) => {
    const deletedBeforeGenerate = resetBeforeGenerate
      ? await resetMockDataWithClient(tx, { examId: targetExam.id })
      : { examId: targetExam.id, deleted: { submissions: 0, users: 0 } };

    await tx.user.createMany({
      data: mockUsers,
    });

    const createdUsers = await tx.user.findMany({
      where: {
        name: {
          startsWith: `${MOCK_USER_PREFIX}:${targetExam.id}:${runKey}:`,
        },
        phone: {
          startsWith: `${MOCK_PHONE_PREFIX}${runPhoneSeed}`,
        },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    const userIdByPhone = new Map<string, number>(
      createdUsers.map((user) => [user.phone, user.id] as const)
    );
    const submissionCreateData: Prisma.SubmissionCreateManyInput[] = drafts.map((draft) => {
      const userId = userIdByPhone.get(draft.phone);
      if (!userId) {
        throw new Error("생성한 목업 사용자 매핑에 실패했습니다.");
      }

      return {
        examId: targetExam.id,
        userId,
        regionId: draft.regionId,
        examType: draft.examType,
        gender: draft.gender,
        examNumber: draft.examNumber,
        totalScore: draft.totalScore,
        bonusType: draft.bonusType,
        bonusRate: draft.bonusRate,
        finalScore: draft.finalScore,
        isSuspicious: draft.isSuspicious,
        suspiciousReason: draft.suspiciousReason,
        suspicionStatus: draft.isSuspicious
          ? SubmissionSuspicionStatus.EXCLUDED
          : SubmissionSuspicionStatus.CLEAR,
        suspicionAutoReason: draft.suspiciousReason,
        submitDurationMs: draft.submitDurationMs,
      };
    });

    for (const chunk of chunkArray(submissionCreateData, 500)) {
      await tx.submission.createMany({
        data: chunk,
      });
    }

    const createdSubmissions = await tx.submission.findMany({
      where: {
        examId: targetExam.id,
        examNumber: {
          startsWith: `${MOCK_EXAM_NUMBER_PREFIX}-${targetExam.id}-${runKey}-`,
        },
      },
      select: {
        id: true,
        examNumber: true,
      },
    });

    const submissionIdByExamNumber = new Map<string, number>(
      createdSubmissions.map((submission) => [submission.examNumber, submission.id] as const)
    );

    const subjectScoreRows: Prisma.SubjectScoreCreateManyInput[] = [];
    const userAnswerRows: Prisma.UserAnswerCreateManyInput[] = [];
    const difficultyRows: Prisma.DifficultyRatingCreateManyInput[] = [];
    const finalPredictionSeeds: FinalPredictionSeedRow[] = [];

    for (const draft of drafts) {
      const submissionId = submissionIdByExamNumber.get(draft.examNumber);
      if (!submissionId) {
        throw new Error("생성한 목업 제출 데이터 매핑에 실패했습니다.");
      }

      const userId = userIdByPhone.get(draft.phone);
      if (!userId) {
        throw new Error("생성한 목업 사용자 매핑에 실패했습니다.");
      }

      for (const score of draft.subjectScores) {
        subjectScoreRows.push({
          submissionId,
          subjectId: score.subjectId,
          rawScore: score.rawScore,
          isFailed: score.isFailed,
        });

        difficultyRows.push({
          submissionId,
          subjectId: score.subjectId,
          rating: score.rating,
        });

        const subjectAnswerKeys = answerKeys.filter((key) => key.subjectId === score.subjectId);
        const subject = subjects.find((item) => item.id === score.subjectId);
        if (!subject || subjectAnswerKeys.length !== subject.questionCount) {
          throw new Error(`목업 OMR 생성에 필요한 확정답안이 부족합니다. subjectId=${score.subjectId}`);
        }
        for (const [answerIndex, key] of subjectAnswerKeys.entries()) {
          const isCorrect = answerIndex < score.correctCount;
          userAnswerRows.push({
            submissionId,
            subjectId: score.subjectId,
            questionNumber: key.questionNumber,
            selectedAnswer: isCorrect ? key.correctAnswer : (key.correctAnswer % 4) + 1,
            isCorrect,
          });
        }
      }

      if (includeFinalPredictionMock) {
        finalPredictionSeeds.push(
          buildFinalPredictionSeedRow({
            submissionId,
            userId,
            draft,
          })
        );
      }
    }

    for (const chunk of chunkArray(subjectScoreRows, 1000)) {
      await tx.subjectScore.createMany({
        data: chunk,
      });
    }

    for (const chunk of chunkArray(userAnswerRows, 1000)) {
      await tx.userAnswer.createMany({
        data: chunk,
      });
    }

    for (const chunk of chunkArray(difficultyRows, 1000)) {
      await tx.difficultyRating.createMany({
        data: chunk,
      });
    }

    let createdFinalPredictionCount = 0;
    if (includeFinalPredictionMock && finalPredictionSeeds.length > 0) {
      const rankMap = buildFinalPredictionRankMap(finalPredictionSeeds);
      const finalPredictionRows: Prisma.FinalPredictionCreateManyInput[] = finalPredictionSeeds.map((row) => ({
        submissionId: row.submissionId,
        userId: row.userId,
        fitnessScore: row.martialDanLevel,
        interviewScore: null,
        interviewGrade: row.fitnessPassed ? "PASS" : "FAIL",
        finalScore: row.score75,
        finalRank:
          row.fitnessPassed && row.score75 !== null
            ? (rankMap.get(row.submissionId) ?? null)
            : null,
      }));

      for (const chunk of chunkArray(finalPredictionRows, 1000)) {
        await tx.finalPrediction.createMany({
          data: chunk,
        });
      }

      createdFinalPredictionCount = finalPredictionRows.length;
    }

    return {
      examId: targetExam.id,
      examName: targetExam.name,
      runKey,
      deletedBeforeGenerate: deletedBeforeGenerate.deleted,
      created: {
        users: createdUsers.length,
        submissions: createdSubmissions.length,
        subjectScores: subjectScoreRows.length,
        userAnswers: userAnswerRows.length,
        difficultyRatings: difficultyRows.length,
        finalPredictions: createdFinalPredictionCount,
      },
    };
  });
}

