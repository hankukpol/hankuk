import { ExamType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SMALL_RECRUIT_PASS_COUNTS: Record<number, number> = {
  1: 3,
  2: 6,
  3: 8,
  4: 9,
  5: 10,
};

const SCORE_KEY_SCALE = 1000000;
const LIKELY_MULTIPLE_STANDARD = 1.2;

export const PREDICTION_DISCLAIMER =
  "본 서비스는 참여자 데이터 기반 예측이며, 실제 합격 결과와 다를 수 있습니다.";

export type PredictionGrade = "확실권" | "유력권" | "가능권" | "도전권";

export type PyramidLevelKey = "sure" | "likely" | "possible" | "challenge" | "belowChallenge";

export interface PredictionCompetitor {
  submissionId: number;
  userId: number;
  rank: number;
  score: number;
  maskedName: string;
  isMine: boolean;
}

export interface PredictionLevel {
  key: PyramidLevelKey;
  label: string;
  count: number;
  minScore: number | null;
  maxScore: number | null;
  minMultiple: number | null;
  maxMultiple: number | null;
  isCurrent: boolean;
}

export interface PredictionSummary {
  submissionId: number;
  examId: number;
  examName: string;
  examYear: number;
  examRound: number;
  userName: string;
  examType: ExamType;
  examTypeLabel: string;
  regionId: number;
  regionName: string;
  recruitCount: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  totalParticipants: number;
  myScore: number;
  myRank: number;
  myMultiple: number;
  oneMultipleBaseRank: number;
  oneMultipleActualRank: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleTieCount: number | null;
  isOneMultipleCutConfirmed: boolean;
  passMultiple: number;
  likelyMultiple: number;
  passCount: number;
  passLineScore: number | null;
  predictionGrade: PredictionGrade;
  disclaimer: string;
}

export interface PredictionResult {
  summary: PredictionSummary;
  pyramid: {
    levels: PredictionLevel[];
    counts: Record<PyramidLevelKey, number>;
  };
  competitors: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    items: PredictionCompetitor[];
  };
  updatedAt: string;
}

interface ScoreBand {
  score: number;
  count: number;
  rank: number;
  endRank: number;
}

interface CalculatePredictionOptions {
  submissionId?: number;
  page?: number;
  limit?: number;
}

interface CompetitorIdentitySource {
  name: string;
  phone?: string | null;
  contactPhone?: string | null;
}

export class PredictionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PredictionError";
    this.status = status;
  }
}

function toSafeNumber(value: number): number {
  return Number(value.toFixed(2));
}

function toExamTypeLabel(examType: ExamType): string {
  return examType === ExamType.CAREER ? "경행경채" : "공채";
}

function toScoreKey(score: number): number {
  return Math.round(score * SCORE_KEY_SCALE);
}

export function maskKoreanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "익명**";

  const chars = Array.from(trimmed);
  return `${chars[0]}**`;
}

function maskCompetitorUsername(username?: string | null): string {
  const trimmed = username?.trim() ?? "";
  if (!trimmed) return "";

  const chars = Array.from(trimmed);
  return `${chars[0]}*****`;
}

function normalizeCompetitorContactPhone(contactPhone?: string | null): string {
  const digits = (contactPhone ?? "").replace(/\D/g, "");
  if (digits.startsWith("010") && digits.length >= 10) {
    return "010*****";
  }

  if (digits.startsWith("10") && digits.length >= 9) {
    return "010*****";
  }

  return "";
}

export function getCompetitorDisplayName(identity: CompetitorIdentitySource): string {
  const username = maskCompetitorUsername(identity.phone);
  if (username) {
    return username;
  }

  const contactPhone = normalizeCompetitorContactPhone(identity.contactPhone);
  if (contactPhone) {
    return contactPhone;
  }

  return maskKoreanName(identity.name);
}

