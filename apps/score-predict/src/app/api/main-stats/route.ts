import { ExamType, Gender, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDifficultyStats } from "@/lib/difficulty";
import { estimateApplicants } from "@/lib/policy";
import { getLikelyMultiple, getPassMultiple } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";
import { getActiveNotices, getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";

interface QuotaRow {
  regionId: number;
  regionName: string;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
  applicantPublicMale: number | null;
  applicantPublicFemale: number | null;
  applicantRescue: number | null;
  applicantAcademicMale: number | null;
  applicantAcademicFemale: number | null;
  applicantAcademicCombined: number | null;
  applicantEmtMale: number | null;
  applicantEmtFemale: number | null;
}

interface ScoreBandRow {
  regionId: number;
  examType: ExamType;
  gender: Gender;
  finalScore: number;
  _count: {
    _all: number;
  };
}

interface MainStatsRow {
  regionId: number;
  regionName: string;
  examType: ExamType;
  gender: Gender | null; // 구조경채: null, 나머지: MALE | FEMALE
  examTypeLabel: string;
  recruitCount: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  competitionRate: number | null;
  participantCount: number;
  averageFinalScore: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleBaseRank: number;
  oneMultipleActualRank: number | null;
  oneMultipleTieCount: number | null;
  possibleRange: { min: number | null; max: number | null };
  likelyRange: { min: number | null; max: number | null };
  sureMinScore: number | null;
}

type ScoreDistributionKey = "TOTAL" | "FIRE_INTRO" | "FIRE_LAW" | "ADMIN_LAW" | "EMERGENCY" ;

interface ScoreDistributionConfig {
  key: ScoreDistributionKey;
  label: string;
  maxScore: number;
  step: number;
  failThreshold: number | null;
  subjectName: string | null;
}

interface ScoreDistributionBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  count: number;
  isFailRange: boolean;
  isMine: boolean;
}

interface ScoreDistributionItem {
  key: ScoreDistributionKey;
  label: string;
  maxScore: number;
  failThreshold: number | null;
  myScore: number | null;
  isFail: boolean | null;
  buckets: ScoreDistributionBucket[];
}

interface UserScoreSnapshot {
  totalScore: number;
  hasAnyFail: boolean;
  subjectScoresByName: Map<string, { score: number; isFail: boolean }>;
}

interface MainSectionVisibility {
  overview: boolean;
  difficulty: boolean;
  competitive: boolean;
  scoreDistribution: boolean;
}

