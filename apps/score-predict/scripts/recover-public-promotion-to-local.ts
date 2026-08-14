import { Prisma, PrismaClient, PromotionCampaignStatus, Role } from "@prisma/client";
import { chromium } from "playwright";
import { sanitizeCustomHtmlDocument } from "../src/lib/promotions/custom-html";
import { CUSTOM_HTML_PROMOTION_TEMPLATE_KEY } from "../src/lib/promotions/template-registry";
import { loadRuntimeEnvFile } from "./lib/load-runtime-env";

const DEFAULT_SOURCE_URL = "https://fullservice.hankukpol.co.kr/";
const ALLOWED_SOURCE_HOST = "fullservice.hankukpol.co.kr";
const ALLOWED_LOCAL_PORT = "54332";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
const MIGRATION_CAMPAIGN_NAME = "운영 랜딩 이전본 (HTML/CSS)";

function assertSafeSource(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_SOURCE_HOST) {
    throw new Error(`복구 원본은 ${DEFAULT_SOURCE_URL}만 허용됩니다.`);
  }
  return url;
}

function projectRefFromUrl(url: URL) {
  return url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1]
    ?? decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1]
    ?? null;
}

function assertTargetDatabase(rawUrl: string) {
  const url = new URL(rawUrl);
  if (LOCAL_HOSTS.has(url.hostname)) {
    if (url.port !== ALLOWED_LOCAL_PORT) {
      throw new Error(`로컬 PostgreSQL 포트가 ${ALLOWED_LOCAL_PORT}가 아니므로 이전을 중단했습니다.`);
    }
    if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  } else {
    const projectRef = projectRefFromUrl(url);
    if (!projectRef) throw new Error("Supabase project ref를 확인할 수 없습니다.");
    const expected = `IMPORT_CURRENT_POLICE_PROMOTION_${projectRef}`;
    if (process.env.PROMOTION_LANDING_IMPORT_CONFIRM !== expected) {
      throw new Error(`PROMOTION_LANDING_IMPORT_CONFIRM must equal ${expected}.`);
    }
  }
  url.searchParams.set("schema", "score_predict_police");
  return { url: url.toString(), hosted: !LOCAL_HOSTS.has(url.hostname) };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function absolutizeCssUrls(css: string, stylesheetUrl: string) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_full, _quote, rawValue: string) => {
    const value = rawValue.trim();
    if (!value || value.startsWith("data:") || value.startsWith("#")) return `url("${value}")`;
    try {
      return `url("${new URL(value, stylesheetUrl).toString().replace(/"/g, "%22")}")`;
    } catch {
      return "none";
    }
  });
}

function connectRegistrationCtas(markup: string) {
  return markup
    .replace(
      /<button\b([^>]*?)data-pre-registration-modal="true"([^>]*)>/gi,
      '<a href="#pre-registration"$1$2>',
    )
    .replace(/<\/button>/gi, "</a>")
    .replace(/data-reveal="([^"]+)"/gi, 'data-reveal="$1" data-aos="$1"');
}

const RECOVERED_MOTION_CSS = String.raw`
[data-reveal][data-aos] {
  opacity: 0 !important;
  transition:
    opacity 720ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 720ms cubic-bezier(0.22, 1, 0.36, 1) !important;
}
[data-reveal="up"][data-aos] { transform: translate3d(0, 40px, 0) !important; }
[data-reveal="left"][data-aos] { transform: translate3d(-40px, 0, 0) !important; }
[data-reveal="right"][data-aos] { transform: translate3d(40px, 0, 0) !important; }
[data-reveal="scale"][data-aos] { transform: scale(0.965) !important; }
[data-reveal][data-aos].aos-animate {
  opacity: 1 !important;
  transform: translate3d(0, 0, 0) scale(1) !important;
}
[data-reveal-delay="1"] { transition-delay: 90ms !important; }
[data-reveal-delay="2"] { transition-delay: 180ms !important; }
[data-reveal-delay="3"] { transition-delay: 270ms !important; }
[data-reveal-delay="4"] { transition-delay: 360ms !important; }
@media (prefers-reduced-motion: reduce) {
  [data-reveal][data-aos] {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
`;

