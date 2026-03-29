import { ExamType, PassCutSnapshotStatus, Role } from "@prisma/client";
import { buildPassCutPredictionRows, type PassCutPredictionRow } from "@/lib/police/pass-cut";
import {
  createPassCutRelease,
  PassCutReleaseServiceError,
  type PassCutSnapshotStatusPayload,
} from "@/lib/police/pass-cut-release.service";
import { getPassMultiple } from "@/lib/police/prediction";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export type AutoPassCutMode = "HYBRID" | "TRAFFIC_ONLY" | "CRON_ONLY";
export type AutoPassCutProfile = "BALANCED" | "CONSERVATIVE" | "AGGRESSIVE";

interface ThresholdBundle {
  coverageByRelease: [number, number, number, number];
  stabilityByRelease: [number, number, number, number];
  readyRatioByRelease: [number, number, number, number];
  minSampleCount: number;
}

interface AutoPassCutSettings {
  enabled: boolean;
  mode: AutoPassCutMode;
  checkIntervalSec: number;
  thresholdProfile: AutoPassCutProfile;
  readyRatioProfile: AutoPassCutProfile;
  includeCareerExamType: boolean;
}

interface ScoreBandGroupRow {
  regionId: number;
  examType: ExamType;
  finalScore: number;
  _count: { _all: number };
}

export interface AutoPassCutEvaluatedRow extends PassCutPredictionRow {
  examTypeLabel: string;
  statusPayload: PassCutSnapshotStatusPayload;
  isReady: boolean;
  oneMultipleTieCount: number | null;
  recentInflowCount: number;
  recentInflowRatePct: number;
  cut60mAgo: number | null;
  cutShift: number | null;
  cutShiftPenalty: number;
  inflowPenalty: number;
  tiePenalty: number;
}

export interface AutoPassCutRunResult {
  triggered: boolean;
  examId: number | null;
  nextReleaseNumber: number | null;
  readyRegionRatio: number;
  eligibleRegionCount: number;
  readyRegionCount: number;
  releaseId: number | null;
  reason:
    | "AUTO_DISABLED"
    | "MODE_BLOCKED"
    | "INTERVAL_THROTTLED"
    | "NO_ACTIVE_EXAM"
    | "NO_TARGET_ROWS"
    | "ALL_RELEASES_COMPLETED"
    | "THRESHOLD_NOT_REACHED"
    | "NO_ADMIN_USER"
    | "RELEASE_CREATED"
    | "DUPLICATED"
    | "UNKNOWN";
  rows: AutoPassCutEvaluatedRow[];
}

const PROFILE_MAP: Record<AutoPassCutProfile, ThresholdBundle> = {
  BALANCED: {
    coverageByRelease: [30, 50, 70, 90],
    stabilityByRelease: [45, 55, 65, 75],
    readyRatioByRelease: [25, 45, 65, 85],
    minSampleCount: 10,
  },
  CONSERVATIVE: {
    coverageByRelease: [40, 60, 80, 95],
    stabilityByRelease: [55, 65, 75, 85],
    readyRatioByRelease: [35, 55, 75, 95],
    minSampleCount: 15,
  },
  AGGRESSIVE: {
    coverageByRelease: [20, 35, 50, 70],
    stabilityByRelease: [35, 45, 55, 65],
    readyRatioByRelease: [15, 30, 50, 70],
    minSampleCount: 8,
  },
};

const SCORE_KEY_SCALE = 1000000;
const lastTrafficCheckByExamId = new Map<number, number>();

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function toScoreKey(score: number): number {
  return Math.round(score * SCORE_KEY_SCALE);
}

function buildRegionExamKey(regionId: number, examType: ExamType): string {
  return `${regionId}-${examType}`;
}

function examTypeLabel(examType: ExamType): string {
  return examType === ExamType.PUBLIC ? "공채" : "경행경채";
}

function parseProfile(value: unknown, fallback: AutoPassCutProfile): AutoPassCutProfile {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  if (normalized === "BALANCED") return "BALANCED";
  if (normalized === "CONSERVATIVE") return "CONSERVATIVE";
  if (normalized === "AGGRESSIVE") return "AGGRESSIVE";
  return fallback;
}