function toSafePositiveInt(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallbackValue;
  return Math.floor(parsed);
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function examTypeLabel(examType: ExamType, gender: Gender | null): string {
  const genderSuffix = gender === Gender.MALE ? "(남)" : gender === Gender.FEMALE ? "(여)" : "";
  if (examType === ExamType.CAREER_RESCUE) return "구조";
  if (examType === ExamType.CAREER_ACADEMIC) return `소방학과${genderSuffix}`;
  if (examType === ExamType.CAREER_EMT) return `구급${genderSuffix}`;
  return `공채${genderSuffix}`;
}

function getScoreDistributionConfig(examType: ExamType): ScoreDistributionConfig[] {
  if (examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC) {
    return [
      { key: "TOTAL", label: "총점", maxScore: 200, step: 40, failThreshold: null, subjectName: null },
      { key: "FIRE_INTRO", label: "소방학개론", maxScore: 100, step: 10, failThreshold: 40, subjectName: "소방학개론" },
      { key: "FIRE_LAW", label: "소방관계법규", maxScore: 100, step: 10, failThreshold: 40, subjectName: "소방관계법규" },
    ];
  }
  if (examType === ExamType.CAREER_EMT) {
    return [
      { key: "TOTAL", label: "총점", maxScore: 200, step: 40, failThreshold: null, subjectName: null },
      { key: "FIRE_INTRO", label: "소방학개론", maxScore: 100, step: 10, failThreshold: 40, subjectName: "소방학개론" },
      { key: "EMERGENCY", label: "응급처치학개론", maxScore: 100, step: 10, failThreshold: 40, subjectName: "응급처치학개론" },
    ];
  }
  // PUBLIC
  return [
    { key: "TOTAL", label: "총점", maxScore: 300, step: 50, failThreshold: null, subjectName: null },
    { key: "FIRE_INTRO", label: "소방학개론", maxScore: 100, step: 10, failThreshold: 40, subjectName: "소방학개론" },
    { key: "FIRE_LAW", label: "소방관계법규", maxScore: 100, step: 10, failThreshold: 40, subjectName: "소방관계법규" },
    { key: "ADMIN_LAW", label: "행정법총론", maxScore: 100, step: 10, failThreshold: 40, subjectName: "행정법총론" },
  ];
}

function getDistributionBucketCount(maxScore: number, step: number): number {
  return Math.floor(maxScore / step) + 1;
}

function getDistributionBucketIndex(score: number, maxScore: number, step: number): number {
  const bucketCount = getDistributionBucketCount(maxScore, step);
  const lastIndex = Math.max(0, bucketCount - 1);
  const safeScore = Math.min(maxScore, Math.max(0, score));
  if (safeScore >= maxScore) {
    return lastIndex;
  }
  return Math.max(0, Math.min(lastIndex, Math.floor(safeScore / step)));
}

function buildDistributionBuckets(
  maxScore: number,
  step: number,
  failThreshold: number | null,
  countsByBucket: Map<number, number>,
  myScore: number | null
): ScoreDistributionBucket[] {
  const bucketCount = getDistributionBucketCount(maxScore, step);
  const myBucketIndex =
    myScore === null ? null : getDistributionBucketIndex(myScore, maxScore, step);

  return Array.from({ length: bucketCount }, (_, index) => {
    const isLast = index === bucketCount - 1;
    const min = isLast ? maxScore : index * step;
    const max = isLast ? maxScore : index * step + step - 1;
    const label = min === max ? `${min}점` : `${min}~${max}점`;

    return {
      key: `${min}-${max}`,
      label,
      min,
      max,
      count: countsByBucket.get(index) ?? 0,
      isFailRange: failThreshold !== null && max < failThreshold,
      isMine: myBucketIndex === index,
    };
  });
}

function buildScoreDistributions(params: {
  enabledExamTypes: ExamType[];
  subjects: Array<{ id: number; name: string; examType: ExamType; maxScore: number }>;
  totalScoreRows: Array<{ examType: ExamType; totalScore: number; count: number }>;
  subjectScoreRows: Array<{ subjectId: number; rawScore: number; count: number }>;
  myScoresByExamType: Map<ExamType, UserScoreSnapshot>;
}): Record<ExamType, ScoreDistributionItem[]> {
  const result: Record<ExamType, ScoreDistributionItem[]> = {
    [ExamType.PUBLIC]: [],
    [ExamType.CAREER]: [],
    [ExamType.CAREER_RESCUE]: [],
    [ExamType.CAREER_ACADEMIC]: [],
    [ExamType.CAREER_EMT]: [],
  };

  const subjectMetaByTypeAndName = new Map<string, { id: number }>();
  for (const subject of params.subjects) {
    subjectMetaByTypeAndName.set(`${subject.examType}:${subject.name}`, { id: subject.id });
  }

  const subjectScoreRowsBySubjectId = new Map<number, Array<{ rawScore: number; count: number }>>();
  for (const row of params.subjectScoreRows) {
    const current = subjectScoreRowsBySubjectId.get(row.subjectId) ?? [];
    current.push({ rawScore: row.rawScore, count: row.count });
    subjectScoreRowsBySubjectId.set(row.subjectId, current);
  }

  const totalCountsByExamType = new Map<ExamType, Map<number, number>>();
  for (const row of params.totalScoreRows) {
    const totalMaxScore = row.examType === ExamType.PUBLIC ? 300 : 200;
    const totalStep = row.examType === ExamType.PUBLIC ? 50 : 40;
    const bucketIndex = getDistributionBucketIndex(row.totalScore, totalMaxScore, totalStep);
    const byBucket = totalCountsByExamType.get(row.examType) ?? new Map<number, number>();
    byBucket.set(bucketIndex, (byBucket.get(bucketIndex) ?? 0) + row.count);
    totalCountsByExamType.set(row.examType, byBucket);
  }

  for (const examType of params.enabledExamTypes) {
    const config = getScoreDistributionConfig(examType);
    const mySnapshot = params.myScoresByExamType.get(examType);

    result[examType] = config.map((item) => {
      const countsByBucket = new Map<number, number>();
      let myScore: number | null = null;
      let isFail: boolean | null = null;

      if (item.key === "TOTAL") {
        const totalCounts = totalCountsByExamType.get(examType);
        if (totalCounts) {
          for (const [bucket, count] of totalCounts.entries()) {
            countsByBucket.set(bucket, count);
          }
        }

        myScore = mySnapshot ? roundNumber(mySnapshot.totalScore) : null;
        isFail = mySnapshot ? mySnapshot.hasAnyFail : null;
      } else if (item.subjectName) {
        const subjectMeta = subjectMetaByTypeAndName.get(`${examType}:${item.subjectName}`);
        if (subjectMeta) {
          const rows = subjectScoreRowsBySubjectId.get(subjectMeta.id) ?? [];
          for (const row of rows) {
            const bucket = getDistributionBucketIndex(row.rawScore, item.maxScore, item.step);
            countsByBucket.set(bucket, (countsByBucket.get(bucket) ?? 0) + row.count);
          }
        }

        const mySubjectScore = mySnapshot?.subjectScoresByName.get(item.subjectName);
        myScore = mySubjectScore ? roundNumber(mySubjectScore.score) : null;
        isFail = mySubjectScore ? mySubjectScore.isFail : null;
      }

      return {
        key: item.key,
        label: item.label,
        maxScore: item.maxScore,
        failThreshold: item.failThreshold,
        myScore,
        isFail,
        buckets: buildDistributionBuckets(
          item.maxScore,
          item.step,
          item.failThreshold,
          countsByBucket,
          myScore
        ),
      };
    });
  }

  return result;
}

function buildScoreBands(rows: ScoreBandRow[]): Array<{ score: number; count: number }> {
  return rows.map((row) => ({
    score: Number(row.finalScore),
    count: row._count._all,
  }));
}

function getScoreAtRank(
  scoreBands: Array<{ score: number; count: number }>,
  rank: number
): number | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }

  let covered = 0;
  for (const band of scoreBands) {
    covered += band.count;
    if (covered >= rank) {
      return roundNumber(band.score);
    }
  }

  return null;
}

