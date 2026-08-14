import { Prisma, PrismaClient, Role } from "@prisma/client";
import { buildLegacyOperationMigration } from "../src/lib/exam-operation";
import { getTenantSiteSettingDefaults } from "../src/lib/site-settings.defaults";
import type { SiteSettingKey } from "../src/lib/site-settings.constants";
import { loadRuntimeEnvFile } from "./lib/load-runtime-env";

const TENANTS = [
  { type: "police", schema: "score_predict_police" },
  { type: "fire", schema: "score_predict_fire" },
] as const;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertHostedConfirmation(rawUrl: string) {
  const url = new URL(rawUrl);
  if (LOCAL_HOSTS.has(url.hostname)) return;
  const projectRef = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1];
  assert(projectRef, "Supabase project ref를 확인할 수 없습니다.");
  assert(process.env.PROMOTION_BACKFILL_CONFIRM === `BACKFILL_PROMOTIONS_${projectRef}`, `PROMOTION_BACKFILL_CONFIRM must equal BACKFILL_PROMOTIONS_${projectRef}.`);
}

const OPERATION_SETTING_KEYS = [
  "site.preRegistrationEnabled",
  "site.answerInputEnabled",
  "site.tabResultEnabled",
  "site.tabPredictionEnabled",
  "site.finalPredictionEnabled",
  "site.commentsEnabled",
  "site.tabNoticesEnabled",
  "site.tabFaqEnabled",
] as const satisfies readonly SiteSettingKey[];

function readLegacySettings(
  rows: Array<{ key: string; value: string }>,
  tenantType: "police" | "fire",
) {
  const settings = getTenantSiteSettingDefaults(tenantType);
  const rowMap = new Map(rows.map((row) => [row.key, row.value]));

  for (const key of OPERATION_SETTING_KEYS) {
    const raw = rowMap.get(`${tenantType}::${key}`) ?? rowMap.get(key);
    if (raw !== undefined) settings[key] = raw.trim().toLowerCase() === "true";
  }

  return settings;
}

async function backfillTenant(baseUrl: string, tenant: (typeof TENANTS)[number]) {
  const db = new PrismaClient({ datasources: { db: { url: withSchema(baseUrl, tenant.schema) } }, log: ["error"] });
  try {
    const activeExams = await db.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    assert(activeExams.length === 1, `${tenant.schema}: 활성 시험이 ${activeExams.length}개입니다.`);
    const exam = activeExams[0];
    const existingState = await db.examOperationState.findUnique({ where: { examId: exam.id } });
    if (existingState) return { tenant: tenant.type, examId: exam.id, state: "already-exists", campaignId: existingState.activeCampaignId };
    const settingNames = OPERATION_SETTING_KEYS.flatMap((key) => [key, `${tenant.type}::${key}`]);
    const [settingRows, admin] = await Promise.all([
      db.siteSetting.findMany({ where: { key: { in: settingNames } }, select: { key: true, value: true } }),
      db.user.findFirst({ where: { role: Role.ADMIN }, orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    const legacy = buildLegacyOperationMigration(readLegacySettings(settingRows, tenant.type));
    const result = await db.$transaction(async (tx) => {
      const campaignId: number | null = null;
      const overrides = json(legacy.featureOverrides);
      const state = await tx.examOperationState.create({ data: { examId: exam.id, phase: legacy.phase, activeCampaignId: campaignId, featureOverrides: overrides, version: 1, updatedBy: admin?.id ?? null } });
      if (admin) await tx.examOperationAuditLog.create({ data: { operationStateId: state.id, examId: exam.id, previousPhase: null, nextPhase: legacy.phase, previousCampaignId: null, nextCampaignId: campaignId, afterSnapshot: json({ phase: legacy.phase, activeCampaignId: campaignId, featureOverrides: legacy.featureOverrides, features: legacy.features, version: 1 }), changedBy: admin.id, note: "기존 운영 설정과 공개 기능을 그대로 보존한 백필" } });
      return { tenant: tenant.type, examId: exam.id, state: legacy.phase, campaignId, features: legacy.features, featureOverrides: legacy.featureOverrides };
    });
    return result;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  loadRuntimeEnvFile();
  const baseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(baseUrl, "DIRECT_URL 또는 DATABASE_URL이 필요합니다.");
  assertHostedConfirmation(baseUrl);
  const results = [];
  for (const tenant of TENANTS) results.push(await backfillTenant(baseUrl, tenant));
  console.log(JSON.stringify({ success: true, results }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