export function getPassMultiple(recruitCount: number): number {
  if (recruitCount >= 150) return 1.5;
  if (recruitCount >= 100) return 1.6;
  if (recruitCount >= 50) return 1.7;
  if (recruitCount >= 6) return 1.8;

  const passCount = SMALL_RECRUIT_PASS_COUNTS[recruitCount];
  if (!passCount) {
    throw new PredictionError("유효하지 않은 선발인원입니다.", 500);
  }

  return passCount / recruitCount;
}

export function getLikelyMultiple(passMultiple: number): number {
  return Math.min(LIKELY_MULTIPLE_STANDARD, passMultiple);
}

export function getRecruitCount(
  quota: { recruitCount: number; recruitCountCareer: number },
  examType: ExamType
): number {
  if (examType === ExamType.CAREER) {
    return quota.recruitCountCareer;
  }
  return quota.recruitCount;
}

function getRegionApplicantCount(
  quota: { applicantCount: number | null; applicantCountCareer: number | null },
  examType: ExamType
): { applicantCount: number | null; isExact: boolean } {
  const raw = examType === ExamType.PUBLIC ? quota.applicantCount : quota.applicantCountCareer;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return {
      applicantCount: Math.floor(raw),
      isExact: true,
    };
  }

  return {
    applicantCount: null,
    isExact: false,
  };
}

function classifyGrade(myMultiple: number, passMultiple: number): PredictionGrade {
  const likelyMultiple = getLikelyMultiple(passMultiple);

  if (myMultiple <= 1) return "확실권";
  if (myMultiple <= likelyMultiple) return "유력권";
  if (myMultiple <= passMultiple) return "가능권";
  return "도전권";
}

function getMaxRankByMultiple(recruitCount: number, multiple: number): number {
  return Math.max(1, Math.floor(recruitCount * multiple));
}

function getMinScoreWithinRank(scoreBands: ScoreBand[], maxRank: number): number | null {
  const atRank = getScoreBandAtRank(scoreBands, maxRank);
  if (atRank) {
    return atRank.score;
  }

  return null;
}

function getMaxScoreWithinRank(scoreBands: ScoreBand[], minRank: number): number | null {
  const selected = scoreBands.find((band) => band.endRank >= minRank);
  return selected ? selected.score : null;
}

function countByRankRange(scoreBands: ScoreBand[], minExclusive: number, maxInclusive: number): number {
  if (!Number.isFinite(minExclusive) || !Number.isFinite(maxInclusive) || maxInclusive <= minExclusive) {
    return 0;
  }

  let count = 0;
  const rangeStart = Math.floor(minExclusive) + 1;
  const rangeEnd = Math.floor(maxInclusive);

  for (const band of scoreBands) {
    const overlapStart = Math.max(band.rank, rangeStart);
    const overlapEnd = Math.min(band.endRank, rangeEnd);
    if (overlapEnd >= overlapStart) {
      count += overlapEnd - overlapStart + 1;
    }
  }

  return count;
}

function parsePage(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return 1;
  return value;
}

function parseLimit(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return 20;
  return Math.min(value, 50);
}

function toLevel(
  key: PyramidLevelKey,
  label: string,
  count: number,
  minScore: number | null,
  maxScore: number | null,
  minMultiple: number | null,
  maxMultiple: number | null,
  isCurrent: boolean
): PredictionLevel {
  return {
    key,
    label,
    count,
    minScore: minScore === null ? null : toSafeNumber(minScore),
    maxScore: maxScore === null ? null : toSafeNumber(maxScore),
    minMultiple: minMultiple === null ? null : toSafeNumber(minMultiple),
    maxMultiple: maxMultiple === null ? null : toSafeNumber(maxMultiple),
    isCurrent,
  };
}

function buildScoreBands(
  rows: Array<{
    finalScore: number;
    _count: { _all: number };
  }>
): ScoreBand[] {
  let processed = 0;

  return rows.map((row) => {
    const score = toSafeNumber(row.finalScore);
    const count = row._count._all;
    const rank = processed + 1;
    const endRank = processed + count;
    processed += count;

    return { score, count, rank, endRank };
  });
}