function getScoreBandInfoAtRank(
  scoreBands: Array<{ score: number; count: number }>,
  rank: number
): { score: number; startRank: number; endRank: number; count: number } | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }

  let covered = 0;
  let lastBandInfo: { score: number; startRank: number; endRank: number; count: number } | null = null;
  for (const band of scoreBands) {
    const startRank = covered + 1;
    const endRank = covered + band.count;
    lastBandInfo = {
      score: roundNumber(band.score),
      startRank,
      endRank,
      count: band.count,
    };
    if (startRank <= rank && endRank >= rank) {
      return lastBandInfo;
    }
    covered = endRank;
  }

  return lastBandInfo;
}

function getScoreRange(
  scoreBands: Array<{ score: number; count: number }>,
  startRank: number,
  endRank: number
): { min: number | null; max: number | null } {
  if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank > endRank || startRank < 1) {
    return { min: null, max: null };
  }

  const max = getScoreAtRank(scoreBands, startRank);
  const min = getScoreAtRank(scoreBands, endRank);

  return {
    min,
    max,
  };
}

// 성별별 선발인원 반환 (구조경채: gender=null → recruitRescue)
function getGenderRecruitCount(quota: QuotaRow, examType: ExamType, gender: Gender | null): number {
  switch (examType) {
    case ExamType.CAREER_RESCUE:
      return quota.recruitRescue;
    case ExamType.CAREER_ACADEMIC:
      return gender === Gender.FEMALE ? quota.recruitAcademicFemale : quota.recruitAcademicMale;
    case ExamType.CAREER_EMT:
      return gender === Gender.FEMALE ? quota.recruitEmtFemale : quota.recruitEmtMale;
    default: // PUBLIC
      return gender === Gender.FEMALE ? quota.recruitPublicFemale : quota.recruitPublicMale;
  }
}

