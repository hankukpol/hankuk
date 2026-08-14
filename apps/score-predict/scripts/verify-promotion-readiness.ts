import assert from "node:assert/strict";
import { PrismaClient, PromotionCampaignStatus } from "@prisma/client";
import { resolveOperationFeatures } from "../src/lib/exam-operation";
import { CUSTOM_HTML_PROMOTION_TEMPLATE_KEY } from "../src/lib/promotions/template-registry";
import { loadRuntimeEnvFile } from "./lib/load-runtime-env";

const TENANTS = [
  { type: "police", schema: "score_predict_police", requireCampaign: true },
  { type: "fire", schema: "score_predict_fire", requireCampaign: false },
] as const;

function withSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function verifyTenant(baseUrl: string, tenant: (typeof TENANTS)[number]) {
  const db = new PrismaClient({
    datasources: { db: { url: withSchema(baseUrl, tenant.schema) } },
    log: ["error"],
  });
  try {
    const activeExams = await db.exam.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        operationState: {
          select: {
            id: true,
            phase: true,
            activeCampaignId: true,
            featureOverrides: true,
            version: true,
          },
        },
      },
    });
    assert.equal(activeExams.length, 1, `${tenant.schema}: 활성 시험은 정확히 1개여야 합니다.`);
    const exam = activeExams[0];
    assert.ok(exam.operationState, `${tenant.schema}: ExamOperationState 백필이 필요합니다.`);

    const campaign = exam.operationState.activeCampaignId
      ? await db.promotionCampaign.findFirst({
          where: {
            id: exam.operationState.activeCampaignId,
            examId: exam.id,
            tenantType: tenant.type,
            templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
            status: PromotionCampaignStatus.PUBLISHED,
          },
          select: {
            id: true,
            name: true,
            publishedVersion: true,
            publishedContent: true,
          },
        })
      : null;

    if (tenant.requireCampaign) {
      assert.ok(campaign?.publishedContent, `${tenant.schema}: 게시·대표 지정된 HTML/CSS 경찰 캠페인이 필요합니다.`);
      assert.ok(campaign.publishedVersion > 0, `${tenant.schema}: 캠페인 게시 버전이 없습니다.`);
    } else if (exam.operationState.activeCampaignId) {
      assert.ok(campaign?.publishedContent, `${tenant.schema}: 대표 캠페인이 유효하지 않습니다.`);
    }

    return {
      tenant: tenant.type,
      schema: tenant.schema,
      exam: { id: exam.id, name: exam.name },
      operation: {
        phase: exam.operationState.phase,
        version: exam.operationState.version,
        features: resolveOperationFeatures(
          exam.operationState.phase,
          exam.operationState.featureOverrides,
        ),
      },
      campaign: campaign
        ? { id: campaign.id, name: campaign.name, publishedVersion: campaign.publishedVersion }
        : null,
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  loadRuntimeEnvFile();
  const baseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(baseUrl, "DIRECT_URL 또는 DATABASE_URL이 필요합니다.");
  const results = [];
  for (const tenant of TENANTS) results.push(await verifyTenant(baseUrl, tenant));
  console.log(JSON.stringify({ ready: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