function getScoreBandAtRank(scoreBands: ScoreBand[], rank: number): ScoreBand | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }

  return scoreBands.find((band) => band.rank <= rank && band.endRank >= rank) ?? null;
}

function getLastScoreBand(scoreBands: ScoreBand[]): ScoreBand | null {
  if (scoreBands.length < 1) {
    return null;
  }

  return scoreBands[scoreBands.length - 1] ?? null;
}

const examRegionQuotaSelect = {
  recruitCount: true,
  recruitCountCareer: true,
  applicantCount: true,
  applicantCountCareer: true,
} satisfies Prisma.ExamRegionQuotaSelect;

function buildPopulationWhere(submission: {
  examId: number;
  regionId: number;
  examType: ExamType;
}): Prisma.SubmissionWhereInput {
  return {
    examId: submission.examId,
    regionId: submission.regionId,
    examType: submission.examType,
    isSuspicious: false,
    subjectScores: {
      some: {},
      none: {
        isFailed: true,
      },
    },
  };
}

export async function calculatePrediction(
  userId: number,
  options: CalculatePredictionOptions = {},
  requesterRole: Role = Role.USER
): Promise<PredictionResult> {
  const page = parsePage(options.page);
  const limit = parseLimit(options.limit);
  const isAdmin = requesterRole === Role.ADMIN;

  const submissionSelect = {
    id: true,
    examId: true,
    regionId: true,
    examType: true,
    finalScore: true,
    exam: {
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
      },
    },
    region: {
      select: {
        id: true,
        name: true,
      },
    },
    user: {
      select: {
        name: true,
        phone: true,
        contactPhone: true,
      },
    },
    subjectScores: {
      select: {
        isFailed: true,
      },
    },
  } satisfies Prisma.SubmissionSelect;

  // 1차: submissionId 지정 시 해당 제출 조회, 아니면 본인 제출 조회
  const submissionWhere: Prisma.SubmissionWhereInput = options.submissionId
    ? {
        id: options.submissionId,
        ...(isAdmin ? {} : { userId }),
      }
    : { userId };

  let submission = await prisma.submission.findFirst({
    where: submissionWhere,
    orderBy: options.submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: submissionSelect,
  });

  // 2차: 관리자이고 본인 제출이 없으면, 활성 시험의 아무 비과락 제출로 대시보드 미리보기
  if (!submission && !options.submissionId && isAdmin) {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    submission = await prisma.submission.findFirst({
      where: {
        ...(activeExam ? { examId: activeExam.id } : {}),
        subjectScores: {
          some: {},
          none: { isFailed: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: submissionSelect,
    });
  }

  if (!submission) {
    throw new PredictionError("합격예측을 위한 제출 데이터가 없습니다.", 404);
  }

  if (submission.subjectScores.some((subjectScore) => subjectScore.isFailed)) {
    throw new PredictionError("과락으로 인해 합격예측을 제공할 수 없습니다.", 400);
  }

  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: submission.examId,
        regionId: submission.regionId,
      },
    },
    select: examRegionQuotaSelect,
  });

  if (!quota) {
    throw new PredictionError(
      "해당 시험의 모집인원 정보가 설정되지 않았습니다. 관리자에게 문의해주세요.",
      500
    );
  }

  const recruitCount = getRecruitCount(quota, submission.examType);
  if (submission.examType === ExamType.CAREER && recruitCount < 1) {
    throw new PredictionError(
      "경행경채 모집인원이 설정되지 않았습니다. 관리자에게 문의해주세요.",
      400
    );
  }
  if (!Number.isInteger(recruitCount) || recruitCount < 1) {
    throw new PredictionError("선발인원 정보가 올바르지 않습니다.", 500);
  }

  const passMultiple = getPassMultiple(recruitCount);
  const likelyMultiple = getLikelyMultiple(passMultiple);
  const challengeMultiple = passMultiple * 1.3;
  const passCount = Math.ceil(recruitCount * passMultiple);
  const likelyMaxRank = getMaxRankByMultiple(recruitCount, likelyMultiple);
  const challengeMaxRank = getMaxRankByMultiple(recruitCount, challengeMultiple);
  const applicantCountInfo = getRegionApplicantCount(quota, submission.examType);

  const populationWhere = buildPopulationWhere(submission);

  const scoreBandRows = await prisma.submission.groupBy({
    by: ["finalScore"],
    where: populationWhere,
    _count: {
      _all: true,
    },
    orderBy: {
      finalScore: "desc",
    },
  });

  if (scoreBandRows.length === 0) {
    throw new PredictionError("합격예측을 위한 참여 데이터가 아직 없습니다.", 404);
  }

  const scoreBands = buildScoreBands(
    scoreBandRows.map((row) => ({
      finalScore: Number(row.finalScore),
      _count: { _all: row._count._all },
    }))
  );

  const rankByScore = new Map(scoreBands.map((band) => [toScoreKey(band.score), band.rank] as const));
  const totalParticipants = scoreBands.reduce((sum, band) => sum + band.count, 0);
  if (totalParticipants < 1) {
    throw new PredictionError("합격예측을 위한 참여 데이터가 아직 없습니다.", 404);
  }
  const isLowSampleSize = totalParticipants < Math.max(10, Math.ceil(recruitCount * 0.2));

  const myScore = toSafeNumber(submission.finalScore);
  const myRank = rankByScore.get(toScoreKey(myScore));
  if (!myRank) {
    throw new PredictionError("합격예측 대상 데이터가 없습니다.", 404);
  }

  const myMultiple = myRank / recruitCount;
  const predictionGrade = classifyGrade(myMultiple, passMultiple);
  const passLineScore = getMinScoreWithinRank(scoreBands, passCount);
  const oneMultipleBand = getScoreBandAtRank(scoreBands, recruitCount) ?? getLastScoreBand(scoreBands);
  const isOneMultipleCutConfirmed = totalParticipants >= recruitCount;
  const oneMultipleActualRank = oneMultipleBand?.endRank ?? null;
  const oneMultipleCutScore = isOneMultipleCutConfirmed ? oneMultipleBand?.score ?? null : null;
  const oneMultipleTieCount = isOneMultipleCutConfirmed ? oneMultipleBand?.count ?? null : null;

  const sureCount = countByRankRange(scoreBands, 0, recruitCount);
  const likelyCount = countByRankRange(scoreBands, recruitCount, likelyMaxRank);
  const possibleCount = countByRankRange(scoreBands, likelyMaxRank, passCount);
  const challengeCount = countByRankRange(scoreBands, passCount, challengeMaxRank);
  const aboveChallengeCount = countByRankRange(scoreBands, 0, challengeMaxRank);
  const belowChallengeCount = Math.max(0, totalParticipants - aboveChallengeCount);

  const myLevelKey: PyramidLevelKey =
    myMultiple <= 1
      ? "sure"
      : myMultiple <= likelyMultiple
        ? "likely"
        : myMultiple <= passMultiple
          ? "possible"
          : myMultiple <= challengeMultiple
            ? "challenge"
            : "belowChallenge";

  const levels: PredictionLevel[] = [
    toLevel(
      "sure",
      "확실권",
      sureCount,
      getMinScoreWithinRank(scoreBands, recruitCount),
      getMaxScoreWithinRank(scoreBands, 1),
      null,
      1,
      myLevelKey === "sure"
    ),
    toLevel(
      "likely",
      "유력권",
      likelyCount,
      getMinScoreWithinRank(scoreBands, likelyMaxRank),
      getMaxScoreWithinRank(scoreBands, recruitCount + 1),
      1,
      likelyMultiple,
      myLevelKey === "likely"
    ),
    toLevel(
      "possible",
      "가능권",
      possibleCount,
      getMinScoreWithinRank(scoreBands, passCount),
      getMaxScoreWithinRank(scoreBands, likelyMaxRank + 1),
      likelyMultiple,
      passMultiple,
      myLevelKey === "possible"
    ),
    toLevel(
      "challenge",
      "도전권",
      challengeCount,
      getMinScoreWithinRank(scoreBands, challengeMaxRank),
      getMaxScoreWithinRank(scoreBands, passCount + 1),
      passMultiple,
      challengeMultiple,
      myLevelKey === "challenge"
    ),
    toLevel(
      "belowChallenge",
      "도전권 이하",
      belowChallengeCount,
      null,
      getMaxScoreWithinRank(scoreBands, challengeMaxRank + 1),
      challengeMultiple,
      null,
      myLevelKey === "belowChallenge"
    ),
  ];

  const totalPages = Math.max(1, Math.ceil(totalParticipants / limit));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * limit;

  const pagedParticipants = await prisma.submission.findMany({
    where: populationWhere,
    orderBy: [{ finalScore: "desc" }, { id: "asc" }],
    skip,
    take: limit,
    select: {
      id: true,
      userId: true,
      finalScore: true,
      user: {
        select: {
          name: true,
          phone: true,
          contactPhone: true,
        },
      },
    },
  });

  const competitorItems: PredictionCompetitor[] = pagedParticipants.map((item) => {
    const score = toSafeNumber(item.finalScore);
    const rank = rankByScore.get(toScoreKey(score));
    if (!rank) {
      throw new PredictionError("합격예측 랭킹 계산에 실패했습니다.", 500);
    }

    return {
      submissionId: item.id,
      userId: item.userId,
      rank,
      score,
      maskedName: getCompetitorDisplayName(item.user),
      isMine: item.id === submission.id,
    };
  });

  const disclaimer = isLowSampleSize
    ? `${PREDICTION_DISCLAIMER} 현재 참여인원이 적어 예측 신뢰도가 낮습니다.`
    : PREDICTION_DISCLAIMER;

  return {
    summary: {
      submissionId: submission.id,
      examId: submission.exam.id,
      examName: submission.exam.name,
      examYear: submission.exam.year,
      examRound: submission.exam.round,
      userName: submission.user.name,
      examType: submission.examType,
      examTypeLabel: toExamTypeLabel(submission.examType),
      regionId: submission.region.id,
      regionName: submission.region.name,
      recruitCount,
      applicantCount: applicantCountInfo.applicantCount,
      estimatedApplicants: applicantCountInfo.applicantCount ?? 0,
      isApplicantCountExact: applicantCountInfo.isExact,
      totalParticipants,
      myScore,
      myRank,
      myMultiple: toSafeNumber(myMultiple),
      oneMultipleBaseRank: recruitCount,
      oneMultipleActualRank,
      oneMultipleCutScore: oneMultipleCutScore === null ? null : toSafeNumber(oneMultipleCutScore),
      oneMultipleTieCount,
      isOneMultipleCutConfirmed,
      passMultiple: toSafeNumber(passMultiple),
      likelyMultiple: toSafeNumber(likelyMultiple),
      passCount,
      passLineScore: passLineScore === null ? null : toSafeNumber(passLineScore),
      predictionGrade,
      disclaimer,
    },
    pyramid: {
      levels,
      counts: {
        sure: sureCount,
        likely: likelyCount,
        possible: possibleCount,
        challenge: challengeCount,
        belowChallenge: belowChallengeCount,
      },
    },
    competitors: {
      page: safePage,
      limit,
      totalCount: totalParticipants,
      totalPages,
      items: competitorItems,
    },
    updatedAt: new Date().toISOString(),
  };
}
