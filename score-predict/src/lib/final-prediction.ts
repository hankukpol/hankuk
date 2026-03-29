import { BonusType, ExamType, Gender, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPassMultiple, getRecruitCount, maskKoreanName } from "@/lib/prediction";

// 직렬별 필기 만점
const WRITTEN_MAX_BY_EXAM_TYPE: Partial<Record<ExamType, number>> = {
  [ExamType.PUBLIC]: 300,
  [ExamType.CAREER_RESCUE]: 200,
  [ExamType.CAREER_ACADEMIC]: 200,
  [ExamType.CAREER_EMT]: 200,
};

const FITNESS_MAX = 60;    // 체력 만점
const WRITTEN_WEIGHT = 50; // 필기 반영 비율 (50%)
const FITNESS_WEIGHT = 25; // 체력 반영 비율 (25%)

interface RankRow {
  submissionId: number;
  knownFinalScore: number;
  isVeteranPreferred: boolean;
  writtenScore: number;
}

export interface KnownFinalScoreResult {
  writtenConverted: number;  // 필기 환산 (50점 만점)
  fitnessConverted: number;  // 체력 환산 (25점 만점)
  knownFinalScore: number;   // 면접 제외 최종 환산 (최대 80점)
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

const finalPredictionQuotaSelect = {
  recruitPublicMale: true,
  recruitPublicFemale: true,
  recruitRescue: true,
  recruitAcademicMale: true,
  recruitAcademicFemale: true,
  recruitAcademicCombined: true,
  recruitEmtMale: true,
  recruitEmtFemale: true,
  region: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.ExamRegionQuotaSelect;

function isVeteranBonusType(bonusType: BonusType): boolean {
  return bonusType === BonusType.VETERAN_5 || bonusType === BonusType.VETERAN_10;
}

function compareRankRow(left: RankRow, right: RankRow): number {
  // 1순위: 최종 환산 점수 내림차순
  if (right.knownFinalScore !== left.knownFinalScore) {
    return right.knownFinalScore - left.knownFinalScore;
  }
  // 2순위: 취업지원대상자 우선
  if (right.isVeteranPreferred !== left.isVeteranPreferred) {
    return Number(right.isVeteranPreferred) - Number(left.isVeteranPreferred);
  }
  // 3순위: 필기 원점수 내림차순
  if (right.writtenScore !== left.writtenScore) {
    return right.writtenScore - left.writtenScore;
  }
  // 4순위: 먼저 제출한 순서
  return left.submissionId - right.submissionId;
}

function toRankMap(rows: RankRow[]): Map<number, number> {
  const sorted = [...rows].sort(compareRankRow);
  const rankMap = new Map<number, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    rankMap.set(sorted[index].submissionId, index + 1);
  }
  return rankMap;
}

/** 직렬별 필기 만점 반환 */
export function getWrittenScoreMax(examType: ExamType): number {
  return WRITTEN_MAX_BY_EXAM_TYPE[examType] ?? 300;
}

/**
 * 면접 제외 최종 환산 점수 계산 (소방)
 *
 * 공식:
 *   필기 환산 = (필기점수 / 필기만점) × 50
 *   체력 환산 = (체력점수 / 60) × 25
 *   최종 환산 = 필기 환산 + 체력 환산 + 자격증 가산점
 *   만점 = 80점 (면접 25% 제외)
 */
export function calculateKnownFinalScore(params: {
  writtenScore: number;     // 필기 finalScore (원점수 + 취업/의상 가산점)
  writtenScoreMax: number;  // 필기 만점 (공채 300, 경채 200)
  fitnessRawScore: number;  // 체력 원점수 (0~60)
  certificateBonus: number; // 자격증 가산점 (0~5)
}): KnownFinalScoreResult {
  const clampedWritten = Math.min(params.writtenScoreMax, Math.max(0, params.writtenScore));
  const clampedFitness = Math.min(FITNESS_MAX, Math.max(0, params.fitnessRawScore));
  const clampedCert = Math.min(5, Math.max(0, params.certificateBonus));

  const writtenConverted = roundScore((clampedWritten / params.writtenScoreMax) * WRITTEN_WEIGHT);
  const fitnessConverted = roundScore((clampedFitness / FITNESS_MAX) * FITNESS_WEIGHT);
  const knownFinalScore = roundScore(writtenConverted + fitnessConverted + clampedCert);

  return { writtenConverted, fitnessConverted, knownFinalScore };
}

/** 동일 시험·지역·직렬 기준 임시 순위 계산 */
export async function calculateKnownFinalRank(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  gender: Gender | null;
  submissionId: number;
}): Promise<{ finalRank: number | null; totalParticipants: number }> {
  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: params.examId,
        regionId: params.regionId,
      },
    },
    select: {
      recruitAcademicCombined: true,
    },
  });

  const genderFilter = buildFinalGenderFilter(
    params.examType,
    params.gender,
    quota?.recruitAcademicCombined ?? 0
  );

  const rows = await prisma.finalPrediction.findMany({
    where: {
      finalScore: { not: null },
      submission: {
        examId: params.examId,
        regionId: params.regionId,
        examType: params.examType,
        ...genderFilter,
      },
    },
    select: {
      submissionId: true,
      finalScore: true,
      submission: {
        select: {
          finalScore: true,
          bonusType: true,
        },
      },
    },
  });

  if (rows.length < 1) {
    return { finalRank: null, totalParticipants: 0 };
  }

  const rankMap = toRankMap(
    rows.map((row) => ({
      submissionId: row.submissionId,
      knownFinalScore: Number(row.finalScore),
      isVeteranPreferred: isVeteranBonusType(row.submission.bonusType),
      writtenScore: Number(row.submission.finalScore),
    }))
  );

  return {
    finalRank: rankMap.get(params.submissionId) ?? null,
    totalParticipants: rows.length,
  };
}