function parseMode(value: unknown): AutoPassCutMode {
  if (typeof value !== "string") return "HYBRID";
  const normalized = value.trim().toUpperCase();
  if (normalized === "TRAFFIC_ONLY") return "TRAFFIC_ONLY";
  if (normalized === "CRON_ONLY") return "CRON_ONLY";
  return "HYBRID";
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function shouldSkipByTrafficInterval(examId: number, intervalSec: number): boolean {
  const now = Date.now();
  const prev = lastTrafficCheckByExamId.get(examId) ?? 0;
  const intervalMs = Math.max(30, intervalSec) * 1000;
  if (now - prev < intervalMs) {
    return true;
  }
  lastTrafficCheckByExamId.set(examId, now);
  return false;
}

function getStatusReason(status: PassCutSnapshotStatus): string {
  if (status === PassCutSnapshotStatus.COLLECTING_MISSING_APPLICANT_COUNT) {
    return "응시인원 미입력";
  }
  if (status === PassCutSnapshotStatus.COLLECTING_INSUFFICIENT_SAMPLE) {
    return "표본 부족";
  }
  if (status === PassCutSnapshotStatus.COLLECTING_LOW_PARTICIPATION) {
    return "참여율 부족";
  }
  if (status === PassCutSnapshotStatus.COLLECTING_UNSTABLE) {
    return "안정도 부족";
  }
  return "집계 완료";
}

function getNextReleaseNumber(existingReleaseNumbers: number[]): number | null {
  const set = new Set(existingReleaseNumbers);
  for (let n = 1; n <= 4; n += 1) {
    if (!set.has(n)) return n;
  }
  return null;
}

function getScoreAtRank(
  scoreBands: Array<{ score: number; count: number }>,
  rank: number
): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null;

  let covered = 0;
  for (const band of scoreBands) {
    covered += band.count;
    if (covered >= rank) {
      return roundNumber(band.score);
    }
  }

  return null;
}

function getCutFromGroupedRows(
  rows: ScoreBandGroupRow[],
  recruitCount: number
): number | null {
  const bands = rows.map((row) => ({ score: Number(row.finalScore), count: row._count._all }));
  return getScoreAtRank(bands, recruitCount);
}

function isModeAllowed(trigger: "traffic" | "cron", mode: AutoPassCutMode): boolean {
  if (trigger === "traffic") {
    return mode === "HYBRID" || mode === "TRAFFIC_ONLY";
  }
  return mode === "HYBRID" || mode === "CRON_ONLY";
}

