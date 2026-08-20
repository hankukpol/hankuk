import { ExamOperationPhase, Prisma, PromotionCampaignStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import {
  isActiveExamRouteError,
  lockActiveExamStateForTransition,
  requireSoleActiveExam,
} from "@/lib/active-exam";
import {
  getEffectiveOperationContext,
  inferLegacyOperationPhase,
  normalizeOperationOverrides,
  OPERATION_PHASE_DESCRIPTIONS,
  OPERATION_PHASE_LABELS,
  revalidatePromotionPublic,
  resolveOperationFeatures,
} from "@/lib/exam-operation";
import { prisma } from "@/lib/prisma";
import { getPromotionTemplateDefinition } from "@/lib/promotions/template-registry";
import { getSiteSettingsUncached, revalidateSiteSettingsCache } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PHASES = new Set(Object.values(ExamOperationPhase));

function optionalPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  try {
    const operation = await getEffectiveOperationContext();
    const campaigns = operation.exam ? (await prisma.promotionCampaign.findMany({
      where: { examId: operation.exam.id, tenantType: guard.tenantType, status: PromotionCampaignStatus.PUBLISHED },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: { id: true, name: true, templateKey: true, templateVersion: true, publishedVersion: true, publishedAt: true },
    })).filter((campaign) => {
      const template = getPromotionTemplateDefinition(campaign.templateKey);
      return template?.version === campaign.templateVersion && template.tenantTypes.includes(guard.tenantType);
    }) : [];
    const configuredCampaignId = operation.state?.activeCampaignId ?? null;
    const activeCampaignSupported = configuredCampaignId === null || campaigns.some(
      (campaign) => campaign.id === configuredCampaignId,
    );
    const publicOperation = operation.state && !activeCampaignSupported
      ? { ...operation, state: { ...operation.state, activeCampaignId: null } }
      : operation;
    return NextResponse.json({
      operation: {
        ...publicOperation,
        phaseLabel: OPERATION_PHASE_LABELS[operation.phase],
        warnings: [
          ...(operation.source === "INVARIANT_CLOSED" ? ["활성 시험은 정확히 1개여야 합니다. 현재 학생 기능은 안전을 위해 모두 차단되었습니다."] : []),
          ...(operation.source === "LEGACY_SETTINGS" ? ["회차 운영 상태가 아직 백필되지 않아 기존 설정 호환 모드입니다."] : []),
          ...(operation.exam && !operation.state?.activeCampaignId ? ["대표 캠페인이 없어 기본 서비스 홈이 표시됩니다."] : []),
          ...(!activeCampaignSupported ? ["기존 구조화 프로모션은 지원이 종료되어 기본 서비스 홈이 표시됩니다. HTML/CSS 캠페인을 게시한 뒤 대표로 선택해 주세요."] : []),
        ],
      },
      campaigns,
      presets: Object.values(ExamOperationPhase).map((phase) => ({
        phase,
        label: OPERATION_PHASE_LABELS[phase],
        description: OPERATION_PHASE_DESCRIPTIONS[phase],
        features: resolveOperationFeatures(phase, {}),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("회차 운영 상태 조회 실패", error);
    return NextResponse.json({ error: "회차 운영 상태를 조회하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  try {
    const body = await request.json();
    const phase = body.phase as ExamOperationPhase;
    if (!VALID_PHASES.has(phase)) return NextResponse.json({ error: "운영 단계가 올바르지 않습니다." }, { status: 400 });
    const activeCampaignId = optionalPositiveInt(body.activeCampaignId);
    if (body.activeCampaignId !== null && body.activeCampaignId !== undefined && body.activeCampaignId !== "" && !activeCampaignId) {
      return NextResponse.json({ error: "대표 캠페인 ID가 올바르지 않습니다." }, { status: 400 });
    }
    const expectedVersion = optionalPositiveInt(body.expectedVersion);
    const overrides = normalizeOperationOverrides(body.featureOverrides);
    const adminId = Number(guard.session.user.id);
    const settings = await getSiteSettingsUncached();
    const legacyPhase = inferLegacyOperationPhase(settings);

    const updated = await prisma.$transaction(async (tx) => {
      await lockActiveExamStateForTransition(tx, guard.tenantType);
      const activeExam = await requireSoleActiveExam({ db: tx, tenantType: guard.tenantType, context: "admin/exam-operation:transition" });
      let campaign = null;
      if (activeCampaignId) {
        campaign = await tx.promotionCampaign.findFirst({ where: { id: activeCampaignId, examId: activeExam.id, tenantType: guard.tenantType, status: PromotionCampaignStatus.PUBLISHED, publishedContent: { not: Prisma.DbNull } }, select: { id: true, templateKey: true, templateVersion: true, publishedVersion: true } });
        if (!campaign) throw new Error("INVALID_CAMPAIGN");
        const template = getPromotionTemplateDefinition(campaign.templateKey);
        if (!template || template.version !== campaign.templateVersion || !template.tenantTypes.includes(guard.tenantType)) {
          throw new Error("INVALID_CAMPAIGN");
        }
      }
      const current = await tx.examOperationState.findUnique({ where: { examId: activeExam.id } });
      if ((current?.version ?? null) !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const previousPhase = current?.phase ?? legacyPhase;
      const previousCampaignId = current?.activeCampaignId ?? null;
      const before = current ? { phase: current.phase, activeCampaignId: current.activeCampaignId, featureOverrides: current.featureOverrides, version: current.version } : { phase: legacyPhase, activeCampaignId: null, featureOverrides: {}, version: 0 };
      const next = current
        ? await tx.examOperationState.update({ where: { id: current.id }, data: { phase, activeCampaignId, featureOverrides: json(overrides), version: { increment: 1 }, updatedBy: adminId } })
        : await tx.examOperationState.create({ data: { examId: activeExam.id, phase, activeCampaignId, featureOverrides: json(overrides), version: 1, updatedBy: adminId } });
      const after = { phase: next.phase, activeCampaignId: next.activeCampaignId, featureOverrides: next.featureOverrides, version: next.version };
      await tx.examOperationAuditLog.create({ data: { operationStateId: next.id, examId: activeExam.id, previousPhase, nextPhase: phase, previousCampaignId, nextCampaignId: activeCampaignId, beforeSnapshot: json(before), afterSnapshot: json(after), changedBy: adminId, note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null } });
      return { state: next, exam: activeExam, campaign };
    });
    revalidatePromotionPublic(guard.tenantType);
    revalidateSiteSettingsCache();
    return NextResponse.json({ success: true, ...updated, features: resolveOperationFeatures(updated.state.phase, updated.state.featureOverrides) });
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return NextResponse.json({ error: "다른 관리자가 운영 상태를 변경했습니다. 다시 확인해 주세요." }, { status: 409 });
    if (error instanceof Error && error.message === "INVALID_CAMPAIGN") return NextResponse.json({ error: "같은 회차에 게시된 캠페인만 대표로 선택할 수 있습니다." }, { status: 400 });
    console.error("회차 운영 상태 변경 실패", error);
    return NextResponse.json({ error: "회차 운영 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}
