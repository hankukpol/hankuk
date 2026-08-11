import { ExamType, Gender, Prisma, Role, SubmissionScoringStatus, SubmissionSuspicionStatus } from "@prisma/client";
import { estimateApplicants } from "@/lib/fire/policy";
import { prisma } from "@/lib/prisma";
import {
  getFireApplicantCount,
  getFirePassMultiple,
  getFireRecruitCount,
} from "@/lib/fire/prediction-policy";
import {
  buildFirePredictionBands,
  classifyFirePredictionGrade,
  type FireSampleStage,
} from "@/lib/fire/prediction-model";
import { isFireExamType } from "@/lib/tenant-exam";
import { requireSoleActiveExam } from "@/lib/active-exam";


const SCORE_KEY_SCALE = 1000000;
export const PREDICTION_DISCLAIMER =
  "본 서비스는 공개된 표본 해석 원칙을 참고한 소방 전용 자체 예측이며, 실제 합격 결과와 다를 수 있습니다.";

export type PredictionGrade = "확실권" | "유력권" | "가능권" | "도전권";

export type PyramidLevelKey = "sure" | "likely" | "possible" | "challenge";

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
  sureMultiple: number;
  likelyMultiple: number;
  sureMaxRank: number;
  likelyMaxRank: number;
  passCount: number;
  passLineScore: number | null;
  modelVersion: string;
  sampleStage: FireSampleStage;
  sampleCoverageRate: number;
  isReliableSample: boolean;
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
  return getFirePassMultiple(recruitCount, ExamType.PUBLIC) ?? 3.0;
}

// 소방 경채 합격배수
function getCareerPassMultiple(recruitCount: number): number {
  if (!Number.isInteger(recruitCount) || recruitCount < 1) {
    throw new PredictionError("선발인원은 1 이상의 정수여야 합니다.", 500);
  }

  const multiple = getFirePassMultiple(recruitCount, ExamType.CAREER_RESCUE);
  if (multiple === null) {
    throw new PredictionError("유효하지 않은 선발인원입니다.", 500);
  }
  return multiple;
}

export function getPassMultiple(recruitCount: number, examType: ExamType): number {
  if (!isFireExamType(examType)) {
    throw new PredictionError("소방 서비스에서 사용할 수 없는 채용유형입니다.", 400);
  }
  if (examType === ExamType.PUBLIC) {
    return getPublicPassMultiple(recruitCount);
  }
  // 구조, 소방학과, 구급 모두 경채 배수 테이블 적용
  return getCareerPassMultiple(recruitCount);
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
  return getFireRecruitCount(quota, examType, gender);
}

