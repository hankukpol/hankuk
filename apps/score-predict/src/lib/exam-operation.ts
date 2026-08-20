import "server-only";

import { ExamOperationPhase, PromotionCampaignStatus, type Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { getPrismaClientForTenant, prisma } from "@/lib/prisma";
import { getPromotionTemplateDefinition } from "@/lib/promotions/template-registry";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import type { SiteSettingsMap } from "@/lib/site-settings.constants";
import type { TenantType } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

export const PROMOTION_PUBLIC_CACHE_TAG = "promotion-public";

export type OperationFeatureKey =
  | "preRegistration"
  | "answerInput"
  | "result"
  | "analysis"
  | "finalPrediction"
  | "comments"
  | "notices"
  | "faq";

export type OperationFeatures = Record<OperationFeatureKey, boolean>;

export const OPERATION_PHASE_LABELS: Record<ExamOperationPhase, string> = {
  PRE_REGISTRATION: "사전등록",
  SCORING_OPEN: "가채점만 오픈",
  ANALYSIS_OPEN: "가채점 + 표본분석 오픈",
  FINAL_OPEN: "답안 마감 + 최종예측 오픈",
  CLOSED: "종료·보관",
};

export const OPERATION_PHASE_DESCRIPTIONS: Record<ExamOperationPhase, string> = {
  PRE_REGISTRATION: "시험 전 응시지역과 수험번호를 등록합니다. 답안 입력과 성적 화면은 닫힙니다.",
  SCORING_OPEN: "답안 입력과 개인 성적 결과만 먼저 엽니다. 별도 합격예측·표본분포 화면은 닫힌 선택적 안전 단계입니다.",
  ANALYSIS_OPEN: "답안 입력, 개인 성적 결과, 지역별 표본분석과 합격예측을 함께 엽니다. 시험 직후 권장 단계입니다.",
  FINAL_OPEN: "새 답안 입력을 마감하고 기존 성적·표본분석과 필기·체력 최종 환산 예측을 엽니다.",
  CLOSED: "회차 사용자 기능을 닫고 공지사항과 FAQ만 유지합니다.",
};

export const OPERATION_PRESETS: Record<ExamOperationPhase, OperationFeatures> = {
  PRE_REGISTRATION: { preRegistration: true, answerInput: false, result: false, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true },
  SCORING_OPEN: { preRegistration: false, answerInput: true, result: true, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true },
  ANALYSIS_OPEN: { preRegistration: false, answerInput: true, result: true, analysis: true, finalPrediction: false, comments: false, notices: true, faq: true },
  FINAL_OPEN: { preRegistration: false, answerInput: false, result: true, analysis: true, finalPrediction: true, comments: false, notices: true, faq: true },
  CLOSED: { preRegistration: false, answerInput: false, result: false, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true },
};

const OVERRIDABLE_FEATURES = new Set<OperationFeatureKey>([
  "preRegistration", "answerInput", "result", "analysis", "finalPrediction", "comments", "notices", "faq",
]);

export type OperationFeatureOverrides = Partial<Record<OperationFeatureKey, boolean>>;

export function normalizeOperationOverrides(value: unknown): OperationFeatureOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: OperationFeatureOverrides = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (OVERRIDABLE_FEATURES.has(key as OperationFeatureKey) && typeof raw === "boolean") {
      output[key as OperationFeatureKey] = raw;
    }
  }
  return output;
}

export function resolveOperationFeatures(phase: ExamOperationPhase, rawOverrides: unknown): OperationFeatures {
  return { ...OPERATION_PRESETS[phase], ...normalizeOperationOverrides(rawOverrides) };
}

export function inferLegacyOperationPhase(settings: SiteSettingsMap): ExamOperationPhase {
  if (Boolean(settings["site.finalPredictionEnabled"] ?? false)) return ExamOperationPhase.FINAL_OPEN;
  if (Boolean(settings["site.answerInputEnabled"] ?? false) && Boolean(settings["site.tabPredictionEnabled"] ?? false)) return ExamOperationPhase.ANALYSIS_OPEN;
  if (Boolean(settings["site.answerInputEnabled"] ?? false)) return ExamOperationPhase.SCORING_OPEN;
  if (Boolean(settings["site.preRegistrationEnabled"] ?? false)) return ExamOperationPhase.PRE_REGISTRATION;
  return ExamOperationPhase.CLOSED;
}

export function getLegacyOperationFeatures(settings: SiteSettingsMap): OperationFeatures {
  return {
    preRegistration: Boolean(settings["site.preRegistrationEnabled"] ?? false),
    answerInput: Boolean(settings["site.answerInputEnabled"] ?? false),
    result: Boolean(settings["site.tabResultEnabled"] ?? false),
    analysis: Boolean(settings["site.tabPredictionEnabled"] ?? false),
    finalPrediction: Boolean(settings["site.finalPredictionEnabled"] ?? false),
    comments: Boolean(settings["site.commentsEnabled"] ?? false),
    notices: Boolean(settings["site.tabNoticesEnabled"] ?? false),
    faq: Boolean(settings["site.tabFaqEnabled"] ?? false),
  };
}

/**
 * 기존 전역 사이트 설정을 회차 운영 상태로 옮길 때 학생에게 공개되던 기능을
 * 한 항목도 임의로 켜거나 끄지 않도록 프리셋과의 차이만 override로 보존한다.
 */
export function buildLegacyOperationMigration(settings: SiteSettingsMap) {
  const phase = inferLegacyOperationPhase(settings);
  const features = getLegacyOperationFeatures(settings);
  const preset = OPERATION_PRESETS[phase];
  const featureOverrides: OperationFeatureOverrides = {};

  for (const key of Object.keys(features) as OperationFeatureKey[]) {
    if (features[key] !== preset[key]) featureOverrides[key] = features[key];
  }

  return { phase, features, featureOverrides };
}