// ─────────────────────────────────────────────────────────
// 최종 환산 순위 상세 (경쟁자 테이블·1배수 합격 판정 포함)
// ─────────────────────────────────────────────────────────

export interface FinalRankingCompetitor {
  rank: number;
  score: number;
  maskedName: string;
  isMine: boolean;
}

export interface FinalRankingDetails {
  finalRank: number | null;
  totalParticipants: number;
  recruitCount: number;
  passMultiple: number;
  oneMultipleCutScore: number | null;
  isWithinOneMultiple: boolean;
  examTypeLabel: string;
  regionName: string;
  userName: string;
  myScore: number | null;
  competitors: FinalRankingCompetitor[];
}

function toFinalExamTypeLabel(examType: ExamType, gender: Gender | null): string {
  switch (examType) {
    case ExamType.PUBLIC:
      return gender === "MALE" ? "공채(남)" : gender === "FEMALE" ? "공채(여)" : "공채";
    case ExamType.CAREER_RESCUE:
      return "구조 경채";
    case ExamType.CAREER_ACADEMIC:
      return gender === "MALE" ? "소방학과(남)" : gender === "FEMALE" ? "소방학과(여)" : "소방학과";
    case ExamType.CAREER_EMT:
      return gender === "MALE" ? "구급(남)" : gender === "FEMALE" ? "구급(여)" : "구급 경채";
    default:
      return examType;
  }
}

/** 최종환산 순위 모집단: 전형별 성별 필터 규칙 */
function buildFinalGenderFilter(
  examType: ExamType,
  gender: Gender | null,
  recruitAcademicCombined: number
): Prisma.SubmissionWhereInput {
  switch (examType) {
    case ExamType.PUBLIC:
      // 소방 공채: 남녀 분리 선발
      return gender ? { gender } : {};
    case ExamType.CAREER_RESCUE:
      return { gender: Gender.MALE };
    case ExamType.CAREER_ACADEMIC:
      // 소방학과: 양성 지역이면 통합, 아니면 성별 분리
      if (recruitAcademicCombined > 0) return {};
      return gender ? { gender } : {};
    case ExamType.CAREER_EMT:
      // 구급: 성별 분리
      return gender ? { gender } : {};
    default:
      return {};
  }
}