async function resolveAutoCreatedByUserId(): Promise<number | null> {
  const fromEnv = Number(process.env.AUTO_PASSCUT_ADMIN_USER_ID ?? "");
  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    const exists = await prisma.user.findFirst({
      where: { id: fromEnv, role: Role.ADMIN },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const firstAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  return firstAdmin?.id ?? null;
}

function buildNoticeContent(params: {
  releaseNumber: number;
  readyRegionCount: number;
  eligibleRegionCount: number;
  readyRatio: number;
  rows: AutoPassCutEvaluatedRow[];
}): string {
  const collectingCount = Math.max(0, params.eligibleRegionCount - params.readyRegionCount);
  const header = [
    `${params.releaseNumber}차 합격컷이 자동 발표되었습니다.`,
    `충족 지역: ${params.readyRegionCount}/${params.eligibleRegionCount} (${params.readyRatio.toFixed(1)}%)`,
    `미집계 지역: ${collectingCount}건`,
    "",
    "[지역·직렬별 상태]",
  ];

  const lines = params.rows
    .slice()
    .sort((a, b) => {
      const byRegion = a.regionName.localeCompare(b.regionName, "ko-KR");
      if (byRegion !== 0) return byRegion;
      return a.examType.localeCompare(b.examType);
    })
    .map((row) => {
      const statusText =
        row.statusPayload.status === PassCutSnapshotStatus.READY
          ? `집계완료(1배수컷 ${row.oneMultipleCutScore?.toFixed(2) ?? "-"}점)`
          : `미집계(${row.statusPayload.statusReason ?? getStatusReason(row.statusPayload.status)})`;

      const coverageText =
        row.statusPayload.coverageRate === null ? "-" : `${row.statusPayload.coverageRate.toFixed(1)}%`;
      const stabilityText =
        row.statusPayload.stabilityScore === null ? "-" : row.statusPayload.stabilityScore.toFixed(1);
      const targetText =
        row.statusPayload.targetParticipantCount === null
          ? "-"
          : row.statusPayload.targetParticipantCount.toLocaleString("ko-KR");

      return `- ${row.regionName}-${examTypeLabel(row.examType)}: ${statusText}, 참여 ${row.participantCount.toLocaleString("ko-KR")}명 / 목표 ${targetText}명 / 참여율 ${coverageText} / 안정도 ${stabilityText}`;
    });

  return [...header, ...lines].join("\n");
}

async function getAutoPassCutSettings(): Promise<AutoPassCutSettings> {
  const settings = await getSiteSettingsUncached();

  return {
    enabled: Boolean(settings["site.autoPassCutEnabled"] ?? false),
    mode: parseMode(settings["site.autoPassCutMode"] ?? "HYBRID"),
    checkIntervalSec: parsePositiveInt(settings["site.autoPassCutCheckIntervalSec"], 300),
    thresholdProfile: parseProfile(settings["site.autoPassCutThresholdProfile"], "BALANCED"),
    readyRatioProfile: parseProfile(settings["site.autoPassCutReadyRatioProfile"], "BALANCED"),
    includeCareerExamType: Boolean(settings["site.careerExamEnabled"] ?? true),
  };
}

function toThresholdBundle(
  thresholdProfile: AutoPassCutProfile,
  readyRatioProfile: AutoPassCutProfile
): ThresholdBundle {
  return {
    ...PROFILE_MAP[thresholdProfile],
    readyRatioByRelease: PROFILE_MAP[readyRatioProfile].readyRatioByRelease,
  };
}

export function resolveNextReleaseNumberFromList(existingReleaseNumbers: number[]): number | null {
  return getNextReleaseNumber(existingReleaseNumbers);
}

export async function evaluateAutoPassCutRows(params: {
  examId: number;
  releaseNumberForThreshold: number;
  includeCareerExamType?: boolean;
  thresholdProfile?: AutoPassCutProfile;
  readyRatioProfile?: AutoPassCutProfile;
}): Promise<AutoPassCutEvaluatedRow[]> {
  const settings = await getAutoPassCutSettings();
  const thresholdProfile = params.thresholdProfile ?? settings.thresholdProfile;
  const readyRatioProfile = params.readyRatioProfile ?? settings.readyRatioProfile;
  const thresholdBundle = toThresholdBundle(thresholdProfile, readyRatioProfile);

  return evaluateRows({
    examId: params.examId,
    includeCareerExamType: params.includeCareerExamType ?? settings.includeCareerExamType,
    releaseNumberForThreshold: params.releaseNumberForThreshold,
    thresholdBundle,
  });
}

function buildStatusPayload(params: {
  row: PassCutPredictionRow;
  coverageThreshold: number;
  stabilityThreshold: number;
  minSampleCount: number;
  targetParticipantCount: number;
  coverageRate: number;
  stabilityScore: number;
}): { statusPayload: PassCutSnapshotStatusPayload; isReady: boolean } {
  if (params.row.applicantCount === null) {
    return {
      isReady: false,
      statusPayload: {
        status: PassCutSnapshotStatus.COLLECTING_MISSING_APPLICANT_COUNT,
        statusReason: "응시인원 미입력",
        applicantCount: null,
        targetParticipantCount: params.targetParticipantCount,
        coverageRate: roundNumber(params.coverageRate),
        stabilityScore: roundNumber(params.stabilityScore),
      },
    };
  }

  if (params.row.participantCount < params.minSampleCount || params.row.oneMultipleCutScore === null) {
    return {
      isReady: false,
      statusPayload: {
        status: PassCutSnapshotStatus.COLLECTING_INSUFFICIENT_SAMPLE,
        statusReason: "표본 부족",
        applicantCount: params.row.applicantCount,
        targetParticipantCount: params.targetParticipantCount,
        coverageRate: roundNumber(params.coverageRate),
        stabilityScore: roundNumber(params.stabilityScore),
      },
    };
  }

  if (params.coverageRate < params.coverageThreshold) {
    return {
      isReady: false,
      statusPayload: {
        status: PassCutSnapshotStatus.COLLECTING_LOW_PARTICIPATION,
        statusReason: `참여율 부족 (${params.coverageRate.toFixed(1)}% < ${params.coverageThreshold}%)`,
        applicantCount: params.row.applicantCount,
        targetParticipantCount: params.targetParticipantCount,
        coverageRate: roundNumber(params.coverageRate),
        stabilityScore: roundNumber(params.stabilityScore),
      },
    };
  }

  if (params.stabilityScore < params.stabilityThreshold) {
    return {
      isReady: false,
      statusPayload: {
        status: PassCutSnapshotStatus.COLLECTING_UNSTABLE,
        statusReason: `안정도 부족 (${params.stabilityScore.toFixed(1)} < ${params.stabilityThreshold})`,
        applicantCount: params.row.applicantCount,
        targetParticipantCount: params.targetParticipantCount,
        coverageRate: roundNumber(params.coverageRate),
        stabilityScore: roundNumber(params.stabilityScore),
      },
    };
  }

  return {
    isReady: true,
    statusPayload: {
      status: PassCutSnapshotStatus.READY,
      statusReason: null,
      applicantCount: params.row.applicantCount,
      targetParticipantCount: params.targetParticipantCount,
      coverageRate: roundNumber(params.coverageRate),
      stabilityScore: roundNumber(params.stabilityScore),
    },
  };
}

async function evaluateRows(params: {
  examId: number;
  includeCareerExamType: boolean;
  releaseNumberForThreshold: number;
  thresholdBundle: ThresholdBundle;
}): Promise<AutoPassCutEvaluatedRow[]> {
  const baseRows = await buildPassCutPredictionRows({
    examId: params.examId,
    includeCareerExamType: params.includeCareerExamType,
  });

  if (baseRows.length < 1) return [];

  const index = Math.max(0, Math.min(3, params.releaseNumberForThreshold - 1));
  const coverageThreshold = params.thresholdBundle.coverageByRelease[index];
  const stabilityThreshold = params.thresholdBundle.stabilityByRelease[index];

  const populationWhere = {
    examId: params.examId,
    isSuspicious: false,
    subjectScores: {
      some: {},
      none: { isFailed: true },
    },
  } as const;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [recentInflows, currentScoreBands, historyScoreBands] = await Promise.all([
    prisma.submission.groupBy({
      by: ["regionId", "examType"],
      where: {
        ...populationWhere,
        createdAt: { gte: oneHourAgo },
      },
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ["regionId", "examType", "finalScore"],
      where: populationWhere,
      _count: { _all: true },
      orderBy: [{ regionId: "asc" }, { examType: "asc" }, { finalScore: "desc" }],
    }),
    prisma.submission.groupBy({
      by: ["regionId", "examType", "finalScore"],
      where: {
        ...populationWhere,
        createdAt: { lt: oneHourAgo },
      },
      _count: { _all: true },
      orderBy: [{ regionId: "asc" }, { examType: "asc" }, { finalScore: "desc" }],
    }),
  ]);

  const inflowMap = new Map(
    recentInflows.map((row) => [buildRegionExamKey(row.regionId, row.examType), row._count._all] as const)
  );

  const currentBandMap = new Map<string, ScoreBandGroupRow[]>();
  const historyBandMap = new Map<string, ScoreBandGroupRow[]>();
  const tieCountMap = new Map<string, number>();

  for (const row of currentScoreBands) {
    const key = buildRegionExamKey(row.regionId, row.examType);
    const list = currentBandMap.get(key) ?? [];
    list.push(row);
    currentBandMap.set(key, list);

    const tieKey = `${key}-${toScoreKey(Number(row.finalScore))}`;
    tieCountMap.set(tieKey, row._count._all);
  }

  for (const row of historyScoreBands) {
    const key = buildRegionExamKey(row.regionId, row.examType);
    const list = historyBandMap.get(key) ?? [];
    list.push(row);
    historyBandMap.set(key, list);
  }

  const evaluated: AutoPassCutEvaluatedRow[] = [];

  for (const row of baseRows) {
    const key = buildRegionExamKey(row.regionId, row.examType);

    const passMultiple = getPassMultiple(row.recruitCount);
    const targetParticipantCount = Math.ceil(row.recruitCount * passMultiple);
    const coverageRate =
      targetParticipantCount > 0
        ? roundNumber((row.participantCount / targetParticipantCount) * 100)
        : 0;

    const recentInflowCount = inflowMap.get(key) ?? 0;
    const recentInflowRatePct =
      targetParticipantCount > 0
        ? roundNumber((recentInflowCount / targetParticipantCount) * 100)
        : 0;

    const tieKey =
      row.oneMultipleCutScore === null ? null : `${key}-${toScoreKey(row.oneMultipleCutScore)}`;
    const oneMultipleTieCount = tieKey ? (tieCountMap.get(tieKey) ?? 0) : null;

    const cut60mAgo = getCutFromGroupedRows(historyBandMap.get(key) ?? [], row.recruitCount);
    const cutShift =
      row.oneMultipleCutScore !== null && cut60mAgo !== null
        ? roundNumber(Math.abs(row.oneMultipleCutScore - cut60mAgo))
        : null;

    const cutShiftPenalty = cutShift === null ? 40 : Math.min(40, cutShift * 20);
    const inflowPenalty = Math.min(30, recentInflowRatePct * 1.5);
    const tieRatePct =
      oneMultipleTieCount === null || row.participantCount < 1
        ? 0
        : (oneMultipleTieCount / row.participantCount) * 100;
    const tiePenalty = Math.min(30, tieRatePct * 1.2);

    const stabilityScore = roundNumber(
      Math.max(0, 100 - cutShiftPenalty - inflowPenalty - tiePenalty)
    );

    const statusComputed = buildStatusPayload({
      row,
      coverageThreshold,
      stabilityThreshold,
      minSampleCount: params.thresholdBundle.minSampleCount,
      targetParticipantCount,
      coverageRate,
      stabilityScore,
    });

    evaluated.push({
      ...row,
      examTypeLabel: examTypeLabel(row.examType),
      statusPayload: statusComputed.statusPayload,
      isReady: statusComputed.isReady,
      oneMultipleTieCount,
      recentInflowCount,
      recentInflowRatePct,
      cut60mAgo,
      cutShift,
      cutShiftPenalty: roundNumber(cutShiftPenalty),
      inflowPenalty: roundNumber(inflowPenalty),
      tiePenalty: roundNumber(tiePenalty),
    });
  }

  return evaluated;
}

export async function runAutoPassCutRelease(params: {
  examId?: number;
  trigger: "traffic" | "cron";
  force?: boolean;
}): Promise<AutoPassCutRunResult> {
  const settings = await getAutoPassCutSettings();

  const fallbackResult: AutoPassCutRunResult = {
    triggered: false,
    examId: null,
    nextReleaseNumber: null,
    readyRegionRatio: 0,
    eligibleRegionCount: 0,
    readyRegionCount: 0,
    releaseId: null,
    reason: "UNKNOWN",
    rows: [],
  };

  if (!settings.enabled) {
    return {
      ...fallbackResult,
      reason: "AUTO_DISABLED",
    };
  }

  if (!isModeAllowed(params.trigger, settings.mode)) {
    return {
      ...fallbackResult,
      reason: "MODE_BLOCKED",
    };
  }

  const examId =
    params.examId ??
    (
      await prisma.exam.findFirst({
        where: { isActive: true },
        orderBy: [{ examDate: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    )?.id ??
    null;

  if (!examId) {
    return {
      ...fallbackResult,
      reason: "NO_ACTIVE_EXAM",
    };
  }

  if (params.trigger === "traffic" && !params.force) {
    if (shouldSkipByTrafficInterval(examId, settings.checkIntervalSec)) {
      return {
        ...fallbackResult,
        examId,
        reason: "INTERVAL_THROTTLED",
      };
    }
  }

  const releases = await prisma.passCutRelease.findMany({
    where: { examId },
    orderBy: [{ releaseNumber: "asc" }, { id: "asc" }],
    select: { releaseNumber: true },
  });

  const nextReleaseNumber = getNextReleaseNumber(releases.map((item) => item.releaseNumber));
  if (!nextReleaseNumber) {
    const rows = await evaluateRows({
      examId,
      includeCareerExamType: settings.includeCareerExamType,
      releaseNumberForThreshold: 4,
      thresholdBundle: toThresholdBundle(settings.thresholdProfile, settings.readyRatioProfile),
    });

    return {
      ...fallbackResult,
      examId,
      nextReleaseNumber: null,
      rows,
      eligibleRegionCount: rows.length,
      readyRegionCount: rows.filter((row) => row.isReady).length,
      readyRegionRatio:
        rows.length > 0
          ? roundNumber((rows.filter((row) => row.isReady).length / rows.length) * 100)
          : 0,
      reason: "ALL_RELEASES_COMPLETED",
    };
  }

  const thresholdBundle = toThresholdBundle(
    settings.thresholdProfile,
    settings.readyRatioProfile
  );

  const rows = await evaluateRows({
    examId,
    includeCareerExamType: settings.includeCareerExamType,
    releaseNumberForThreshold: nextReleaseNumber,
    thresholdBundle,
  });

  if (rows.length < 1) {
    return {
      ...fallbackResult,
      examId,
      nextReleaseNumber,
      reason: "NO_TARGET_ROWS",
      rows,
    };
  }

  const eligibleRegionCount = rows.length;
  const readyRegionCount = rows.filter((row) => row.isReady).length;
  const readyRegionRatio =
    eligibleRegionCount > 0
      ? roundNumber((readyRegionCount / eligibleRegionCount) * 100)
      : 0;

  const ratioThreshold = thresholdBundle.readyRatioByRelease[nextReleaseNumber - 1];

  if (readyRegionRatio < ratioThreshold) {
    return {
      ...fallbackResult,
      examId,
      nextReleaseNumber,
      readyRegionRatio,
      eligibleRegionCount,
      readyRegionCount,
      rows,
      reason: "THRESHOLD_NOT_REACHED",
    };
  }

  const createdBy = await resolveAutoCreatedByUserId();
  if (!createdBy) {
    return {
      ...fallbackResult,
      examId,
      nextReleaseNumber,
      readyRegionRatio,
      eligibleRegionCount,
      readyRegionCount,
      rows,
      reason: "NO_ADMIN_USER",
    };
  }

  try {
    const created = await createPassCutRelease({
      examId,
      releaseNumber: nextReleaseNumber,
      createdBy,
      source: "AUTO",
      memo: `AUTO ${nextReleaseNumber}차 발표 (충족 ${readyRegionCount}/${eligibleRegionCount}, ${readyRegionRatio.toFixed(1)}%)`,
      autoNotice: true,
      customNoticeTitle: `${nextReleaseNumber}차 합격컷 자동 발표 안내`,
      customNoticeContent: buildNoticeContent({
        releaseNumber: nextReleaseNumber,
        readyRegionCount,
        eligibleRegionCount,
        readyRatio: readyRegionRatio,
        rows,
      }),
      snapshots: rows.map((row) => ({
        regionId: row.regionId,
        examType: row.examType,
        participantCount: row.participantCount,
        recruitCount: row.recruitCount,
        averageScore: row.averageScore,
        oneMultipleCutScore: row.oneMultipleCutScore,
        sureMinScore: row.sureMinScore,
        likelyMinScore: row.likelyMinScore,
        possibleMinScore: row.possibleMinScore,
        statusPayload: row.statusPayload,
      })),
    });

    return {
      triggered: true,
      examId,
      nextReleaseNumber,
      readyRegionRatio,
      eligibleRegionCount,
      readyRegionCount,
      releaseId: created.id,
      reason: "RELEASE_CREATED",
      rows,
    };
  } catch (error) {
    if (error instanceof PassCutReleaseServiceError && error.status === 409) {
      return {
        ...fallbackResult,
        examId,
        nextReleaseNumber,
        readyRegionRatio,
        eligibleRegionCount,
        readyRegionCount,
        rows,
        reason: "DUPLICATED",
      };
    }
    throw error;
  }
}

export function toSnapshotFromEvaluatedRow(
  row: AutoPassCutEvaluatedRow | undefined
): {
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
  targetParticipantCount: number | null;
  coverageRate: number | null;
  stabilityScore: number | null;
  status: PassCutSnapshotStatus;
  statusReason: string | null;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
} {
  if (!row) {
    return {
      participantCount: 0,
      recruitCount: 0,
      applicantCount: null,
      targetParticipantCount: null,
      coverageRate: null,
      stabilityScore: null,
      status: PassCutSnapshotStatus.COLLECTING_INSUFFICIENT_SAMPLE,
      statusReason: "표본 부족",
      averageScore: null,
      oneMultipleCutScore: null,
      sureMinScore: null,
      likelyMinScore: null,
      possibleMinScore: null,
    };
  }

  return {
    participantCount: row.participantCount,
    recruitCount: row.recruitCount,
    applicantCount: row.statusPayload.applicantCount,
    targetParticipantCount: row.statusPayload.targetParticipantCount,
    coverageRate: row.statusPayload.coverageRate,
    stabilityScore: row.statusPayload.stabilityScore,
    status: row.statusPayload.status,
    statusReason: row.statusPayload.statusReason,
    averageScore: row.averageScore,
    oneMultipleCutScore: row.oneMultipleCutScore,
    sureMinScore: row.sureMinScore,
    likelyMinScore: row.likelyMinScore,
    possibleMinScore: row.possibleMinScore,
  };
}
