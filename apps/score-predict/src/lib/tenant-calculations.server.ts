import "server-only";
import { BonusType, CalibrationSnapshotPhase, ExamType, Gender, Prisma, Role } from "@prisma/client";
import * as firePassCut from "@/lib/fire/pass-cut";
import * as firePrediction from "@/lib/fire/prediction";
import * as fireScoring from "@/lib/fire/scoring";
import {
  getFireApplicantCount,
  getFireRecruitmentCohorts,
} from "@/lib/fire/prediction-policy";
import * as firePassCutAuto from "@/lib/fire/pass-cut-auto-release";
import * as policePassCut from "@/lib/police/pass-cut";
import * as policePassCutAuto from "@/lib/police/pass-cut-auto-release";
import * as policePrediction from "@/lib/police/prediction";
import * as policeScoring from "@/lib/police/scoring";
import { capturePoliceCalibrationSnapshots } from "@/lib/police/calibration-snapshot";
import {
  getPoliceApplicantCount,
  getPoliceRecruitmentCohorts,
} from "@/lib/police/prediction-policy";
import type { TenantType } from "@/lib/tenant";
import { assertExamTypeForTenant } from "@/lib/tenant-exam";

export type TenantAnswerInput = fireScoring.AnswerInput;
export type TenantScoreResult = fireScoring.ScoreResult | policeScoring.ScoreResult;

export interface TenantQuota {
  recruitCount?: number | null;
  recruitCountCareer?: number | null;
  recruitPublicMale?: number | null;
  recruitPublicFemale?: number | null;
  recruitRescue?: number | null;
  recruitAcademicMale?: number | null;
  recruitAcademicFemale?: number | null;
  recruitAcademicCombined?: number | null;
  recruitEmtMale?: number | null;
  recruitEmtFemale?: number | null;
  applicantCount?: number | null;
  applicantCountCareer?: number | null;
  applicantPublicMale?: number | null;
  applicantPublicFemale?: number | null;
  applicantRescue?: number | null;
  applicantAcademicMale?: number | null;
  applicantAcademicFemale?: number | null;
  applicantAcademicCombined?: number | null;
  applicantEmtMale?: number | null;
  applicantEmtFemale?: number | null;
}

export interface TenantRecruitmentCohort {
  gender: Gender | null;
  populationGender: Gender | null;
  recruitCount: number;
}

