import { Prisma, PrismaClient, PromotionCampaignStatus, Role } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeCustomHtmlDocument } from "../src/lib/promotions/custom-html";
import {
  buildPolice2026SecondScoringPromotionHtml,
  POLICE_2026_SECOND_SCORING_LOCAL_ASSET_BASE,
  POLICE_2026_SECOND_SCORING_PRODUCTION_ASSET_BASE,
} from "../src/lib/promotions/police-2026-second-scoring";
import {
  CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
  CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION,
} from "../src/lib/promotions/template-registry";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
const LOCAL_DATABASE_PORT = "54332";
const CAMPAIGN_NAME = "2026년 경찰 2차 가채점 프로모션";

function localPoliceDatabaseUrl() {
  const rawUrl = process.env.PROMOTION_SCORING_LOCAL_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("PROMOTION_SCORING_LOCAL_DATABASE_URL이 필요합니다.");
  }

  const url = new URL(rawUrl);
  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== LOCAL_DATABASE_PORT) {
    throw new Error(`로컬 PostgreSQL ${LOCAL_DATABASE_PORT} 포트만 사용할 수 있습니다.`);
  }
  if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  url.searchParams.set("schema", "score_predict_police");
  return url.toString();
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadScoringHtml() {
  const exportedPath = path.resolve(process.cwd(), ".local/police-2026-second-scoring-promotion.html");
  const exported = await readFile(exportedPath, "utf8").catch(() => null);
  // 운영 게시용으로 내보낸 HTML을 로컬 DB에 다시 넣을 때도 이미지·폰트는
  // 로컬 public 자산을 사용해야 한다. 운영 도메인이 아직 새 자산을 배포하지
  // 않았다면 404로 이미지가 빠지고 전체 레이아웃이 무너질 수 있다.
  const source = (exported ?? buildPolice2026SecondScoringPromotionHtml())
    .replaceAll(
      POLICE_2026_SECOND_SCORING_PRODUCTION_ASSET_BASE,
      POLICE_2026_SECOND_SCORING_LOCAL_ASSET_BASE,
    );
  const sanitized = sanitizeCustomHtmlDocument(source);
  if (sanitized.length < 10_000) {
    throw new Error("가채점 프로모션 HTML이 예상보다 작아 복구를 중단했습니다.");
  }
  return sanitized;
}

async function main() {
  const databaseUrl = localPoliceDatabaseUrl();
  const htmlDocument = await loadScoringHtml();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const [activeExams, admin] = await Promise.all([
      prisma.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.user.findFirst({ where: { role: Role.ADMIN }, orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    if (activeExams.length !== 1 || !admin) {
      throw new Error("경찰 활성 시험 1개와 관리자 계정이 필요합니다.");
    }

    const exam = activeExams[0];
    const existing = await prisma.promotionCampaign.findFirst({
      where: {
        tenantType: "police",
        examId: exam.id,
        templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
        name: CAMPAIGN_NAME,
      },
      orderBy: { id: "asc" },
    });
    const content = json({ htmlDocument });
    const publishedVersion = (existing?.publishedVersion ?? 0) + 1;
    const publishedAt = new Date();

    const campaign = await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.promotionCampaign.update({
            where: { id: existing.id },
            data: {
              draftContent: content,
              publishedContent: content,
              publishedVersion,
              status: PromotionCampaignStatus.PUBLISHED,
              publishedAt,
              publishedBy: admin.id,
              updatedBy: admin.id,
              archivedAt: null,
            },
          })
        : await tx.promotionCampaign.create({
            data: {
              tenantType: "police",
              examId: exam.id,
              name: CAMPAIGN_NAME,
              templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
              templateVersion: CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION,
              draftContent: content,
              publishedContent: content,
              publishedVersion,
              status: PromotionCampaignStatus.PUBLISHED,
              createdBy: admin.id,
              updatedBy: admin.id,
              publishedBy: admin.id,
              publishedAt,
            },
          });

      await tx.promotionCampaignRevision.create({
        data: {
          campaignId: saved.id,
          version: publishedVersion,
          content,
          createdBy: admin.id,
        },
      });
      return saved;
    });

    console.log(JSON.stringify({
      prepared: true,
      target: "local",
      exam,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        publishedVersion: campaign.publishedVersion,
        htmlLength: htmlDocument.length,
      },
      activeCampaignChanged: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