/**
 * 최종 환산 순위 상세 계산
 * - 모집인원(1배수) 대비 합격 여부 판정
 * - 1배수 커트라인 점수 산출
 * - 경쟁자 순위 테이블 (상위 50명 + 본인)
 */
export async function calculateFinalRankingDetails(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  gender: Gender | null;
  submissionId: number;
}): Promise<FinalRankingDetails | null> {
  // 1. ExamRegionQuota 조회 (모집인원·지역명)
  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: params.examId,
        regionId: params.regionId,
      },
    },
    select: finalPredictionQuotaSelect,
  });
  if (!quota) return null;

  const recruitCount = getRecruitCount(quota, params.examType, params.gender);
  if (recruitCount < 1) return null;

  const passMultiple = getPassMultiple(recruitCount, params.examType);
  const genderFilter = buildFinalGenderFilter(
    params.examType,
    params.gender,
    quota.recruitAcademicCombined
  );

  // 2. 동일 모집단 FinalPrediction 조회 (사용자 이름 포함)
  const rows = await prisma.finalPrediction.findMany({
    where: {
      finalScore: { not: null },
      submission: {
        examId: params.examId,
        regionId: params.regionId,
        examType: params.examType,
        ...genderFilter,
      },
    },
    select: {
      submissionId: true,
      finalScore: true,
      submission: {
        select: {
          finalScore: true,
          bonusType: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (rows.length < 1) return null;

  // 3. 정렬 및 순위 계산
  const rankRows = rows.map((row) => ({
    submissionId: row.submissionId,
    knownFinalScore: Number(row.finalScore),
    isVeteranPreferred: isVeteranBonusType(row.submission.bonusType),
    writtenScore: Number(row.submission.finalScore),
    userName: row.submission.user.name,
  }));

  const sorted = [...rankRows].sort((a, b) => compareRankRow(a, b));

  const myIndex = sorted.findIndex((r) => r.submissionId === params.submissionId);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myRow = myIndex >= 0 ? sorted[myIndex] : null;

  // 4. 1배수 커트라인 점수
  let oneMultipleCutScore: number | null = null;
  if (sorted.length >= recruitCount) {
    oneMultipleCutScore = roundScore(sorted[recruitCount - 1].knownFinalScore);
  }

  // 5. 경쟁자 목록 (상위 50명, 본인이 범위 밖이면 추가)
  const MAX_COMPETITORS = 50;
  const topSlice = sorted.slice(0, MAX_COMPETITORS);
  const userInTop = topSlice.some((r) => r.submissionId === params.submissionId);

  const competitorRows = userInTop || myIndex < 0
    ? topSlice
    : [...topSlice, sorted[myIndex]];

  const competitors: FinalRankingCompetitor[] = competitorRows.map((row) => {
    const idx = sorted.indexOf(row);
    return {
      rank: idx + 1,
      score: roundScore(row.knownFinalScore),
      maskedName: maskKoreanName(row.userName),
      isMine: row.submissionId === params.submissionId,
    };
  });

  return {
    finalRank: myRank,
    totalParticipants: sorted.length,
    recruitCount,
    passMultiple: roundScore(passMultiple),
    oneMultipleCutScore,
    isWithinOneMultiple: myRank !== null && myRank <= recruitCount,
    examTypeLabel: toFinalExamTypeLabel(params.examType, params.gender),
    regionName: quota.region.name,
    userName: myRow ? myRow.userName : "",
    myScore: myRow ? roundScore(myRow.knownFinalScore) : null,
    competitors,
  };
}

