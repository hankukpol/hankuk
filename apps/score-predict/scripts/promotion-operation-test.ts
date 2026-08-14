import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamOperationPhase, Prisma, PrismaClient, PromotionCampaignStatus, Role } from "@prisma/client";
import { buildLegacyOperationMigration, normalizeOperationOverrides, OPERATION_PRESETS, overlayOperationSettings, resolveOperationFeatures } from "../src/lib/exam-operation";
import { isPublicExamPagePath } from "../src/lib/exam-surface";
import { sanitizeCustomHtmlDocument } from "../src/lib/promotions/custom-html";
import {
  CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
  CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION,
  DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT,
  getPromotionTemplatesForTenant,
} from "../src/lib/promotions/template-registry";
import { SITE_SETTING_DEFAULTS } from "../src/lib/site-settings.constants";

const ROLLBACK = Symbol("ROLLBACK");

function loadLocalEnv() {
  const source = readFileSync(path.join(process.cwd(), ".env.docker.local"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function withSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function verifyTenant(baseUrl: string, tenantType: "police" | "fire", schema: string) {
  const db = new PrismaClient({ datasources: { db: { url: withSchema(baseUrl, schema) } }, log: ["error"] });
  try {
    const schemaName = await db.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
    assert.equal(schemaName[0]?.schema, schema);
    const before = { users: await db.user.count(), submissions: await db.submission.count(), campaigns: await db.promotionCampaign.count() };
    try {
      await db.$transaction(async (tx) => {
        const active = await tx.exam.findMany({ where: { isActive: true }, select: { id: true } });
        assert.equal(active.length, 1, `${tenantType}: active exam count`);
        const admin = await tx.user.findFirst({ where: { role: Role.ADMIN }, select: { id: true } });
        assert.ok(admin, `${tenantType}: admin required`);
        const marker = `qa-${tenantType}-${Date.now()}`;
        const campaign = await tx.promotionCampaign.create({ data: { tenantType, examId: active[0].id, name: marker, templateKey: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY, templateVersion: CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION, draftContent: json(DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT), publishedContent: json(DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT), publishedVersion: 1, status: PromotionCampaignStatus.PUBLISHED, createdBy: admin.id, updatedBy: admin.id, publishedBy: admin.id, publishedAt: new Date() } });
        await tx.promotionCampaignRevision.create({ data: { campaignId: campaign.id, version: 1, content: json(DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT), createdBy: admin.id } });
        const current = await tx.examOperationState.findUnique({ where: { examId: active[0].id } });
        assert.ok(current, `${tenantType}: backfilled state required`);
        const changed = await tx.examOperationState.update({ where: { examId: active[0].id }, data: { phase: ExamOperationPhase.SCORING_OPEN, activeCampaignId: campaign.id, featureOverrides: { comments: true }, version: { increment: 1 }, updatedBy: admin.id } });
        assert.equal(changed.activeCampaignId, campaign.id);
        assert.equal(resolveOperationFeatures(changed.phase, changed.featureOverrides).comments, true);
        assert.equal(await tx.user.count(), before.users);
        assert.equal(await tx.submission.count(), before.submissions);
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }
    assert.deepEqual({ users: await db.user.count(), submissions: await db.submission.count(), campaigns: await db.promotionCampaign.count() }, before, `${tenantType}: rollback must preserve baseline`);
    return { tenantType, schema, ...before };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  loadLocalEnv();
  assert.deepEqual(OPERATION_PRESETS.PRE_REGISTRATION, { preRegistration: true, answerInput: false, result: false, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true });
  assert.deepEqual(OPERATION_PRESETS.SCORING_OPEN, { preRegistration: false, answerInput: true, result: true, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true });
  assert.deepEqual(OPERATION_PRESETS.ANALYSIS_OPEN, { preRegistration: false, answerInput: true, result: true, analysis: true, finalPrediction: false, comments: false, notices: true, faq: true });
  assert.deepEqual(OPERATION_PRESETS.FINAL_OPEN, { preRegistration: false, answerInput: false, result: true, analysis: true, finalPrediction: true, comments: false, notices: true, faq: true });
  assert.deepEqual(OPERATION_PRESETS.CLOSED, { preRegistration: false, answerInput: false, result: false, analysis: false, finalPrediction: false, comments: false, notices: true, faq: true });
  assert.equal(isPublicExamPagePath("/exam/notices"), true);
  assert.equal(isPublicExamPagePath("/exam/faq/"), true);
  assert.equal(isPublicExamPagePath("/police/exam/notices"), true);
  assert.equal(isPublicExamPagePath("/fire/exam/faq"), true);
  assert.equal(isPublicExamPagePath("/exam/input"), false);
  assert.equal(isPublicExamPagePath("/api/notices"), false);
  assert.deepEqual(normalizeOperationOverrides({ comments: true, policePredictionGradesEnabled: true, unknown: true }), { comments: true });
  const effective = overlayOperationSettings(SITE_SETTING_DEFAULTS, OPERATION_PRESETS.PRE_REGISTRATION);
  assert.equal(effective["site.answerInputEnabled"], false);
  assert.equal(effective["site.policePredictionGradesEnabled"], false);

  const legacySettings = {
    ...SITE_SETTING_DEFAULTS,
    "site.preRegistrationEnabled": true,
    "site.answerInputEnabled": false,
    "site.tabResultEnabled": true,
    "site.tabPredictionEnabled": false,
    "site.finalPredictionEnabled": false,
    "site.commentsEnabled": true,
    "site.tabNoticesEnabled": false,
    "site.tabFaqEnabled": true,
  };
  const legacyMigration = buildLegacyOperationMigration(legacySettings);
  assert.equal(legacyMigration.phase, ExamOperationPhase.PRE_REGISTRATION);
  assert.deepEqual(
    resolveOperationFeatures(legacyMigration.phase, legacyMigration.featureOverrides),
    legacyMigration.features,
    "백필 후 공개 기능은 기존 사이트 설정과 정확히 같아야 한다",
  );
  assert.deepEqual(legacyMigration.featureOverrides, {
    result: true,
    comments: true,
    notices: false,
  });

  const sanitizedCustomHtml = sanitizeCustomHtmlDocument(`
    <base href="https://daegu.koreapolice.co.kr/">
    <link rel="stylesheet" href="/landing/css/2214.css">
    <style>.hero{background-image:url('../images/background.webp')}</style>
    <main onclick="alert(1)">
      <img src="/landing/images/hero.webp" onerror="alert(2)" alt="히어로">
      <a href="#pre-registration">사전등록</a>
      <script>alert(3)</script>
      <iframe src="https://unsafe.example.com"></iframe>
      <form action="https://unsafe.example.com"><button>전송</button></form>
    </main>
  `);
  assert.match(sanitizedCustomHtml, /https:\/\/daegu\.koreapolice\.co\.kr\/landing\/css\/2214\.css/);
  assert.match(sanitizedCustomHtml, /https:\/\/daegu\.koreapolice\.co\.kr\/landing\/images\/hero\.webp/);
  assert.match(sanitizedCustomHtml, /https:\/\/daegu\.koreapolice\.co\.kr\/images\/background\.webp/);
  assert.match(sanitizedCustomHtml, /href="#pre-registration"/);
  assert.doesNotMatch(sanitizedCustomHtml, /<script|<iframe|<form|onclick|onerror/i);
  assert.deepEqual(getPromotionTemplatesForTenant("police").map((item) => item.key), [CUSTOM_HTML_PROMOTION_TEMPLATE_KEY]);
  assert.deepEqual(getPromotionTemplatesForTenant("fire").map((item) => item.key), [CUSTOM_HTML_PROMOTION_TEMPLATE_KEY]);

  const baseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(baseUrl, "DIRECT_URL or DATABASE_URL is required");
  const parsed = new URL(baseUrl);
  assert.ok(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(parsed.hostname) && parsed.port === "54332",
    `Refusing non-local promotion test database ${parsed.hostname}:${parsed.port}`,
  );
  if (parsed.hostname === "host.docker.internal") parsed.hostname = "127.0.0.1";
  const results = [];
  results.push(await verifyTenant(parsed.toString(), "police", "score_predict_police"));
  results.push(await verifyTenant(parsed.toString(), "fire", "score_predict_fire"));
  assert.notEqual(results[0].schema, results[1].schema);
  console.log(JSON.stringify({ passed: true, results }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