export function overlayOperationSettings(settings: SiteSettingsMap, features: OperationFeatures): SiteSettingsMap {
  return {
    ...settings,
    "site.preRegistrationEnabled": features.preRegistration,
    "site.answerInputEnabled": features.answerInput,
    "site.tabMainEnabled": true,
    "site.tabInputEnabled": features.preRegistration || features.answerInput,
    "site.tabResultEnabled": features.result,
    "site.tabPredictionEnabled": features.analysis,
    "site.finalPredictionEnabled": features.finalPrediction,
    "site.commentsEnabled": features.comments,
    "site.tabNoticesEnabled": features.notices,
    "site.tabFaqEnabled": features.faq,
    // 경찰 합격등급은 회차 프리셋이나 고급 재정의로 절대 켜지지 않는다.
    "site.policePredictionGradesEnabled": Boolean(settings["site.policePredictionGradesEnabled"] ?? false),
  };
}

export interface EffectiveOperationContext {
  tenantType: TenantType;
  exam: { id: number; name: string; year: number; round: number; examDate: Date } | null;
  state: {
    id: number;
    phase: ExamOperationPhase;
    activeCampaignId: number | null;
    featureOverrides: Prisma.JsonValue | null;
    version: number;
  } | null;
  phase: ExamOperationPhase;
  features: OperationFeatures;
  source: "EXAM_STATE" | "LEGACY_SETTINGS" | "INVARIANT_CLOSED";
}

export async function getEffectiveOperationContext(settings?: SiteSettingsMap): Promise<EffectiveOperationContext> {
  const [tenantType, baseSettings] = await Promise.all([
    getServerTenantType(),
    settings ? Promise.resolve(settings) : getSiteSettingsUncached(),
  ]);
  const activeExams = await prisma.exam.findMany({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: {
      id: true, name: true, year: true, round: true, examDate: true,
      operationState: { select: { id: true, phase: true, activeCampaignId: true, featureOverrides: true, version: true } },
    },
  });
  if (activeExams.length !== 1) {
    console.error("[operation-read-invariant]", {
      tenantType,
      activeExamCount: activeExams.length,
      activeExamIds: activeExams.map((exam) => exam.id),
    });
    return {
      tenantType,
      exam: null,
      state: null,
      phase: ExamOperationPhase.CLOSED,
      features: {
        preRegistration: false,
        answerInput: false,
        result: false,
        analysis: false,
        finalPrediction: false,
        comments: false,
        notices: false,
        faq: false,
      },
      source: "INVARIANT_CLOSED",
    };
  }
  if (!activeExams[0].operationState) {
    const phase = inferLegacyOperationPhase(baseSettings);
    return {
      tenantType,
      exam: activeExams[0],
      state: null,
      phase,
      features: resolveOperationFeatures(phase, {}),
      source: "LEGACY_SETTINGS",
    };
  }
  const { operationState, ...exam } = activeExams[0];
  return { tenantType, exam, state: operationState, phase: operationState.phase, features: resolveOperationFeatures(operationState.phase, operationState.featureOverrides), source: "EXAM_STATE" };
}

export async function getEffectiveSiteSettings(): Promise<SiteSettingsMap> {
  const settings = await getSiteSettingsUncached();
  const operation = await getEffectiveOperationContext(settings);
  return overlayOperationSettings(settings, operation.features);
}

export async function isOperationFeatureEnabled(feature: OperationFeatureKey): Promise<boolean> {
  const operation = await getEffectiveOperationContext();
  return operation.features[feature];
}

export async function getPublishedActiveCampaign() {
  const operation = await getEffectiveOperationContext();
  if (!operation.exam || !operation.state?.activeCampaignId) return { operation, campaign: null };
  const campaign = await unstable_cache(
    async () => {
      const db = getPrismaClientForTenant(operation.tenantType);
      return db.promotionCampaign.findFirst({
        where: { id: operation.state!.activeCampaignId!, examId: operation.exam!.id, tenantType: operation.tenantType, status: PromotionCampaignStatus.PUBLISHED },
        select: { id: true, name: true, templateKey: true, templateVersion: true, publishedVersion: true, publishedContent: true, publishedAt: true },
      });
    },
    [`promotion:active:${operation.tenantType}:${operation.exam.id}:${operation.state.activeCampaignId}`],
    { revalidate: 60, tags: [PROMOTION_PUBLIC_CACHE_TAG, `${PROMOTION_PUBLIC_CACHE_TAG}:${operation.tenantType}`] },
  )();
  if (!campaign?.publishedContent) return { operation, campaign: null };
  const template = getPromotionTemplateDefinition(campaign.templateKey);
  const isSupported = Boolean(
    template &&
      template.version === campaign.templateVersion &&
      template.tenantTypes.includes(operation.tenantType),
  );
  if (!isSupported) {
    console.error("[promotion-template-invariant]", {
      tenantType: operation.tenantType,
      campaignId: campaign.id,
      templateKey: campaign.templateKey,
      templateVersion: campaign.templateVersion,
    });
    return { operation, campaign: null };
  }
  return { operation, campaign };
}

export function revalidatePromotionPublic(tenantType: TenantType) {
  revalidateTag(PROMOTION_PUBLIC_CACHE_TAG, { expire: 0 });
  revalidateTag(`${PROMOTION_PUBLIC_CACHE_TAG}:${tenantType}`, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/exam/main");
}