function numberOrZero(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function getTenantRecruitCount(
  tenantType: TenantType,
  quota: TenantQuota,
  examType: ExamType,
  gender?: Gender | null
): number {
  assertExamTypeForTenant(tenantType, examType);
  if (tenantType === "police") {
    return policePrediction.getRecruitCount(
      {
        recruitCount: numberOrZero(quota.recruitCount),
        recruitCountCareer: numberOrZero(quota.recruitCountCareer),
      },
      examType
    );
  }

  return firePrediction.getRecruitCount(
    {
      recruitPublicMale: numberOrZero(quota.recruitPublicMale),
      recruitPublicFemale: numberOrZero(quota.recruitPublicFemale),
      recruitRescue: numberOrZero(quota.recruitRescue),
      recruitAcademicMale: numberOrZero(quota.recruitAcademicMale),
      recruitAcademicFemale: numberOrZero(quota.recruitAcademicFemale),
      recruitAcademicCombined: numberOrZero(quota.recruitAcademicCombined),
      recruitEmtMale: numberOrZero(quota.recruitEmtMale),
      recruitEmtFemale: numberOrZero(quota.recruitEmtFemale),
    },
    examType,
    gender ?? undefined
  );
}

export function getTenantRecruitmentCohorts(
  tenantType: TenantType,
  quota: TenantQuota,
  examType: ExamType
): TenantRecruitmentCohort[] {
  assertExamTypeForTenant(tenantType, examType);
  if (tenantType === "police") {
    return getPoliceRecruitmentCohorts(
      {
        recruitCount: numberOrZero(quota.recruitCount),
        recruitCountCareer: numberOrZero(quota.recruitCountCareer),
      },
      examType
    );
  }

  return getFireRecruitmentCohorts(
    {
      recruitPublicMale: numberOrZero(quota.recruitPublicMale),
      recruitPublicFemale: numberOrZero(quota.recruitPublicFemale),
      recruitRescue: numberOrZero(quota.recruitRescue),
      recruitAcademicMale: numberOrZero(quota.recruitAcademicMale),
      recruitAcademicFemale: numberOrZero(quota.recruitAcademicFemale),
      recruitAcademicCombined: numberOrZero(quota.recruitAcademicCombined),
      recruitEmtMale: numberOrZero(quota.recruitEmtMale),
      recruitEmtFemale: numberOrZero(quota.recruitEmtFemale),
    },
    examType
  );
}

export function getTenantPopulationGender(
  tenantType: TenantType,
  quota: TenantQuota,
  examType: ExamType,
  gender: Gender
): Gender | null {
  const cohorts = getTenantRecruitmentCohorts(tenantType, quota, examType);
  const exactCohort = cohorts.find((cohort) => cohort.gender === gender);
  if (exactCohort) return exactCohort.populationGender;

  const combinedCohort = cohorts.find((cohort) => cohort.gender === null);
  if (combinedCohort) return combinedCohort.populationGender;

  throw new Error("선택한 성별에 해당하는 모집단이 없습니다.");
}

export function getTenantApplicantCount(
  tenantType: TenantType,
  quota: TenantQuota,
  examType: ExamType,
  gender: Gender | null
): { applicantCount: number | null; isExact: boolean } {
  assertExamTypeForTenant(tenantType, examType);
  const raw = tenantType === "police"
    ? getPoliceApplicantCount(
        {
          applicantCount: quota.applicantCount ?? null,
          applicantCountCareer: quota.applicantCountCareer ?? null,
        },
        examType
      )
    : getFireApplicantCount(
        {
          recruitAcademicCombined: numberOrZero(quota.recruitAcademicCombined),
          applicantPublicMale: quota.applicantPublicMale ?? null,
          applicantPublicFemale: quota.applicantPublicFemale ?? null,
          applicantRescue: quota.applicantRescue ?? null,
          applicantAcademicMale: quota.applicantAcademicMale ?? null,
          applicantAcademicFemale: quota.applicantAcademicFemale ?? null,
          applicantAcademicCombined: quota.applicantAcademicCombined ?? null,
          applicantEmtMale: quota.applicantEmtMale ?? null,
          applicantEmtFemale: quota.applicantEmtFemale ?? null,
        },
        examType,
        gender
      );

  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? { applicantCount: Math.floor(raw), isExact: true }
    : { applicantCount: null, isExact: false };
}

export function getTenantPassMultiple(
  tenantType: TenantType,
  recruitCount: number,
  examType: ExamType
): number {
  assertExamTypeForTenant(tenantType, examType);
  return tenantType === "police"
    ? policePrediction.getPassMultiple(recruitCount, undefined, examType)
    : firePrediction.getPassMultiple(recruitCount, examType);
}

export function getTenantBonusPercent(
  tenantType: TenantType,
  bonusType: BonusType | string | null | undefined
): number {
  return tenantType === "police"
    ? policeScoring.getBonusPercent(bonusType)
    : fireScoring.getBonusPercent(bonusType);
}

export function getTenantBonusTypeFromPercent(
  tenantType: TenantType,
  veteranPercent: number,
  heroPercent: number
): BonusType {
  return tenantType === "police"
    ? policeScoring.getBonusTypeFromPercent(veteranPercent, heroPercent)
    : fireScoring.getBonusTypeFromPercent(veteranPercent, heroPercent);
}

export function isValidTenantBonusType(
  tenantType: TenantType,
  bonusType: string | null | undefined
): bonusType is BonusType {
  return tenantType === "police"
    ? policeScoring.isValidBonusType(bonusType)
    : fireScoring.isValidBonusType(bonusType);
}

export async function calculateTenantScore(
  tenantType: TenantType,
  params: {
    examId: number;
    examType: ExamType;
    answers: TenantAnswerInput[];
    bonusType?: BonusType | null;
    bonusRate?: number | null;
    tx?: Prisma.TransactionClient;
  }
): Promise<TenantScoreResult> {
  assertExamTypeForTenant(tenantType, params.examType);
  return tenantType === "police"
    ? policeScoring.calculateScore(params)
    : fireScoring.calculateScore(params);
}

export async function rescoreTenantExam(
  tenantType: TenantType,
  examId: number,
  options?: {
    reason?: string;
    adminUserId: number;
    examType: ExamType;
    changedQuestions?: Array<{
      subjectName: string;
      questionNumber: number;
      oldAnswer: number | null;
      newAnswer: number;
    }>;
  }
) {
  if (options) assertExamTypeForTenant(tenantType, options.examType);
  return tenantType === "police"
    ? policeScoring.rescoreExam(examId, options)
    : fireScoring.rescoreExam(examId, options);
}

export async function calculateTenantPrediction(
  tenantType: TenantType,
  userId: number,
  options: { submissionId?: number; page?: number; limit?: number } = {},
  requesterRole: Role = Role.USER
) {
  return tenantType === "police"
    ? policePrediction.calculatePrediction(userId, options, requesterRole)
    : firePrediction.calculatePrediction(userId, options, requesterRole);
}

export function isTenantPredictionError(
  error: unknown
): error is Error & { status: number } {
  return (
    error instanceof policePrediction.PredictionError ||
    error instanceof firePrediction.PredictionError
  );
}

export function maskTenantName(tenantType: TenantType, name: string): string {
  return tenantType === "police"
    ? policePrediction.maskKoreanName(name)
    : firePrediction.maskKoreanName(name);
}

type FirePassCutRow = Awaited<ReturnType<typeof firePassCut.buildPassCutPredictionRows>>[number];
type PolicePassCutRow = Awaited<ReturnType<typeof policePassCut.buildPassCutPredictionRows>>[number];
export type TenantPassCutPredictionRow = (FirePassCutRow | PolicePassCutRow) & {
  gender: Gender | null;
};

export async function buildTenantPassCutPredictionRows(
  tenantType: TenantType,
  params: { examId: number; includeCareerExamType: boolean }
): Promise<TenantPassCutPredictionRow[]> {
  if (tenantType === "police") {
    const rows = await policePassCut.buildPassCutPredictionRows(params);
    return rows.map((row) => ({ ...row, gender: null }));
  }
  const rows = await firePassCut.buildPassCutPredictionRows(params);
  return rows.map((row) => ({ ...row, gender: row.gender ?? null }));
}

type FireAutoRow = Awaited<ReturnType<typeof firePassCutAuto.evaluateAutoPassCutRows>>[number];
type PoliceAutoRow = Awaited<ReturnType<typeof policePassCutAuto.evaluateAutoPassCutRows>>[number];
export type TenantAutoPassCutRow = (FireAutoRow | PoliceAutoRow) & { gender: Gender | null };

function normalizeAutoRows(
  tenantType: TenantType,
  rows: FireAutoRow[] | PoliceAutoRow[]
): TenantAutoPassCutRow[] {
  if (tenantType === "fire") {
    return (rows as FireAutoRow[]).map((row) => ({ ...row, gender: row.gender ?? null }));
  }
  return (rows as PoliceAutoRow[]).map((row) => ({ ...row, gender: null }));
}

export async function evaluateTenantAutoPassCutRows(
  tenantType: TenantType,
  params: Parameters<typeof firePassCutAuto.evaluateAutoPassCutRows>[0]
): Promise<TenantAutoPassCutRow[]> {
  const rows =
    tenantType === "police"
      ? await policePassCutAuto.evaluateAutoPassCutRows(params)
      : await firePassCutAuto.evaluateAutoPassCutRows(params);
  return normalizeAutoRows(tenantType, rows);
}

export async function runTenantAutoPassCutRelease(
  tenantType: TenantType,
  params: Parameters<typeof firePassCutAuto.runAutoPassCutRelease>[0]
) {
  if (tenantType === "police") {
    const result = await policePassCutAuto.runAutoPassCutRelease(params);
    if (result.triggered && result.nextReleaseNumber) {
      const phaseByRelease = {
        1: CalibrationSnapshotPhase.EXAM_DAY_CLOSE,
        2: CalibrationSnapshotPhase.D_PLUS_1,
        3: CalibrationSnapshotPhase.D_PLUS_2,
        4: CalibrationSnapshotPhase.D_PLUS_4,
      } as const;
      const phase = phaseByRelease[result.nextReleaseNumber as keyof typeof phaseByRelease];
      if (phase && result.examId) {
        await capturePoliceCalibrationSnapshots({ examId: result.examId, phase });
      }
    }
    return { ...result, rows: normalizeAutoRows(tenantType, result.rows) };
  }
  const result = await firePassCutAuto.runAutoPassCutRelease(params);
  return { ...result, rows: normalizeAutoRows(tenantType, result.rows) };
}

export function resolveTenantNextPassCutReleaseNumber(
  tenantType: TenantType,
  existingReleaseNumbers: number[]
): number | null {
  return tenantType === "police"
    ? policePassCutAuto.resolveNextReleaseNumberFromList(existingReleaseNumbers)
    : firePassCutAuto.resolveNextReleaseNumberFromList(existingReleaseNumbers);
}

export function toTenantPassCutSnapshot(
  tenantType: TenantType,
  row: TenantAutoPassCutRow | undefined
) {
  return tenantType === "police"
    ? policePassCutAuto.toSnapshotFromEvaluatedRow(row as PoliceAutoRow | undefined)
    : firePassCutAuto.toSnapshotFromEvaluatedRow(row as FireAutoRow | undefined);
}