// 성별별 응시인원 반환
function getGenderApplicantCount(
  quota: QuotaRow,
  examType: ExamType,
  gender: Gender | null
): { applicantCount: number | null; isExact: boolean } {
  let actual: number | null = null;
  switch (examType) {
    case ExamType.CAREER_RESCUE:
      actual = quota.applicantRescue;
      break;
    case ExamType.CAREER_ACADEMIC:
      actual = gender === Gender.FEMALE ? quota.applicantAcademicFemale : quota.applicantAcademicMale;
      break;
    case ExamType.CAREER_EMT:
      actual = gender === Gender.FEMALE ? quota.applicantEmtFemale : quota.applicantEmtMale;
      break;
    default: // PUBLIC
      actual = gender === Gender.FEMALE ? quota.applicantPublicFemale : quota.applicantPublicMale;
      break;
  }
  if (typeof actual === "number" && Number.isFinite(actual) && actual >= 0) {
    return { applicantCount: Math.floor(actual), isExact: true };
  }
  return { applicantCount: null, isExact: false };
}

async function getQuotasForExam(examId: number): Promise<QuotaRow[]> {
  try {
    return await prisma.$queryRaw<QuotaRow[]>`
      SELECT
        q."regionId",
        r."name" AS "regionName",
        q."recruitPublicMale",
        q."recruitPublicFemale",
        q."recruitRescue",
        q."recruitAcademicMale",
        q."recruitAcademicFemale",
        q."recruitAcademicCombined",
        q."recruitEmtMale",
        q."recruitEmtFemale",
        q."applicantPublicMale",
        q."applicantPublicFemale",
        q."applicantRescue",
        q."applicantAcademicMale",
        q."applicantAcademicFemale",
        q."applicantAcademicCombined",
        q."applicantEmtMale",
        q."applicantEmtFemale"
      FROM "exam_region_quotas" q
      JOIN "Region" r ON r.id = q."regionId"
      WHERE q."examId" = ${examId}
        AND r."isActive" = true
      ORDER BY r."name" ASC
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("isActive")) {
      throw error;
    }

    // isActive 컬럼이 없는 경우 폴백
    return await prisma.$queryRaw<QuotaRow[]>`
      SELECT
        q."regionId",
        r."name" AS "regionName",
        q."recruitPublicMale",
        q."recruitPublicFemale",
        q."recruitRescue",
        q."recruitAcademicMale",
        q."recruitAcademicFemale",
        q."recruitAcademicCombined",
        q."recruitEmtMale",
        q."recruitEmtFemale",
        q."applicantPublicMale",
        q."applicantPublicFemale",
        q."applicantRescue",
        q."applicantAcademicMale",
        q."applicantAcademicFemale",
        q."applicantAcademicCombined",
        q."applicantEmtMale",
        q."applicantEmtFemale"
      FROM "exam_region_quotas" q
      JOIN "Region" r ON r.id = q."regionId"
      WHERE q."examId" = ${examId}
      ORDER BY r."name" ASC
    `;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = Number(session.user.id);

  try {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
      },
    });

    const [notices, settings] = await Promise.all([getActiveNotices(), getSiteSettings()]);
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    const sectionVisibility: MainSectionVisibility = {
      overview: Boolean(settings["site.mainCardOverviewEnabled"] ?? true),
      difficulty: Boolean(settings["site.mainCardDifficultyEnabled"] ?? true),
      competitive: Boolean(settings["site.mainCardCompetitiveEnabled"] ?? true),
      scoreDistribution: Boolean(settings["site.mainCardScoreDistributionEnabled"] ?? true),
    };
    const enabledExamTypes: ExamType[] = careerExamEnabled
      ? [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT]
      : [ExamType.PUBLIC];
    const refreshInterval = toSafePositiveInt(settings["site.mainPageRefreshInterval"], 60);

    if (!activeExam) {
      return NextResponse.json({
        updatedAt: new Date().toISOString(),
        careerExamEnabled,
        liveStats: null,
        sectionVisibility,
        notices,
        difficulty: null,
        rows: [],
        topCompetitive: [],
        leastCompetitive: [],
        scoreDistributions: {
          [ExamType.PUBLIC]: [],
          [ExamType.CAREER]: [],
          [ExamType.CAREER_RESCUE]: [],
          [ExamType.CAREER_ACADEMIC]: [],
          [ExamType.CAREER_EMT]: [],
        },
        refresh: {
          enabled: Boolean(settings["site.mainPageAutoRefresh"]),
          intervalSec: refreshInterval,
        },
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [totalParticipants, examTypeStats, recentParticipants, latestSubmission, difficulty, quotas, mySubmissions] =
      await Promise.all([
        prisma.submission.count({
          where: {
            examId: activeExam.id,
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
          },
        }),
        prisma.submission.groupBy({
          by: ["examType"],
          where: {
            examId: activeExam.id,
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
          },
          _count: {
            _all: true,
          },
        }),
        prisma.submission.count({
          where: {
            examId: activeExam.id,
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
            createdAt: { gte: oneHourAgo },
          },
        }),
        prisma.submission.findFirst({
          where: {
            examId: activeExam.id,
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        getDifficultyStats(activeExam.id),
        getQuotasForExam(activeExam.id),
        Number.isInteger(userId) && userId > 0
          ? prisma.submission.findMany({
              where: {
                examId: activeExam.id,
                userId,
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                examType: true,
                totalScore: true,
                subjectScores: {
                  select: {
                    isFailed: true,
                    rawScore: true,
                    subject: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

    const publicParticipants =
      examTypeStats.find((item) => item.examType === ExamType.PUBLIC)?._count._all ?? 0;
    const careerRescueParticipants = careerExamEnabled
      ? examTypeStats.find((item) => item.examType === ExamType.CAREER_RESCUE)?._count._all ?? 0
      : 0;
    const careerAcademicParticipants = careerExamEnabled
      ? examTypeStats.find((item) => item.examType === ExamType.CAREER_ACADEMIC)?._count._all ?? 0
      : 0;
    const careerEmtParticipants = careerExamEnabled
      ? examTypeStats.find((item) => item.examType === ExamType.CAREER_EMT)?._count._all ?? 0
      : 0;

    const liveStats = {
      examName: activeExam.name,
      examYear: activeExam.year,
      examRound: activeExam.round,
      totalParticipants,
      publicParticipants,
      careerRescueParticipants,
      careerAcademicParticipants,
      careerEmtParticipants,
      recentParticipants,
      updatedAt: latestSubmission?.createdAt?.toISOString() ?? null,
    };

    const populationWhere: Prisma.SubmissionWhereInput = {
      examId: activeExam.id,
      isSuspicious: false,
      NOT: {
        examType: ExamType.CAREER_RESCUE,
        gender: Gender.FEMALE,
      },
      subjectScores: {
        some: {},
        none: {
          isFailed: true,
        },
      },
    };

    // 과락 포함 참여인원 집계용 where (subjectScores 과락 필터 제외)
    const allParticipantCountWhere: Prisma.SubmissionWhereInput = {
      examId: activeExam.id,
      isSuspicious: false,
      NOT: {
        examType: ExamType.CAREER_RESCUE,
        gender: Gender.FEMALE,
      },
      subjectScores: { some: {} },
    };

    const [participantStats, allParticipantCountStats, scoreBandStats, totalScoreDistributionRaw, subjectScoreDistributionRaw, subjects] =
      await Promise.all([
      // 과락 제외 집계: averageFinalScore 산출용
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender"],
        where: populationWhere,
        _count: {
          _all: true,
        },
        _avg: {
          finalScore: true,
        },
      }),
      // 과락 포함 집계: participantCount 산출용
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender"],
        where: allParticipantCountWhere,
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender", "finalScore"],
        where: populationWhere,
        _count: {
          _all: true,
        },
        orderBy: [{ regionId: "asc" }, { examType: "asc" }, { gender: "asc" }, { finalScore: "desc" }],
      }),
      prisma.submission.groupBy({
        by: ["examType", "totalScore"],
        where: {
          examId: activeExam.id,
          isSuspicious: false,
          NOT: {
            examType: ExamType.CAREER_RESCUE,
            gender: Gender.FEMALE,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.subjectScore.groupBy({
        by: ["subjectId", "rawScore"],
        where: {
          submission: {
            examId: activeExam.id,
            isSuspicious: false,
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.subject.findMany({
        select: {
          id: true,
          name: true,
          examType: true,
          maxScore: true,
        },
      }),
    ]);

    // 키: `${regionId}-${examType}-${gender}` (구조경채는 MALE로 저장됨)
    // 과락 제외 평균점수 맵
    const avgScoreMap = new Map(
      participantStats.map((item) => [
        `${item.regionId}-${item.examType}-${item.gender}`,
        item._avg.finalScore === null ? null : roundNumber(Number(item._avg.finalScore)),
      ])
    );
    // 과락 포함 참여인원 기준으로 participantMap 구성 (평균점수는 과락 제외)
    const participantMap = new Map(
      allParticipantCountStats.map((item) => {
        const key = `${item.regionId}-${item.examType}-${item.gender}`;
        return [
          key,
          {
            participantCount: item._count._all,
            averageFinalScore: avgScoreMap.get(key) ?? null,
          },
        ];
      })
    );

    const scoreBandMap = new Map<string, ScoreBandRow[]>();
    for (const row of scoreBandStats) {
      const key = `${row.regionId}-${row.examType}-${row.gender}`;
      const current = scoreBandMap.get(key) ?? [];
      current.push({
        regionId: row.regionId,
        examType: row.examType,
        gender: row.gender,
        finalScore: Number(row.finalScore),
        _count: {
          _all: row._count._all,
        },
      });
      scoreBandMap.set(key, current);
    }

    const rows: MainStatsRow[] = [];

    function buildRow(
      quota: QuotaRow,
      examType: ExamType,
      gender: Gender | null
    ): MainStatsRow | null {
      const recruitCount = getGenderRecruitCount(quota, examType, gender);
      if (recruitCount < 1) return null;

      // 구조경채 submissions는 MALE로 저장되므로 키에 MALE 사용
      const genderKey = gender ?? Gender.MALE;
      const key = `${quota.regionId}-${examType}-${genderKey}`;
      const participant = participantMap.get(key);
      const participantCount = participant?.participantCount ?? 0;
      const averageFinalScore = participant?.averageFinalScore ?? null;
      const applicantCountInfo = getGenderApplicantCount(quota, examType, gender);
      const estimatedApplicants = estimateApplicants({
        applicantCount: applicantCountInfo.applicantCount,
        recruitCount,
      });
      const competitionRate =
        recruitCount > 0 && applicantCountInfo.applicantCount !== null
          ? roundNumber(applicantCountInfo.applicantCount / recruitCount)
          : null;

      const scoreBands = buildScoreBands(scoreBandMap.get(key) ?? []);
      const oneMultipleBand = getScoreBandInfoAtRank(scoreBands, recruitCount);
      const oneMultipleCutScore = oneMultipleBand?.score ?? null;
      const oneMultipleActualRank = oneMultipleBand?.endRank ?? null;
      const oneMultipleTieCount = oneMultipleBand?.count ?? null;

      const passMultiple = getPassMultiple(recruitCount, examType);
      const likelyMultiple = getLikelyMultiple(passMultiple);
      const likelyMaxRank = Math.max(1, Math.floor(recruitCount * likelyMultiple));
      const passCount = Math.ceil(recruitCount * passMultiple);

      const likelyRange = getScoreRange(scoreBands, recruitCount + 1, likelyMaxRank);
      const possibleRange = getScoreRange(scoreBands, likelyMaxRank + 1, passCount);
      const sureMinScore = getScoreAtRank(scoreBands, recruitCount);

      return {
        regionId: quota.regionId,
        regionName: quota.regionName,
        examType,
        gender,
        examTypeLabel: examTypeLabel(examType, gender),
        recruitCount,
        applicantCount: applicantCountInfo.applicantCount,
        estimatedApplicants,
        isApplicantCountExact: applicantCountInfo.isExact,
        competitionRate,
        participantCount,
        averageFinalScore,
        oneMultipleCutScore,
        oneMultipleBaseRank: recruitCount,
        oneMultipleActualRank,
        oneMultipleTieCount,
        possibleRange,
        likelyRange,
        sureMinScore,
      };
    }

    for (const quota of quotas) {
      for (const examType of enabledExamTypes) {
        if (examType === ExamType.CAREER_RESCUE) {
          // 구조경채: 남자만, gender = null로 표시
          const row = buildRow(quota, examType, null);
          if (row) rows.push(row);
        } else {
          // 공채 / 소방학과 / 구급: 남녀 분리 (양성 제외)
          for (const gender of [Gender.MALE, Gender.FEMALE]) {
            const row = buildRow(quota, examType, gender);
            if (row) rows.push(row);
          }
        }
      }
    }

    const myScoresByExamType = new Map<ExamType, UserScoreSnapshot>();
    for (const submission of mySubmissions) {
      if (myScoresByExamType.has(submission.examType)) {
        continue;
      }

      const subjectScoresByName = new Map<string, { score: number; isFail: boolean }>();
      for (const subjectScore of submission.subjectScores) {
        subjectScoresByName.set(subjectScore.subject.name, {
          score: Number(subjectScore.rawScore),
          isFail: subjectScore.isFailed,
        });
      }

      myScoresByExamType.set(submission.examType, {
        totalScore: Number(submission.totalScore),
        hasAnyFail: submission.subjectScores.some((subjectScore) => subjectScore.isFailed),
        subjectScoresByName,
      });
    }

    const scoreDistributions = buildScoreDistributions({
      enabledExamTypes,
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        examType: subject.examType,
        maxScore: Number(subject.maxScore),
      })),
      totalScoreRows: totalScoreDistributionRaw.map((row) => ({
        examType: row.examType,
        totalScore: Number(row.totalScore),
        count: row._count._all,
      })),
      subjectScoreRows: subjectScoreDistributionRaw.map((row) => ({
        subjectId: row.subjectId,
        rawScore: Number(row.rawScore),
        count: row._count._all,
      })),
      myScoresByExamType,
    });

    const competitiveBase = rows
      .filter(
        (row) =>
          row.averageFinalScore !== null &&
          row.sureMinScore !== null &&
          row.participantCount >= 1
      )
      .map((row) => ({
        label: `${row.regionName}-${row.examTypeLabel}`,
        averageFinalScore: row.averageFinalScore as number,
        sureMinScore: row.sureMinScore as number,
        gap: roundNumber((row.sureMinScore as number) - (row.averageFinalScore as number)),
      }));

    const topCompetitive = competitiveBase
      .slice()
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    const leastCompetitive = competitiveBase
      .slice()
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        careerExamEnabled,
        liveStats,
        sectionVisibility,
        notices,
        difficulty,
        rows,
        topCompetitive,
        leastCompetitive,
        scoreDistributions,
        refresh: {
          enabled: Boolean(settings["site.mainPageAutoRefresh"]),
          intervalSec: refreshInterval,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("풀서비스 메인 통계 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "풀서비스 메인 통계 조회에 실패했습니다." }, { status: 500 });
  }
}