async function capturePublishedLanding(sourceUrl: URL) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(sourceUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const promotion = page.locator('[data-promotion-template="police-2026-second"]');
    await promotion.waitFor({ state: "attached", timeout: 30_000 });

    const [markup, stylesheetUrls] = await Promise.all([
      promotion.evaluate((element) => element.outerHTML),
      page.locator('link[rel="stylesheet"][href]').evaluateAll((links) =>
        links.map((link) => (link as HTMLLinkElement).href),
      ),
    ]);

    const styles = await Promise.all(
      stylesheetUrls.map(async (stylesheetUrl) => {
        const response = await fetch(stylesheetUrl);
        if (!response.ok) throw new Error(`스타일시트 다운로드 실패: ${response.status} ${stylesheetUrl}`);
        return absolutizeCssUrls(await response.text(), stylesheetUrl);
      }),
    );

    const connectedMarkup = connectRegistrationCtas(markup);
    return sanitizeCustomHtmlDocument(`<style>${styles.join("\n")}\n${RECOVERED_MOTION_CSS}</style>${connectedMarkup}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  loadRuntimeEnvFile();
  const publishAndActivate = process.argv.includes("--publish-and-activate");
  const sourceUrl = assertSafeSource(process.env.PROMOTION_RECOVERY_SOURCE_URL ?? DEFAULT_SOURCE_URL);
  const target = assertTargetDatabase(
    process.env.PROMOTION_LANDING_TARGET_DATABASE_URL
      ?? process.env.PROMOTION_RECOVERY_LOCAL_DATABASE_URL
      ?? process.env.DIRECT_URL
      ?? process.env.DATABASE_URL
      ?? "",
  );
  const htmlDocument = await capturePublishedLanding(sourceUrl);
  if (htmlDocument.length < 10_000) throw new Error("복구된 문서가 예상보다 작아 저장하지 않았습니다.");

  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    const [exam, admin] = await Promise.all([
      prisma.exam.findFirst({ where: { isActive: true }, orderBy: { id: "desc" } }),
      prisma.user.findFirst({ where: { role: Role.ADMIN }, orderBy: { id: "asc" } }),
    ]);
    if (!exam || !admin) throw new Error("로컬 경찰 활성 시험 또는 관리자 계정을 찾지 못했습니다.");

    const existing = await prisma.promotionCampaign.findFirst({
      where: {
        examId: exam.id,
        tenantType: "police",
        templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
        name: MIGRATION_CAMPAIGN_NAME,
      },
      orderBy: { id: "asc" },
    });
    const draftContent = { htmlDocument };
    const campaign = await prisma.$transaction(async (tx) => {
      const currentState = await tx.examOperationState.findUnique({ where: { examId: exam.id } });
      if (publishAndActivate && !currentState) {
        throw new Error("회차 운영 상태가 없습니다. db:promotions:backfill을 먼저 실행해 주세요.");
      }

      if (!publishAndActivate) {
        return existing
          ? tx.promotionCampaign.update({
              where: { id: existing.id },
              data: {
                draftContent: json(draftContent),
                status: PromotionCampaignStatus.DRAFT,
                updatedBy: admin.id,
                archivedAt: null,
              },
            })
          : tx.promotionCampaign.create({
              data: {
                tenantType: "police",
                examId: exam.id,
                name: MIGRATION_CAMPAIGN_NAME,
                templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
                templateVersion: 1,
                draftContent: json(draftContent),
                status: PromotionCampaignStatus.DRAFT,
                createdBy: admin.id,
                updatedBy: admin.id,
              },
            });
      }

      const content = json(draftContent);
      const publishedVersion = (existing?.publishedVersion ?? 0) + 1;
      const publishedAt = new Date();
      const published = existing
        ? await tx.promotionCampaign.update({
            where: { id: existing.id },
            data: {
              draftContent: content,
              publishedContent: content,
              publishedVersion,
              status: PromotionCampaignStatus.PUBLISHED,
              publishedBy: admin.id,
              publishedAt,
              updatedBy: admin.id,
              archivedAt: null,
            },
          })
        : await tx.promotionCampaign.create({
            data: {
              tenantType: "police",
              examId: exam.id,
              name: MIGRATION_CAMPAIGN_NAME,
              templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
              templateVersion: 1,
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
        data: { campaignId: published.id, version: publishedVersion, content, createdBy: admin.id },
      });

      const before = {
        phase: currentState!.phase,
        activeCampaignId: currentState!.activeCampaignId,
        featureOverrides: currentState!.featureOverrides,
        version: currentState!.version,
      };
      const nextState = await tx.examOperationState.update({
        where: { id: currentState!.id },
        data: { activeCampaignId: published.id, version: { increment: 1 }, updatedBy: admin.id },
      });
      await tx.examOperationAuditLog.create({
        data: {
          operationStateId: nextState.id,
          examId: exam.id,
          previousPhase: currentState!.phase,
          nextPhase: nextState.phase,
          previousCampaignId: currentState!.activeCampaignId,
          nextCampaignId: published.id,
          beforeSnapshot: json(before),
          afterSnapshot: json({
            phase: nextState.phase,
            activeCampaignId: published.id,
            featureOverrides: nextState.featureOverrides,
            version: nextState.version,
          }),
          changedBy: admin.id,
          note: "기존 운영 경찰 랜딩을 HTML/CSS 캠페인으로 이전",
        },
      });
      return published;
    });

    console.log(JSON.stringify({
      recovered: true,
      campaignId: campaign.id,
      examId: exam.id,
      status: campaign.status,
      htmlLength: htmlDocument.length,
      published: publishAndActivate,
      active: publishAndActivate,
      target: target.hosted ? "hosted" : "local",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
