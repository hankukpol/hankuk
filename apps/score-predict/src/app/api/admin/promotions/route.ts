import { Prisma, PromotionCampaignStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { lockActiveExamStateForTransition, requireSoleActiveExam } from "@/lib/active-exam";
import { revalidatePromotionPublic } from "@/lib/exam-operation";
import { prisma } from "@/lib/prisma";
import {
  CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
  getDefaultPromotionTemplateContent,
  getPromotionTemplateDefinition,
} from "@/lib/promotions/template-registry";
import { normalizePromotionTemplateContent } from "@/lib/promotions/template-content.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function expectedUpdatedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

async function guardRequest() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard;
  const featureError = await requireAdminSiteFeature("promotions");
  if (featureError) return { error: featureError };
  const adminId = Number(guard.session.user.id);
  return { ...guard, adminId };
}

export async function GET() {
  const guard = await guardRequest();
  if ("error" in guard) return guard.error;
  try {
    const activeExam = await requireSoleActiveExam({ db: prisma, tenantType: guard.tenantType, context: "admin/promotions:list" });
    const campaigns = await prisma.promotionCampaign.findMany({
      where: {
        examId: activeExam.id,
        tenantType: guard.tenantType,
        templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      include: { revisions: { orderBy: { version: "desc" }, select: { id: true, version: true, content: true, createdAt: true } } },
    });
    const operationState = await prisma.examOperationState.findUnique({ where: { examId: activeExam.id }, select: { activeCampaignId: true, phase: true, version: true } });
    return NextResponse.json({
      activeExam,
      operationState,
      campaigns,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("프로모션 목록 조회 실패", error);
    return NextResponse.json({ error: "프로모션 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardRequest();
  if ("error" in guard) return guard.error;
  try {
    const activeExam = await requireSoleActiveExam({ db: prisma, tenantType: guard.tenantType, context: "admin/promotions:create" });
    const body = await request.json();
    const requestedTemplateKey = body.templateKey === undefined
      ? CUSTOM_HTML_PROMOTION_TEMPLATE_KEY
      : String(body.templateKey);
    if (requestedTemplateKey !== CUSTOM_HTML_PROMOTION_TEMPLATE_KEY) {
      return NextResponse.json(
        { error: "HTML/CSS 자유 랜딩 형식만 만들 수 있습니다." },
        { status: 400 },
      );
    }
    const templateKey = CUSTOM_HTML_PROMOTION_TEMPLATE_KEY;
    const template = getPromotionTemplateDefinition(templateKey);
    if (!template || !template.tenantTypes.includes(guard.tenantType)) {
      return NextResponse.json({ error: "이 서비스에서 사용할 수 없는 프로모션 템플릿입니다." }, { status: 400 });
    }
    const name = String(body.name ?? template.label).trim().slice(0, 160);
    if (!name) return NextResponse.json({ error: "캠페인 이름을 입력해 주세요." }, { status: 400 });
    const defaultContent = getDefaultPromotionTemplateContent(templateKey);
    if (!defaultContent) return NextResponse.json({ error: "템플릿 기본 콘텐츠를 찾을 수 없습니다." }, { status: 400 });
    const content = normalizePromotionTemplateContent(templateKey, body.content ?? defaultContent);
    const created = await prisma.promotionCampaign.create({
      data: { tenantType: guard.tenantType, examId: activeExam.id, name, templateKey, templateVersion: template.version, draftContent: jsonValue(content), createdBy: guard.adminId, updatedBy: guard.adminId },
    });
    return NextResponse.json({ success: true, campaign: created }, { status: 201 });
  } catch (error) {
    console.error("프로모션 생성 실패", error);
    return NextResponse.json({ error: "프로모션을 만들지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await guardRequest();
  if ("error" in guard) return guard.error;
  try {
    const body = await request.json();
    const action = String(body.action ?? "SAVE").toUpperCase();
    const campaignId = positiveInt(body.id);
    if (!campaignId) return NextResponse.json({ error: "캠페인 ID가 올바르지 않습니다." }, { status: 400 });
    const activeExam = await requireSoleActiveExam({ db: prisma, tenantType: guard.tenantType, context: `admin/promotions:${action.toLowerCase()}` });
    const campaign = await prisma.promotionCampaign.findFirst({
      where: {
        id: campaignId,
        examId: activeExam.id,
        tenantType: guard.tenantType,
        templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
      },
      include: { revisions: { orderBy: { version: "desc" } } },
    });
    if (!campaign) return NextResponse.json({ error: "현재 회차의 캠페인을 찾을 수 없습니다." }, { status: 404 });

    if (action === "CLONE") {
      const cloned = await prisma.promotionCampaign.create({ data: { tenantType: guard.tenantType, examId: activeExam.id, name: `${campaign.name} 복사본`.slice(0, 160), templateKey: campaign.templateKey, templateVersion: campaign.templateVersion, draftContent: campaign.draftContent as Prisma.InputJsonValue, createdBy: guard.adminId, updatedBy: guard.adminId } });
      return NextResponse.json({ success: true, campaign: cloned });
    }
    if (action === "ARCHIVE") {
      const activeReference = await prisma.examOperationState.findFirst({ where: { examId: activeExam.id, activeCampaignId: campaign.id } });
      if (activeReference) return NextResponse.json({ error: "현재 대표 캠페인은 다른 캠페인으로 전환한 뒤 보관할 수 있습니다." }, { status: 409 });
      const archived = await prisma.promotionCampaign.update({ where: { id: campaign.id }, data: { status: PromotionCampaignStatus.ARCHIVED, archivedAt: new Date(), updatedBy: guard.adminId } });
      return NextResponse.json({ success: true, campaign: archived });
    }
    if (campaign.status === PromotionCampaignStatus.ARCHIVED) return NextResponse.json({ error: "보관된 캠페인은 복제 후 수정해 주세요." }, { status: 409 });
    if (action === "RESTORE") {
      const version = positiveInt(body.version);
      const revision = version ? campaign.revisions.find((item) => item.version === version) : null;
      if (!revision) return NextResponse.json({ error: "복원할 게시 버전을 찾을 수 없습니다." }, { status: 404 });
      const expected = expectedUpdatedAt(body.expectedUpdatedAt);
      if (!expected) return NextResponse.json({ error: "편집 기준 시각이 누락되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 400 });
      const updated = await prisma.promotionCampaign.updateMany({ where: { id: campaign.id, updatedAt: expected }, data: { draftContent: revision.content as Prisma.InputJsonValue, updatedBy: guard.adminId } });
      if (updated.count !== 1) return NextResponse.json({ error: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
      const restored = await prisma.promotionCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      return NextResponse.json({ success: true, campaign: restored });
    }
    if (action === "PUBLISH") {
      const expected = expectedUpdatedAt(body.expectedUpdatedAt);
      if (!expected) return NextResponse.json({ error: "게시 기준 시각이 누락되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 400 });
      const name = String(body.name ?? campaign.name).trim().slice(0, 160);
      if (!name) return NextResponse.json({ error: "캠페인 이름을 입력해 주세요." }, { status: 400 });
      const content = normalizePromotionTemplateContent(campaign.templateKey, body.content ?? campaign.draftContent);
      const normalizedJson = jsonValue(content);
      const published = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PromotionCampaign" WHERE "id" = ${campaign.id} FOR UPDATE`);
        const locked = await tx.promotionCampaign.findUnique({ where: { id: campaign.id } });
        if (!locked || locked.examId !== activeExam.id || locked.tenantType !== guard.tenantType || locked.status === PromotionCampaignStatus.ARCHIVED) throw new Error("INVALID_CAMPAIGN");
        if (locked.updatedAt.valueOf() !== expected.valueOf()) throw new Error("CAMPAIGN_CONFLICT");
        const version = locked.publishedVersion + 1;
        await tx.promotionCampaignRevision.create({ data: { campaignId: locked.id, version, content: normalizedJson, createdBy: guard.adminId } });
        return tx.promotionCampaign.update({ where: { id: locked.id }, data: { name, draftContent: normalizedJson, publishedContent: normalizedJson, publishedVersion: version, status: PromotionCampaignStatus.PUBLISHED, publishedAt: new Date(), publishedBy: guard.adminId, updatedBy: guard.adminId, archivedAt: null } });
      });
      revalidatePromotionPublic(guard.tenantType);
      return NextResponse.json({ success: true, campaign: published });
    }
    if (action !== "SAVE") return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
    const expected = expectedUpdatedAt(body.expectedUpdatedAt);
    if (!expected) return NextResponse.json({ error: "편집 기준 시각이 누락되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 400 });
    const name = String(body.name ?? campaign.name).trim().slice(0, 160);
    if (!name) return NextResponse.json({ error: "캠페인 이름을 입력해 주세요." }, { status: 400 });
    const content = normalizePromotionTemplateContent(campaign.templateKey, body.content ?? campaign.draftContent);
    const updated = await prisma.promotionCampaign.updateMany({ where: { id: campaign.id, updatedAt: expected }, data: { name, draftContent: jsonValue(content), updatedBy: guard.adminId } });
    if (updated.count !== 1) return NextResponse.json({ error: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    const saved = await prisma.promotionCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    return NextResponse.json({ success: true, campaign: saved });
  } catch (error) {
    if (error instanceof Error && error.message === "CAMPAIGN_CONFLICT") {
      return NextResponse.json({ error: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVALID_CAMPAIGN") {
      return NextResponse.json({ error: "현재 회차에서 게시할 수 없는 캠페인입니다." }, { status: 409 });
    }
    console.error("프로모션 변경 실패", error);
    return NextResponse.json({ error: "프로모션 변경에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardRequest();
  if ("error" in guard) return guard.error;

  try {
    const body = await request.json();
    const campaignId = positiveInt(body.id);
    if (!campaignId) {
      return NextResponse.json({ error: "캠페인 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const expected = expectedUpdatedAt(body.expectedUpdatedAt);
    if (!expected) {
      return NextResponse.json(
        { error: "삭제 기준 시각이 누락되었습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 400 },
      );
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await lockActiveExamStateForTransition(tx, guard.tenantType);
      const activeExam = await requireSoleActiveExam({
        db: tx,
        tenantType: guard.tenantType,
        context: "admin/promotions:delete",
      });
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "PromotionCampaign" WHERE "id" = ${campaignId} FOR UPDATE`,
      );
      const campaign = await tx.promotionCampaign.findFirst({
        where: {
          id: campaignId,
          examId: activeExam.id,
          tenantType: guard.tenantType,
          templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
        },
        select: { id: true, name: true, updatedAt: true },
      });
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
      if (campaign.updatedAt.valueOf() !== expected.valueOf()) throw new Error("CAMPAIGN_CONFLICT");

      const activeReference = await tx.examOperationState.findFirst({
        where: { examId: activeExam.id, activeCampaignId: campaign.id },
        select: { id: true },
      });
      if (activeReference) throw new Error("ACTIVE_CAMPAIGN_DELETE");

      await tx.promotionCampaign.delete({ where: { id: campaign.id } });
      return campaign;
    });

    return NextResponse.json({ success: true, campaign: { id: deleted.id, name: deleted.name } });
  } catch (error) {
    if (error instanceof Error && error.message === "CAMPAIGN_NOT_FOUND") {
      return NextResponse.json({ error: "현재 회차의 캠페인을 찾을 수 없습니다." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CAMPAIGN_CONFLICT") {
      return NextResponse.json(
        { error: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "ACTIVE_CAMPAIGN_DELETE") {
      return NextResponse.json(
        { error: "현재 대표 캠페인은 다른 캠페인으로 전환한 뒤 삭제할 수 있습니다." },
        { status: 409 },
      );
    }
    console.error("프로모션 삭제 실패", error);
    return NextResponse.json({ error: "프로모션 삭제에 실패했습니다." }, { status: 500 });
  }
}