function getRegionApplicantCount(
  quota: {
    recruitAcademicCombined: number;
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
  const raw = getFireApplicantCount(quota, examType, gender ?? null);

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
    suspicionStatus: true,
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

  const activeExam = options.submissionId
    ? null
    : await requireSoleActiveExam({
        db: prisma,
        tenantType: "fire",
        context: "fire/prediction/default-read",
      });

  // 1차: submissionId 지정 시 해당 제출 조회, 아니면 본인 제출 조회
  const submissionWhere: Prisma.SubmissionWhereInput = options.submissionId
    ? {
        id: options.submissionId,
        ...(isAdmin ? {} : { userId }),
      }
    : { userId, examId: activeExam!.id };

  let submission = await prisma.submission.findFirst({
    where: submissionWhere,
    orderBy: options.submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: submissionSelect,
  });

  // 2차: 관리자이고 본인 제출이 없으면, 활성 시험의 MOCK 제출로 대시보드 미리보기
  // 주의: 실제 학생 데이터가 노출되지 않도록 반드시 MOCK- 수험번호만 조회
  if (!submission && !options.submissionId && isAdmin) {
    submission = await prisma.submission.findFirst({
      where: {
        examId: activeExam!.id,
        examNumber: { startsWith: "MOCK-" },
        suspicionStatus: SubmissionSuspicionStatus.CLEAR,
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

  if (
    submission.examType !== ExamType.PUBLIC &&
    submission.examType !== ExamType.CAREER_RESCUE &&
    submission.examType !== ExamType.CAREER_ACADEMIC &&
    submission.examType !== ExamType.CAREER_EMT
  ) {
    throw new PredictionError("소방 서비스의 시험유형이 아닌 제출 데이터입니다.", 409);
  }

  if (submission.scoringStatus === SubmissionScoringStatus.PENDING) {
    throw new PredictionError("채점 대기 중입니다. 가답안 발표 후 자동 채점 결과를 확인해 주세요.", 409);
  }

  if (submission.suspicionStatus !== SubmissionSuspicionStatus.CLEAR) {
    throw new PredictionError(
      submission.suspicionStatus === SubmissionSuspicionStatus.REVIEW
        ? "성적 검토 중에는 합격예측을 제공하지 않습니다. 검토 완료 후 다시 확인해 주세요."
        : "통계 제외 성적으로 분류되어 합격예측을 제공하지 않습니다. 관리자에게 문의해 주세요.",
      400
    );
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
  const applicantCountInfo = getRegionApplicantCount(quota, submission.examType, submission.gender);
  const estimatedApplicants = estimateApplicants({
    applicantCount: applicantCountInfo.applicantCount,
    recruitCount,
  });

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
  const bands = buildFirePredictionBands({
    recruitCount,
    participantCount: totalParticipants,
    referenceApplicantCount: estimatedApplicants,
    isApplicantCountExact: applicantCountInfo.isExact,
    passMultiple,
  });
  const passCount = bands.possibleMaxRank;
  const likelyMaxRank = bands.likelyMaxRank;
  const sureMaxRank = bands.sureMaxRank;

  const myScore = toSafeNumber(submission.finalScore);
  const myRank = rankByScore.get(toScoreKey(myScore));
  if (!myRank) {
    throw new PredictionError("합격예측 대상 데이터가 없습니다.", 404);
  }

  const myMultiple = myRank / recruitCount;
  const predictionGrade = classifyFirePredictionGrade(myRank, bands);
  const passLineScore = getMinScoreWithinRank(scoreBands, passCount);
  const passActualRank = getEndRankWithinTie(scoreBands, passCount) ?? passCount;
  const oneMultipleBand = getScoreBandAtRank(scoreBands, recruitCount) ?? getLastScoreBand(scoreBands);
  const isOneMultipleCutConfirmed = totalParticipants >= recruitCount;
  const oneMultipleActualRank = oneMultipleBand?.endRank ?? null;
  const oneMultipleCutScore = isOneMultipleCutConfirmed ? oneMultipleBand?.score ?? null : null;
  const oneMultipleTieCount = isOneMultipleCutConfirmed ? oneMultipleBand?.count ?? null : null;

  const sureCount = countByRankRange(scoreBands, 0, sureMaxRank);
  const likelyCount = countByRankRange(scoreBands, sureMaxRank, likelyMaxRank);
  const possibleCount = countByRankRange(scoreBands, likelyMaxRank, passActualRank);
  const challengeCount = Math.max(0, totalParticipants - sureCount - likelyCount - possibleCount);

  const myLevelKey: PyramidLevelKey =
    predictionGrade === "확실권"
      ? "sure"
      : predictionGrade === "유력권"
        ? "likely"
        : predictionGrade === "가능권"
          ? "possible"
          : "challenge";

  const levels: PredictionLevel[] = [
    toLevel(
      "sure",
      "확실권",
      sureCount,
      sureMaxRank > 0 ? getMinScoreWithinRank(scoreBands, sureMaxRank) : null,
      getMaxScoreWithinRank(scoreBands, 1),
      null,
      bands.sureMultiple > 0 ? bands.sureMultiple : null,
      myLevelKey === "sure"
    ),
    toLevel(
      "likely",
      "유력권",
      likelyCount,
      likelyMaxRank > 0 ? getMinScoreWithinRank(scoreBands, likelyMaxRank) : null,
      getMaxScoreWithinRank(scoreBands, sureMaxRank + 1),
      bands.sureMultiple > 0 ? bands.sureMultiple : null,
      bands.likelyMultiple > 0 ? bands.likelyMultiple : null,
      myLevelKey === "likely"
    ),
    toLevel(
      "possible",
      "가능권",
      possibleCount,
      passLineScore,
      getMaxScoreWithinRank(scoreBands, likelyMaxRank + 1),
      bands.likelyMultiple > 0 ? bands.likelyMultiple : null,
      passMultiple,
      myLevelKey === "possible"
    ),
    toLevel(
      "challenge",
      "도전권",
      challengeCount,
      challengeCount > 0 ? getMinScoreWithinRank(scoreBands, totalParticipants) : null,
      getMaxScoreWithinRank(scoreBands, passActualRank + 1),
      passMultiple,
      null,
      myLevelKey === "challenge"
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

  const disclaimer = bands.isReliableSample
    ? `${PREDICTION_DISCLAIMER} 현재 표본은 신뢰 구간에 진입했지만 최종 결과를 보장하지 않습니다.`
    : `${PREDICTION_DISCLAIMER} 현재 표본 수집 단계이므로 순위와 예측 구간이 크게 변동될 수 있습니다.`;

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
      estimatedApplicants,
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
      sureMultiple: bands.sureMultiple,
      likelyMultiple: bands.likelyMultiple,
      sureMaxRank,
      likelyMaxRank,
      passCount,
      passLineScore: passLineScore === null ? null : toSafeNumber(passLineScore),
      modelVersion: bands.modelVersion,
      sampleStage: bands.sampleStage,
      sampleCoverageRate: bands.coverageRate,
      isReliableSample: bands.isReliableSample,
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

