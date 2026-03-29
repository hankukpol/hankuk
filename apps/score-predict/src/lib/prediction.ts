import { ExamType, Gender, Prisma, Role, SubmissionScoringStatus } from "@prisma/client";
import { estimateApplicants } from "@/lib/policy";
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
  gender: Gender;
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

function toExamTypeLabel(examType: ExamType, gender?: Gender | null): string {
  switch (examType) {
    case ExamType.PUBLIC:
      return gender === Gender.MALE ? "공채(남)" : gender === Gender.FEMALE ? "공채(여)" : "공채";
    case ExamType.CAREER_RESCUE:
      return "구조 경채";
    case ExamType.CAREER_ACADEMIC:
      return gender === Gender.MALE ? "소방학과(남)" : gender === Gender.FEMALE ? "소방학과(여)" : "소방학과";
    case ExamType.CAREER_EMT:
      return gender === Gender.MALE ? "구급(남)" : gender === Gender.FEMALE ? "구급(여)" : "구급 경채";
    default:
      return examType;
  }
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

// 소방 공채 합격배수
function getPublicPassMultiple(recruitCount: number): number {
  if (recruitCount >= 51) return 1.5;
  if (recruitCount >= 21) return 2.0;
  if (recruitCount >= 11) return 2.5;
  return 3.0; // 1~10명
}

// 소방 경채 합격배수
function getCareerPassMultiple(recruitCount: number): number {
  if (!Number.isInteger(recruitCount) || recruitCount < 1) {
    throw new PredictionError("선발인원은 1 이상의 정수여야 합니다.", 500);
  }

  if (recruitCount >= 51) return 1.5;
  if (recruitCount >= 6) return 1.8;

  const passCount = SMALL_RECRUIT_PASS_COUNTS[recruitCount];
  if (!passCount) {
    throw new PredictionError("유효하지 않은 선발인원입니다.", 500);
  }

  return passCount / recruitCount;
}

export function getPassMultiple(recruitCount: number, examType?: ExamType): number {
  if (examType === ExamType.PUBLIC) {
    return getPublicPassMultiple(recruitCount);
  }
  // 구조, 소방학과, 구급 모두 경채 배수 테이블 적용
  return getCareerPassMultiple(recruitCount);
}

export function getLikelyMultiple(passMultiple: number): number {
  return Math.min(LIKELY_MULTIPLE_STANDARD, passMultiple);
}

export function getRecruitCount(
  quota: {
    recruitPublicMale: number;
    recruitPublicFemale: number;
    recruitRescue: number;
    recruitAcademicMale: number;
    recruitAcademicFemale: number;
    recruitAcademicCombined: number;
    recruitEmtMale: number;
    recruitEmtFemale: number;
  },
  examType: ExamType,
  gender?: Gender | null
): number {
  switch (examType) {
    case ExamType.PUBLIC:
      return gender === Gender.MALE
        ? quota.recruitPublicMale
        : gender === Gender.FEMALE
          ? quota.recruitPublicFemale
          : quota.recruitPublicMale + quota.recruitPublicFemale;
    case ExamType.CAREER_RESCUE:
      return quota.recruitRescue;
    case ExamType.CAREER_ACADEMIC:
      // 양성 모집이 있으면 양성 인원, 없으면 성별별 인원
      if (quota.recruitAcademicCombined > 0) return quota.recruitAcademicCombined;
      if (gender === Gender.FEMALE) return quota.recruitAcademicFemale;
      return quota.recruitAcademicMale;
    case ExamType.CAREER_EMT:
      if (gender === Gender.FEMALE) return quota.recruitEmtFemale;
      return quota.recruitEmtMale;
    default:
      return 0;
  }
}

function getRegionApplicantCount(
  quota: {
    applicantPublicMale: number | null;
    applicantPublicFemale: number | null;
    applicantRescue: number | null;
    applicantAcademicMale: number | null;
    applicantAcademicFemale: number | null;
    applicantAcademicCombined: number | null;
    applicantEmtMale: number | null;
    applicantEmtFemale: number | null;
  },
  examType: ExamType,
  gender?: Gender | null
): { applicantCount: number | null; isExact: boolean } {
  let raw: number | null = null;
  switch (examType) {
    case ExamType.PUBLIC:
      raw = gender === Gender.MALE
        ? quota.applicantPublicMale
        : gender === Gender.FEMALE
          ? quota.applicantPublicFemale
          : null;
      break;
    case ExamType.CAREER_RESCUE:
      raw = quota.applicantRescue;
      break;
    case ExamType.CAREER_ACADEMIC:
      // 양성 모집이 있으면 양성 접수인원
      if (quota.applicantAcademicCombined !== null) {
        raw = quota.applicantAcademicCombined;
      } else if (gender === Gender.MALE) {
        raw = quota.applicantAcademicMale;
      } else if (gender === Gender.FEMALE) {
        raw = quota.applicantAcademicFemale;
      }
      break;
    case ExamType.CAREER_EMT:
      raw = gender === Gender.MALE
        ? quota.applicantEmtMale
        : gender === Gender.FEMALE
          ? quota.applicantEmtFemale
          : null;
      break;
  }

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

function getEndRankWithinTie(scoreBands: ScoreBand[], rank: number): number | null {
  const atRank = getScoreBandAtRank(scoreBands, rank);
  if (atRank) {
    return atRank.endRank;
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
  recruitPublicMale: true,
  recruitPublicFemale: true,
  recruitRescue: true,
  recruitAcademicMale: true,
  recruitAcademicFemale: true,
  recruitAcademicCombined: true,
  recruitEmtMale: true,
  recruitEmtFemale: true,
  applicantPublicMale: true,
  applicantPublicFemale: true,
  applicantRescue: true,
  applicantAcademicMale: true,
  applicantAcademicFemale: true,
  applicantAcademicCombined: true,
  applicantEmtMale: true,
  applicantEmtFemale: true,
} satisfies Prisma.ExamRegionQuotaSelect;

function buildPopulationWhere(
  submission: {
    examId: number;
    regionId: number;
    examType: ExamType;
    gender?: Gender | null;
  },
  quota?: {
    recruitAcademicCombined: number;
  } | null
): Prisma.SubmissionWhereInput {
  const base: Prisma.SubmissionWhereInput = {
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

  switch (submission.examType) {
    case ExamType.PUBLIC:
      // 소방 공채: 남녀 분리 선발
      if (submission.gender) base.gender = submission.gender;
      break;
    case ExamType.CAREER_RESCUE:
      base.gender = Gender.MALE;
      break;
    case ExamType.CAREER_ACADEMIC:
      // 소방학과 경채: 양성(통합) 지역은 성별 필터 제거
      if ((quota?.recruitAcademicCombined ?? 0) > 0) {
        break;
      }
      if (submission.gender) base.gender = submission.gender;
      break;
    case ExamType.CAREER_EMT:
      // 구급 경채: 성별 분리 선발
      if (submission.gender) base.gender = submission.gender;
      break;
  }

  return base;
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
    gender: true,
    scoringStatus: true,
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

  // 2차: 관리자이고 본인 제출이 없으면, 활성 시험의 MOCK 제출로 대시보드 미리보기
  // 주의: 실제 학생 데이터가 노출되지 않도록 반드시 MOCK- 수험번호만 조회
  if (!submission && !options.submissionId && isAdmin) {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    submission = await prisma.submission.findFirst({
      where: {
        ...(activeExam ? { examId: activeExam.id } : {}),
        examNumber: { startsWith: "MOCK-" },
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

  if (submission.scoringStatus === SubmissionScoringStatus.PENDING) {
    throw new PredictionError("채점 대기 중입니다. 가답안 발표 후 자동 채점 결과를 확인해 주세요.", 409);
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

  const recruitCount = getRecruitCount(quota, submission.examType, submission.gender);
  if (recruitCount < 1) {
    const typeLabel = toExamTypeLabel(submission.examType, submission.gender);
    throw new PredictionError(
      `${typeLabel} 모집인원이 설정되지 않았습니다. 관리자에게 문의해주세요.`,
      400
    );
  }
  if (!Number.isInteger(recruitCount) || recruitCount < 1) {
    throw new PredictionError("선발인원 정보가 올바르지 않습니다.", 500);
  }

  const passMultiple = getPassMultiple(recruitCount, submission.examType);
  const likelyMultiple = getLikelyMultiple(passMultiple);
  // "challenge" is an operational guidance band, not a legal pass-multiple cutoff.
  const challengeMultiple = passMultiple * 1.3;
  const passCount = Math.ceil(recruitCount * passMultiple);
  const likelyMaxRank = getMaxRankByMultiple(recruitCount, likelyMultiple);
  const challengeMaxRank = getMaxRankByMultiple(recruitCount, challengeMultiple);
  const applicantCountInfo = getRegionApplicantCount(quota, submission.examType, submission.gender);

  const populationWhere = buildPopulationWhere(submission, quota);

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
  const passActualRank = getEndRankWithinTie(scoreBands, passCount) ?? passCount;
  const oneMultipleBand = getScoreBandAtRank(scoreBands, recruitCount) ?? getLastScoreBand(scoreBands);
  const isOneMultipleCutConfirmed = totalParticipants >= recruitCount;
  const oneMultipleActualRank = oneMultipleBand?.endRank ?? null;
  const oneMultipleCutScore = isOneMultipleCutConfirmed ? oneMultipleBand?.score ?? null : null;
  const oneMultipleTieCount = isOneMultipleCutConfirmed ? oneMultipleBand?.count ?? null : null;

  const sureCount = countByRankRange(scoreBands, 0, recruitCount);
  const likelyCount = countByRankRange(scoreBands, recruitCount, likelyMaxRank);
  const possibleCount = countByRankRange(scoreBands, likelyMaxRank, passActualRank);
  const challengeCount = countByRankRange(scoreBands, passActualRank, challengeMaxRank);
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
      passLineScore,
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
      getMaxScoreWithinRank(scoreBands, passActualRank + 1),
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
      maskedName: maskKoreanName(item.user.name),
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
      gender: submission.gender,
      examTypeLabel: toExamTypeLabel(submission.examType, submission.gender),
      regionId: submission.region.id,
      regionName: submission.region.name,
      recruitCount,
      applicantCount: applicantCountInfo.applicantCount,
      estimatedApplicants: estimateApplicants({
        applicantCount: applicantCountInfo.applicantCount,
        recruitCount,
      }),
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

