import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, SubmissionSuspicionStatus } from "@prisma/client";
import { chromium, type Page } from "playwright";

type Tenant = {
  type: "police" | "fire";
  schema: "score_predict_police" | "score_predict_fire";
  baseUrl: string;
};

const APP_DIR = process.cwd();
const TENANTS: Tenant[] = [
  { type: "police", schema: "score_predict_police", baseUrl: "http://police.localhost:3200" },
  { type: "fire", schema: "score_predict_fire", baseUrl: "http://fire.localhost:3200" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadLocalEnv() {
  const source = readFileSync(path.join(APP_DIR, ".env.docker.local"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function tenantDatabaseUrl(schema: Tenant["schema"]) {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(raw, "DIRECT_URL or DATABASE_URL is required.");
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    `Refusing non-local database host ${url.hostname}.`
  );
  assert(url.port === "54332", `Refusing unexpected database port ${url.port}.`);
  if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function loginAdmin(page: Page, tenant: Tenant) {
  await page.goto(`${tenant.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const username = "010-0000-0000";
  const password = tenant.type === "police" ? "PoliceAdmin!123" : "FireAdmin!123";
  const result = await page.evaluate(async ({ username, password }) => {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken ?? "",
      callbackUrl: window.location.origin,
      username,
      phone: username,
      password,
      json: "true",
    });
    const response = await fetch("/api/auth/callback/credentials?json=true", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = (await sessionResponse.json()) as { user?: { role?: string } };
    return { status: response.status, role: session.user?.role };
  }, { username, password });
  assert(
    result.status === 200 && result.role === "ADMIN",
    `${tenant.type}: admin login failed (status=${result.status}, role=${result.role ?? "none"}).`
  );
  await page.goto(`${tenant.baseUrl}/admin/submissions`, { waitUntil: "domcontentloaded" });
}

async function fetchJson(
  page: Page,
  pathname: string,
  options: { method?: "GET" | "PATCH"; body?: Record<string, unknown> } = {}
) {
  return page.evaluate(async ({ pathname, method, body }) => {
    const response = await fetch(pathname, {
      method,
      cache: "no-store",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { pathname, method: options.method ?? "GET", body: options.body });
}

function asRecord(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Expected JSON object.");
  return value as Record<string, unknown>;
}

async function verifyTenant(page: Page, tenant: Tenant) {
  const db = new PrismaClient({ datasources: { db: { url: tenantDatabaseUrl(tenant.schema) } } });
  const startedAt = new Date();
  let target: {
    id: number;
    isSuspicious: boolean;
    suspiciousReason: string | null;
    suspicionStatus: SubmissionSuspicionStatus;
    suspicionAutoReason: string | null;
    suspicionManualDecision: boolean;
    suspicionReviewNote: string | null;
    suspicionReviewedAt: Date | null;
  } | null = null;
  try {
    target = await db.submission.findFirst({
      where: {
        isSuspicious: true,
        scoringStatus: "SCORED",
        subjectScores: { some: {}, none: { isFailed: true } },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        isSuspicious: true,
        suspiciousReason: true,
        suspicionStatus: true,
        suspicionAutoReason: true,
        suspicionManualDecision: true,
        suspicionReviewNote: true,
        suspicionReviewedAt: true,
      },
    });
    assert(target, `${tenant.type}: suspicious local fixture missing.`);

    await loginAdmin(page, tenant);

    const clearResponse = await fetchJson(page, `/api/admin/submissions?id=${target.id}`, {
      method: "PATCH",
      body: { decision: "CLEAR", note: "E2E 정상 확인" },
    });
    assert(clearResponse.status === 200, `${tenant.type}: admin clear failed.`);

    const cleared = await db.submission.findUnique({
      where: { id: target.id },
      select: { isSuspicious: true, suspicionStatus: true, suspicionManualDecision: true },
    });
    assert(cleared?.isSuspicious === false, `${tenant.type}: clear did not restore statistics.`);
    assert(cleared.suspicionStatus === SubmissionSuspicionStatus.CLEAR, `${tenant.type}: clear status mismatch.`);
    assert(cleared.suspicionManualDecision, `${tenant.type}: manual decision was not persisted.`);

    const excludeResponse = await fetchJson(page, `/api/admin/submissions?id=${target.id}`, {
      method: "PATCH",
      body: { decision: "EXCLUDE", note: "E2E 통계 제외" },
    });
    assert(excludeResponse.status === 200, `${tenant.type}: admin exclusion failed.`);

    const resultResponse = await fetchJson(page, `/api/result?submissionId=${target.id}`);
    assert(resultResponse.status === 200, `${tenant.type}: excluded score result must remain available.`);
    const resultBody = asRecord(resultResponse.body);
    const submission = asRecord(resultBody.submission);
    const participantStatus = asRecord(resultBody.participantStatus);
    const statistics = asRecord(resultBody.statistics);
    assert(submission.rankingWithheld === true, `${tenant.type}: rankingWithheld must be true.`);
    assert(participantStatus.currentRank === null, `${tenant.type}: participant rank must be null.`);
    assert(statistics.totalRank === null, `${tenant.type}: statistics rank must be null.`);

    const predictionResponse = await fetchJson(page, `/api/prediction?submissionId=${target.id}`);
    assert(predictionResponse.status === 400, `${tenant.type}: excluded prediction must be blocked.`);

    const shareResponse = await fetchJson(page, `/api/share/data?submissionId=${target.id}`);
    assert(shareResponse.status === 409, `${tenant.type}: excluded result sharing must be blocked.`);

    console.log(`[PASS] ${tenant.type}: admin review, result withholding, prediction and sharing guards`);

  } finally {
    if (target) {
      await db.submission.update({
        where: { id: target.id },
        data: {
          isSuspicious: target.isSuspicious,
          suspiciousReason: target.suspiciousReason,
          suspicionStatus: target.suspicionStatus,
          suspicionAutoReason: target.suspicionAutoReason,
          suspicionManualDecision: target.suspicionManualDecision,
          suspicionReviewNote: target.suspicionReviewNote,
          suspicionReviewedAt: target.suspicionReviewedAt,
        },
      });
      await db.submissionLog.deleteMany({
        where: {
          submissionId: target.id,
          action: { in: ["SUSPICION_CLEAR", "SUSPICION_EXCLUDE"] },
          createdAt: { gte: startedAt },
        },
      });
    }
    await db.$disconnect();
  }
}

async function main() {
  loadLocalEnv();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const tenant of TENANTS) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await verifyTenant(page, tenant);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log("submission-suspicion-e2e: passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
