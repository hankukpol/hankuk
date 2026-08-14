import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BonusType,
  ExamOperationPhase,
  ExamType,
  Gender,
  Prisma,
  PrismaClient,
  Role,
  SubmissionScoringStatus,
} from "@prisma/client";
import { deleteUploadedFileByPublicUrl } from "../src/lib/upload";
import { SITE_SETTINGS_SECTIONS } from "../src/app/admin/site/_lib/site-settings-sections";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

type TenantType = "police" | "fire";
type TenantCase = {
  type: TenantType;
  baseUrl: string;
  schema: string;
  adminIdentity: string;
  adminPassword: string;
  expectedAccent: string;
};
type Check = { tenant: TenantType | "shared"; name: string; detail: string };
type PageResponse<T = unknown> = {
  status: number;
  ok: boolean;
  body: T | null;
  text: string;
  contentDisposition: string | null;
};
type TenantBaseline = {
  activeExamId: number;
  activeExamName: string;
  operationState: {
    id: number;
    phase: ExamOperationPhase;
    activeCampaignId: number | null;
    featureOverrides: Prisma.JsonValue | null;
    version: number;
    updatedBy: number | null;
    updatedAt: Date;
  };
  operationAuditMaxId: number;
  settings: Record<string, unknown>;
  userCount: number;
  originalSubmissionFingerprint: string;
  originalAnswerKeyCount: number;
  originalPreRegistrationCount: number;
};
type TenantOperationState = {
  examId: number;
  examName: string;
  seedUserName: string;
  plainUserName: string;
};

const APP_DIR = process.cwd();
const RUN_ID = String(Date.now()).slice(-8);
const PREFIX = `관리자AtoZ-${RUN_ID}`;
const REQUESTED_TENANT = process.argv[2] === "police" || process.argv[2] === "fire"
  ? process.argv[2] as TenantType
  : null;
const EVIDENCE_ROOT = path.join(
  APP_DIR,
  `.superloopy/evidence/frontend/20260809-admin-workflow${REQUESTED_TENANT ? `-${REQUESTED_TENANT}` : ""}`
);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, "screenshots");
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
  "base64"
);

const TENANTS: TenantCase[] = [
  {
    type: "police",
    baseUrl: "http://police.localhost:3200",
    schema: "score_predict_police",
    adminIdentity: "010-0000-0000",
    adminPassword: "PoliceAdmin!123",
    expectedAccent: "rgb(37, 99, 235)",
  },
  {
    type: "fire",
    baseUrl: "http://fire.localhost:3200",
    schema: "score_predict_fire",
    adminIdentity: "010-0000-0000",
    adminPassword: "FireAdmin!123",
    expectedAccent: "rgb(220, 38, 38)",
  },
];
const RUN_TENANTS = REQUESTED_TENANT
  ? TENANTS.filter((tenant) => tenant.type === REQUESTED_TENANT)
  : TENANTS;

const checks: Check[] = [];
const runtimeErrors: string[] = [];
const screenshots: string[] = [];
const uploadedUrls: Record<TenantType, Set<string>> = {
  police: new Set<string>(),
  fire: new Set<string>(),
};
const authCookieHeaders = new Map<TenantType, string>();

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
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^[\"']|[\"']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function databaseUrl(schema: string) {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(raw, "DIRECT_URL or DATABASE_URL is required.");
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    `Refusing admin workflow test against non-local DB host ${url.hostname}.`
  );
  assert(url.port === "54332", `Unexpected local DB port ${url.port}.`);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function record(tenant: TenantType | "shared", name: string, detail: string) {
  checks.push({ tenant, name, detail });
  console.log(`[PASS] [${tenant}] ${name}: ${detail}`);
}

function attachDiagnostics(page: Page, scope: string) {
  page.on("pageerror", (error) =>
    runtimeErrors.push(`${scope} pageerror at ${page.url()}: ${error.message}`)
  );
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (
      (text.includes("[next-auth][error][CLIENT_FETCH_ERROR]") && text.includes("Failed to fetch")) ||
      (text.includes("Failed to load resource") &&
        (text.includes("409 (Conflict)") || text.includes("400 (Bad Request)")))
    ) {
      return;
    }
    runtimeErrors.push(`${scope} console.error: ${text}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      runtimeErrors.push(`${scope} response ${response.status()}: ${response.url()}`);
    }
  });
  page.on("dialog", async (dialog) => dialog.accept());
}

async function assertNoHorizontalScroll(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert(
    metrics.content <= metrics.viewport + 1,
    `${label} horizontal scroll ${metrics.content}px > ${metrics.viewport}px.`
  );
}

async function capture(page: Page, tenant: TenantType, name: string) {
  await assertNoHorizontalScroll(page, `${tenant}-${name}`);
  const filename = `${tenant}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
  screenshots.push(filename);
}

async function confirmModal(page: Page, confirmLabel = "확인") {
  const dialog = page.getByRole("dialog");
  try {
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
    console.error(`[DEBUG] confirm modal missing URL=${page.url()} BODY=${bodyText.slice(0, 2000)}`);
    throw error;
  }
  const button = dialog.getByRole("button", { name: confirmLabel, exact: true });
  // 모달이 사이드바/페이지 전환 애니메이션과 겹쳐도 실제 DOM 버튼 이벤트를 한 번만 보낸다.
  await button.evaluate((element) => (element as HTMLButtonElement).click());
}

async function gotoLocal(page: Page, url: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      if (response) {
        // Next.js App Router의 스트리밍 문서가 수화되기 전에 다음 전체 문서
        // 이동을 시작하면, 실제 화면과 무관한 중단 시점 hydration 오류가 남는다.
        // load 이후 한 프레임을 보장해 각 관리자 화면을 독립적으로 검증한다.
        await page.waitForLoadState("load");
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        );
        return response;
      }
      lastError = new Error(`Navigation completed without a document response: ${url}`);
      if (attempt === 3) throw lastError;
      await page.waitForTimeout(1_000 * attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|Timeout/i.test(message) || attempt === 3) {
        throw error;
      }
      await page.waitForTimeout(1_000 * attempt);
    }
  }
  throw lastError;
}

async function pageRequest<T = unknown>(
  page: Page,
  pathname: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<PageResponse<T>> {
  return page.evaluate(
    async ({ requestPath, requestOptions }) => {
      const response = await fetch(requestPath, {
        method: requestOptions.method ?? "GET",
        cache: "no-store",
        headers: {
          ...(requestOptions.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(requestOptions.headers ?? {}),
        },
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body),
      });
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return {
        status: response.status,
        ok: response.ok,
        body,
        text,
        contentDisposition: response.headers.get("content-disposition"),
      };
    },
    { requestPath: pathname, requestOptions: options }
  ) as Promise<PageResponse<T>>;
}

async function nodeTenantRequest(
  page: Page,
  tenant: TenantCase,
  pathname: string,
  init: RequestInit = {}
) {
  const cookieHeader = (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  return fetch(`http://127.0.0.1:3200${pathname}`, {
    ...init,
    headers: {
      Cookie: cookieHeader,
      "x-forwarded-host": new URL(tenant.baseUrl).host,
      ...(init.headers ?? {}),
    },
  });
}

async function nodeTenantPageResponse<T = unknown>(
  tenant: TenantCase,
  cookieHeader: string,
  pathname: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<PageResponse<T>> {
  const response = await fetch(`http://127.0.0.1:3200${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      Cookie: cookieHeader,
      "x-forwarded-host": new URL(tenant.baseUrl).host,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
    text,
    contentDisposition: response.headers.get("content-disposition"),
  };
}

function serializeRows(value: unknown): string {
  return JSON.stringify(value);
}

async function captureBaseline(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient
): Promise<TenantBaseline> {
  const activeExams = await prisma.exam.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  assert(activeExams.length === 1, `${tenant.type}: expected exactly one active exam.`);
  const activeExam = activeExams[0];
  const [operationState, latestOperationAudit] = await Promise.all([
    prisma.examOperationState.findUnique({ where: { examId: activeExam.id } }),
    prisma.examOperationAuditLog.findFirst({
      where: { examId: activeExam.id },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
  ]);
  assert(operationState, `${tenant.type}: active exam operation state is missing.`);
  const settingsResponse = await pageRequest<{ settings?: Record<string, unknown> }>(
    page,
    "/api/admin/site"
  );
  assert(settingsResponse.ok && settingsResponse.body?.settings, `${tenant.type}: settings baseline failed.`);
  const [userCount, submissions, originalAnswerKeyCount, originalPreRegistrationCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.submission.findMany({
        where: { examId: activeExam.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          regionId: true,
          examType: true,
          gender: true,
          examNumber: true,
          totalScore: true,
          finalScore: true,
          scoringStatus: true,
          editCount: true,
          updatedAt: true,
        },
      }),
      prisma.answerKey.count({ where: { examId: activeExam.id } }),
      prisma.preRegistration.count({ where: { examId: activeExam.id } }),
    ]);

  record(
    tenant.type,
    "기존 운영 데이터 기준선",
    `${activeExam.name}, 회원 ${userCount}명, 제출 ${submissions.length}건`
  );
  return {
    activeExamId: activeExam.id,
    activeExamName: activeExam.name,
    operationState: {
      id: operationState.id,
      phase: operationState.phase,
      activeCampaignId: operationState.activeCampaignId,
      featureOverrides: operationState.featureOverrides,
      version: operationState.version,
      updatedBy: operationState.updatedBy,
      updatedAt: operationState.updatedAt,
    },
    operationAuditMaxId: latestOperationAudit?.id ?? 0,
    settings: settingsResponse.body.settings,
    userCount,
    originalSubmissionFingerprint: serializeRows(submissions),
    originalAnswerKeyCount,
    originalPreRegistrationCount,
  };
}

async function loginAdmin(context: BrowserContext, tenant: TenantCase) {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  page.setDefaultTimeout(30_000);
  attachDiagnostics(page, `${tenant.type}-login`);
  await gotoLocal(page, `${tenant.baseUrl}/admin-login`);
  await page.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector);
      return Boolean(
        element &&
          Object.keys(element).some(
            (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")
          )
      );
    },
    "#username",
    { timeout: 30_000 }
  );
  if (tenant.type === "police") {
    await page.locator("#username").fill(tenant.adminIdentity);
  } else {
    const phone = page.locator("#phone");
    if (await phone.count()) {
      await phone.fill(tenant.adminIdentity);
    } else {
      await page.locator("#username").fill(tenant.adminIdentity);
    }
  }
  await page.locator("#password").fill(tenant.adminPassword);
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  try {
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
  } catch (error) {
    const sessionAfterSubmit = await page.evaluate(async () =>
      (await (await fetch("/api/auth/session", { cache: "no-store" })).json()) as {
        user?: { role?: string; tenantType?: string };
      }
    );
    if (
      sessionAfterSubmit.user?.role === "ADMIN" &&
      sessionAfterSubmit.user.tenantType === tenant.type
    ) {
      await gotoLocal(page, `${tenant.baseUrl}/admin`);
    } else {
    const cookies = await context.cookies();
    const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
    console.error(
      `[DEBUG] ${tenant.type} login timeout URL=${page.url()} COOKIES=${JSON.stringify(cookies.map((cookie) => ({ name: cookie.name, domain: cookie.domain, secure: cookie.secure })))} BODY=${bodyText.slice(0, 1200)}`
    );
    throw error;
    }
  }
  const authenticatedSession = await page.evaluate(async () =>
    (await (await fetch("/api/auth/session", { cache: "no-store" })).json()) as {
      user?: { role?: string; tenantType?: string };
    }
  );
  if (authenticatedSession.user?.tenantType !== tenant.type) {
    const cookies = await context.cookies();
    const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
    console.error(
      `[DEBUG] ${tenant.type} post-login URL=${page.url()} SESSION=${JSON.stringify(authenticatedSession)} COOKIES=${JSON.stringify(cookies.map((cookie) => ({ name: cookie.name, domain: cookie.domain, path: cookie.path, secure: cookie.secure })))} BODY=${bodyText.slice(0, 1200)}`
    );
  }
  assert(
    authenticatedSession.user?.tenantType === tenant.type,
    `${tenant.type} login issued a ${authenticatedSession.user?.tenantType ?? "missing"} session.`
  );
  try {
    await page.getByRole("heading", { name: "관리자 대시보드", exact: true }).waitFor({ timeout: 60_000 });
  } catch (error) {
    const debugPath = path.join(SCREENSHOT_DIR, `${tenant.type}-debug-admin-login.png`);
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => undefined);
    const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
    console.error(`[DEBUG] ${tenant.type} admin URL=${page.url()} BODY=${bodyText.slice(0, 2000)}`);
    throw error;
  }
  const session = await page.evaluate(async () =>
    (await (await fetch("/api/auth/session", { cache: "no-store" })).json()) as {
      user?: { role?: string; tenantType?: string };
    }
  );
  assert(session.user?.role === "ADMIN", `${tenant.type} admin role missing.`);
  assert(session.user?.tenantType === tenant.type, `${tenant.type} session tenant mismatch.`);
  record(tenant.type, "관리자 로그인", `role=ADMIN, tenant=${session.user.tenantType}`);
  return page;
}

async function verifyAdminPages(page: Page, tenant: TenantCase) {
  const pages = [
    ["/admin", "관리자 대시보드"],
    ["/admin/exams", "시험 관리"],
    ["/admin/answers", "정답 관리"],
    ["/admin/regions", tenant.type === "police" ? "경찰 지역 및 모집인원 관리" : "지역/모집인원 관리"],
    ["/admin/pass-cut", "합격컷 발표 관리"],
    ...(tenant.type === "police" ? [["/admin/pre-registrations", "사전등록 관리"]] : []),
    ["/admin/submissions", "제출 현황"],
    ["/admin/stats", "참여 통계"],
    ["/admin/visitors", "방문자 통계"],
    ["/admin/users", "사용자 관리"],
    ["/admin/comments", "댓글 관리"],
    ["/admin/promotions", "프로모션 관리"],
    ["/admin/banners", "배너 관리"],
    ["/admin/events", "이벤트 관리"],
    ["/admin/notices", "공지사항 게시판 관리"],
    ["/admin/faqs", "FAQ 관리"],
    ["/admin/site", "사이트 설정 허브"],
    ["/admin/site/basic", "기본 설정"],
    ["/admin/site/policies", "정책 관리"],
    ["/admin/site/visibility", "잠금 안내 설정"],
    ["/admin/site/features", "기능 설정"],
    ["/admin/site/operations", "운영 설정"],
    ["/admin/site/auto-pass-cut", "자동 합격컷 설정"],
    ["/admin/mock-data", "목업 데이터 관리"],
  ] as const;

  let opened = 0;
  for (const [pathname, heading] of pages) {
    console.log(`[CHECK] [${tenant.type}] ${pathname}`);
    const response = await gotoLocal(page, `${tenant.baseUrl}${pathname}`);
    assert(response?.status() === 200, `${tenant.type} ${pathname} returned ${response?.status()}.`);
    assert(!page.url().includes("/login"), `${tenant.type} ${pathname} redirected to login.`);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 20_000 });
    opened += 1;
  }
  record(tenant.type, "관리자 전체 메뉴 접근", `${opened}개 화면 200 및 제목 확인`);
}

async function exercisePromotionCampaignCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const list = await pageRequest<{
    operationState?: { activeCampaignId?: number | null } | null;
  }>(page, "/api/admin/promotions");
  assert(list.ok, `${tenant.type}: promotion list failed.`);

  const campaignName = `${PREFIX}-${tenant.type}-프로모션`;
  const created = await pageRequest<{ campaign?: { id: number; updatedAt: string; draftContent: Record<string, unknown> } }>(
    page,
    "/api/admin/promotions",
    { method: "POST", body: { name: campaignName, templateKey: "custom-html-v1" } },
  );
  assert(created.status === 201 && created.body?.campaign, `${tenant.type}: promotion create failed: ${created.text}`);
  const draft = structuredClone(created.body.campaign.draftContent);
  draft.htmlDocument = `<main><h1>${PREFIX} 임시저장 제목</h1></main>`;

  const saved = await pageRequest<{ campaign?: { id: number; updatedAt: string; publishedContent: unknown } }>(
    page,
    "/api/admin/promotions",
    {
      method: "PUT",
      body: {
        id: created.body.campaign.id,
        action: "SAVE",
        expectedUpdatedAt: created.body.campaign.updatedAt,
        name: campaignName,
        content: draft,
      },
    },
  );
  assert(saved.ok && saved.body?.campaign?.publishedContent === null, `${tenant.type}: draft save leaked to published content: ${saved.text}`);

  const staleSave = await pageRequest(page, "/api/admin/promotions", {
    method: "PUT",
    body: {
      id: created.body.campaign.id,
      action: "SAVE",
      expectedUpdatedAt: created.body.campaign.updatedAt,
      name: campaignName,
      content: draft,
    },
  });
  assert(staleSave.status === 409, `${tenant.type}: stale campaign edit returned ${staleSave.status}.`);

  const published = await pageRequest<{ campaign?: { id: number; publishedVersion: number } }>(
    page,
    "/api/admin/promotions",
    {
      method: "PUT",
      body: {
        id: created.body.campaign.id,
        action: "PUBLISH",
        expectedUpdatedAt: saved.body?.campaign?.updatedAt,
      },
    },
  );
  assert(published.ok && published.body?.campaign?.publishedVersion === 1, `${tenant.type}: promotion publish failed: ${published.text}`);
  const persisted = await prisma.promotionCampaign.findUnique({
    where: { id: created.body.campaign.id },
    include: { revisions: true },
  });
  assert(persisted?.revisions.length === 1, `${tenant.type}: promotion revision snapshot missing.`);
  assert(list.body?.operationState?.activeCampaignId !== persisted.id, `${tenant.type}: publishing an inactive campaign changed the representative landing.`);

  const archived = await pageRequest(page, "/api/admin/promotions", {
    method: "PUT",
    body: { id: persisted.id, action: "ARCHIVE" },
  });
  assert(archived.ok, `${tenant.type}: inactive promotion archive failed: ${archived.text}`);
  record(tenant.type, "프로모션 임시저장·게시·충돌·보관", "임시저장 비공개, 게시 v1 스냅샷, stale 409, 대표 랜딩 불변 확인");
}

async function exerciseExamOperationTransition(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const activeExam = await prisma.exam.findFirst({ where: { isActive: true }, select: { id: true } });
  assert(activeExam, `${tenant.type}: active exam missing for operation transition test.`);
  const baseline = await prisma.examOperationState.findUnique({ where: { examId: activeExam.id } });
  assert(baseline, `${tenant.type}: operation state missing for transition test.`);
  const notePrefix = `${PREFIX}-${tenant.type}-운영단계`;
  const alternatePhase = baseline.phase === ExamOperationPhase.CLOSED
    ? ExamOperationPhase.PRE_REGISTRATION
    : ExamOperationPhase.CLOSED;

  try {
    const changed = await pageRequest<{
      state?: { version: number; phase: ExamOperationPhase };
      features?: { comments?: boolean };
    }>(page, "/api/admin/exam-operation", {
      method: "POST",
      body: {
        phase: alternatePhase,
        activeCampaignId: baseline.activeCampaignId,
        featureOverrides: { comments: true },
        expectedVersion: baseline.version,
        note: `${notePrefix}-전환`,
      },
    });
    assert(
      changed.ok && changed.body?.state?.version === baseline.version + 1 && changed.body.features?.comments === true,
      `${tenant.type}: operation transition failed: ${changed.text}`,
    );

    const stale = await pageRequest(page, "/api/admin/exam-operation", {
      method: "POST",
      body: {
        phase: baseline.phase,
        activeCampaignId: baseline.activeCampaignId,
        featureOverrides: {},
        expectedVersion: baseline.version,
        note: `${notePrefix}-stale`,
      },
    });
    assert(stale.status === 409, `${tenant.type}: stale operation transition returned ${stale.status}.`);

    const restored = await pageRequest<{ state?: { version: number; phase: ExamOperationPhase } }>(
      page,
      "/api/admin/exam-operation",
      {
        method: "POST",
        body: {
          phase: baseline.phase,
          activeCampaignId: baseline.activeCampaignId,
          featureOverrides: baseline.featureOverrides ?? {},
          expectedVersion: changed.body?.state?.version,
          note: `${notePrefix}-복원`,
        },
      },
    );
    assert(restored.ok && restored.body?.state?.phase === baseline.phase, `${tenant.type}: operation restore failed: ${restored.text}`);
    const auditCount = await prisma.examOperationAuditLog.count({
      where: { examId: activeExam.id, note: { startsWith: notePrefix } },
    });
    assert(auditCount === 2, `${tenant.type}: operation audit count ${auditCount}/2.`);
    record(tenant.type, "운영단계 전환·동시수정·감사로그", "프리셋 전환, stale 409, 기존 단계 복원, 감사로그 2건 확인");
  } finally {
    await prisma.$transaction([
      prisma.examOperationAuditLog.deleteMany({
        where: { examId: activeExam.id, note: { startsWith: notePrefix } },
      }),
      prisma.examOperationState.update({
        where: { id: baseline.id },
        data: {
          phase: baseline.phase,
          activeCampaignId: baseline.activeCampaignId,
          featureOverrides: baseline.featureOverrides ?? Prisma.JsonNull,
          version: baseline.version,
          updatedBy: baseline.updatedBy,
          updatedAt: baseline.updatedAt,
        },
      }),
    ]);
  }
}

async function exerciseExamCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const name = `${PREFIX}-${tenant.type}-시험`;
  const editedName = `${name}-수정`;
  const year = tenant.type === "police" ? 2098 : 2097;
  const round = 19;

  await gotoLocal(page, `${tenant.baseUrl}/admin/exams`);
  await page.locator("#exam-name").fill(name);
  await page.locator("#exam-year").fill(String(year));
  await page.locator("#exam-round").fill(String(round));
  await page.locator("#exam-date").fill(`${year}-03-14`);
  await page.getByRole("button", { name: "시험 생성", exact: true }).click();
  await confirmModal(page);
  await page.getByText("시험이 생성되었습니다.", { exact: true }).waitFor();

  const created = await prisma.exam.findUnique({ where: { year_round: { year, round } } });
  assert(created?.name === name && !created.isActive, `${tenant.type} inactive exam creation failed.`);

  const row = page.getByRole("row", { name: new RegExp(`${year}년 ${round}차`) });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("#exam-name").fill(editedName);
  await page.getByRole("button", { name: "시험 수정", exact: true }).click();
  await confirmModal(page);
  await page.getByText("시험 정보가 수정되었습니다.", { exact: true }).waitFor();
  assert(
    (await prisma.exam.findUnique({ where: { id: created.id } }))?.name === editedName,
    `${tenant.type} exam edit was not persisted.`
  );

  const activeExam = await prisma.exam.findFirst({ where: { isActive: true } });
  assert(activeExam, `${tenant.type} active exam missing.`);
  const cookieHeader = (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const protectedDelete = await fetch(
    `http://127.0.0.1:3200/api/admin/exam?feature=exams&id=${activeExam.id}`,
    {
      method: "DELETE",
      headers: {
        Cookie: cookieHeader,
        "x-forwarded-host": new URL(tenant.baseUrl).host,
      },
    }
  );
  assert(protectedDelete.status === 409, `${tenant.type} active exam delete must return 409.`);

  const editedRow = page.getByRole("row", { name: new RegExp(editedName) });
  await editedRow.getByRole("button", { name: "삭제", exact: true }).click();
  await confirmModal(page, "삭제");
  await page.getByText("사용 이력이 없는 비활성 시험을 삭제했습니다.", { exact: true }).waitFor();
  assert(!(await prisma.exam.findUnique({ where: { id: created.id } })), `${tenant.type} exam delete failed.`);
  record(tenant.type, "시험 생성·수정·안전 삭제", "비활성 회차 CRUD 및 활성 회차 삭제 409 보호 확인");
}

async function exerciseNoticeCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const title = `${PREFIX}-${tenant.type}-공지`;
  const edited = `${title}-수정`;
  await gotoLocal(page, `${tenant.baseUrl}/admin/notices`);
  await page.getByRole("heading", { name: "공지사항 게시판 관리", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "새 공지 작성"
    );
    return Boolean(
      button &&
        Object.keys(button).some(
          (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")
        )
    );
  });
  await page.getByRole("button", { name: "새 공지 작성", exact: true }).click();
  await page.locator("#notice-title").waitFor();
  await page.locator("#notice-title").fill(title);
  const codeViewButton = page.locator('[data-command="codeView"]');
  await codeViewButton.click();
  await page.locator("textarea.se-wrapper-code").fill(`<p>${tenant.type} 공개 공지 내용</p>`);
  await codeViewButton.click();
  await page.locator(".sun-editor-editable").waitFor();
  await page.locator("#notice-priority").fill("97");
  await page.getByRole("button", { name: "공지 등록", exact: true }).click();
  await confirmModal(page);
  await page.getByText("공지사항이 등록되었습니다.", { exact: true }).waitFor();
  const created = await prisma.notice.findFirst({ where: { title } });
  assert(created, `${tenant.type} notice create failed.`);

  const row = page.getByRole("row", { name: new RegExp(title) });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("#notice-title").fill(edited);
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await confirmModal(page);
  await page.getByText("공지사항이 수정되었습니다.", { exact: true }).waitFor();

  const publicBody = await page.evaluate(async () =>
    (await (await fetch("/api/notices", { cache: "no-store" })).json()) as {
      notices?: Array<{ title: string }>;
    }
  );
  assert(publicBody.notices?.some((item) => item.title === edited), `${tenant.type} public notice missing.`);
  record(tenant.type, "공지 게시판 작성·수정·공개", edited);
}

async function exerciseFaqCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const question = `${PREFIX}-${tenant.type}-FAQ?`;
  const edited = `${question}-수정`;
  await gotoLocal(page, `${tenant.baseUrl}/admin/faqs`);
  await page.locator("#faq-question").fill(question);
  await page.locator("#faq-answer").fill(`${tenant.type} FAQ 답변`);
  await page.locator("#faq-priority").fill("96");
  await page.getByRole("button", { name: "FAQ 등록", exact: true }).click();
  await confirmModal(page);
  await page.getByText("FAQ가 등록되었습니다.", { exact: true }).waitFor();
  const created = await prisma.faq.findFirst({ where: { question } });
  assert(created, `${tenant.type} faq create failed.`);

  const row = page.getByRole("row", { name: new RegExp(question.replace(/[?]/g, "\\?")) });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("#faq-question").fill(edited);
  await page.getByRole("button", { name: "FAQ 수정", exact: true }).click();
  await confirmModal(page);
  await page.getByText("FAQ가 수정되었습니다.", { exact: true }).waitFor();

  const publicBody = await page.evaluate(async () =>
    (await (await fetch("/api/faqs", { cache: "no-store" })).json()) as {
      faqs?: Array<{ question: string }>;
    }
  );
  assert(publicBody.faqs?.some((item) => item.question === edited), `${tenant.type} public FAQ missing.`);
  record(tenant.type, "FAQ 작성·수정·공개", edited);
}

async function exerciseEventCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const title = `${PREFIX}-${tenant.type}-이벤트`;
  const edited = `${title}-수정`;
  await gotoLocal(page, `${tenant.baseUrl}/admin/events`);
  await page.locator("#event-title").fill(title);
  await page.locator("#event-description").fill(`${tenant.type} 이벤트 설명`);
  await page.locator("#event-link-text").fill("이벤트 확인");
  await page.locator("#event-link-url").fill("/exam/main");
  await page.locator("#event-sort-order").fill("95");
  await page.locator("#event-image").setInputFiles({
    name: `${tenant.type}-event.png`,
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByRole("button", { name: "이벤트 등록", exact: true }).click();
  await confirmModal(page);
  try {
    await page.getByText("이벤트가 등록되었습니다.", { exact: true }).waitFor({ timeout: 20_000 });
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
    console.error(`[DEBUG] ${tenant.type} event create BODY=${bodyText.slice(0, 2000)}`);
    throw error;
  }
  const created = await prisma.eventSection.findFirst({ where: { title } });
  assert(created?.imageUrl, `${tenant.type} event image upload failed.`);
  uploadedUrls[tenant.type].add(created.imageUrl);

  const row = page.getByRole("row", { name: new RegExp(title) });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("#event-title").fill(edited);
  await page.getByRole("button", { name: "이벤트 수정", exact: true }).click();
  await confirmModal(page);
  let eventUpdated = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    eventUpdated = (await prisma.eventSection.findUnique({ where: { id: created.id } }))?.title === edited;
    if (eventUpdated) break;
    await page.waitForTimeout(250);
  }
  assert(eventUpdated, `${tenant.type} event edit failed.`);
  record(tenant.type, "이벤트 작성·이미지 업로드·수정", edited);
}

async function exerciseBannerCrud(page: Page, tenant: TenantCase, prisma: PrismaClient) {
  const marker = `${PREFIX}-${tenant.type}-배너`;
  await gotoLocal(page, `${tenant.baseUrl}/admin/banners`);
  const heroSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "배너존 A: 상단 히어로", exact: true }),
  });
  await heroSection.getByRole("button", { name: "+ 새 배너", exact: true }).click();
  const editor = heroSection.locator(".sun-editor-editable");
  await editor.waitFor({ state: "visible", timeout: 20_000 });
  await editor.click();
  await editor.pressSequentially(`${marker} 관리자 배너 공개 검증`, { delay: 1 });
  await editor.press("Tab");
  await page.waitForTimeout(500);
  await heroSection.locator("#hero-alt-text").fill(marker);
  await heroSection.locator("#hero-mobile-image").setInputFiles({
    name: `${tenant.type}-banner.png`,
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByText("모바일 이미지가 업로드되었습니다. 저장 버튼을 눌러 반영하세요.", { exact: true }).waitFor({ timeout: 20_000 });
  const mobileImageUrl = await heroSection
    .getByAltText("모바일 배너 미리보기", { exact: true })
    .getAttribute("src");
  if (mobileImageUrl) uploadedUrls[tenant.type].add(mobileImageUrl);
  await heroSection.getByRole("button", { name: "저장", exact: true }).click();
  await confirmModal(page);
  await page.getByText("배너존 A: 상단 히어로 저장이 완료되었습니다.", { exact: true }).waitFor();
  const banner = await prisma.banner.findFirst({ where: { altText: marker } });
  assert(banner?.mobileImageUrl && banner.htmlContent?.includes(marker), `${tenant.type} banner save failed.`);

  const publicBody = await page.evaluate(async () =>
    (await (await fetch("/api/banners", { cache: "no-store" })).json()) as {
      banners?: Array<{ altText: string }>;
    }
  );
  assert(publicBody.banners?.some((item) => item.altText === marker), `${tenant.type} public banner missing.`);
  record(tenant.type, "배너 HTML·모바일 이미지 업로드·공개", marker);
}

async function createOperationalExam(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient,
  baseline: TenantBaseline
): Promise<TenantOperationState> {
  const year = tenant.type === "police" ? 2096 : 2095;
  const round = 18;
  const examName = `${PREFIX}-${tenant.type}-운영회차`;
  const createResponse = await pageRequest<{ exam?: { id?: number } }>(page, "/api/admin/exam", {
    method: "POST",
    body: {
      name: examName,
      year,
      round,
      examDate: `${year}-08-22`,
      isActive: false,
      ...(tenant.type === "police"
        ? {
            policeWrittenPassMultiple: 2,
            policePredictionModelVersion: "police-2026-2x-rank-first-v2",
          }
        : {}),
    },
  });
  assert(createResponse.status === 201, `${tenant.type}: operational exam create ${createResponse.status}: ${createResponse.text}`);
  const examId = Number(createResponse.body?.exam?.id);
  assert(Number.isInteger(examId) && examId > 0, `${tenant.type}: operational exam id missing.`);

  const copyResponse = await pageRequest<{ copiedCount?: number }>(page, "/api/admin/regions", {
    method: "POST",
    body: { sourceExamId: baseline.activeExamId, targetExamId: examId },
  });
  assert(copyResponse.ok && Number(copyResponse.body?.copiedCount) > 0, `${tenant.type}: region copy failed: ${copyResponse.text}`);

  const quotas = await prisma.examRegionQuota.findMany({
    where: { examId },
    include: { region: { select: { isActive: true } } },
    orderBy: { regionId: "asc" },
  });
  assert(quotas.length > 0, `${tenant.type}: copied quota rows missing.`);
  const regions = quotas.map((quota) =>
    tenant.type === "police"
      ? {
          regionId: quota.regionId,
          isActive: quota.region.isActive,
          recruitCount: 2,
          recruitCountCareer: 1,
          applicantCount: 12,
          applicantCountCareer: 8,
          examNumberStart: quota.examNumberStart,
          examNumberEnd: quota.examNumberEnd,
          examNumberStartCareer: quota.examNumberStartCareer,
          examNumberEndCareer: quota.examNumberEndCareer,
        }
      : {
          regionId: quota.regionId,
          isActive: quota.region.isActive,
          recruitPublicMale: 1,
          recruitPublicFemale: 1,
          recruitRescue: 1,
          recruitAcademicMale: 1,
          recruitAcademicFemale: 1,
          recruitAcademicCombined: 0,
          recruitEmtMale: 1,
          recruitEmtFemale: 1,
          applicantPublicMale: 6,
          applicantPublicFemale: 6,
          applicantRescue: 6,
          applicantAcademicMale: 6,
          applicantAcademicFemale: 6,
          applicantAcademicCombined: 0,
          applicantEmtMale: 6,
          applicantEmtFemale: 6,
          examNumberStartPublicMale: quota.examNumberStartPublicMale,
          examNumberEndPublicMale: quota.examNumberEndPublicMale,
          examNumberStartPublicFemale: quota.examNumberStartPublicFemale,
          examNumberEndPublicFemale: quota.examNumberEndPublicFemale,
          examNumberStartCareerRescue: quota.examNumberStartCareerRescue,
          examNumberEndCareerRescue: quota.examNumberEndCareerRescue,
          examNumberStartCareerAcademicMale: quota.examNumberStartCareerAcademicMale,
          examNumberEndCareerAcademicMale: quota.examNumberEndCareerAcademicMale,
          examNumberStartCareerAcademicFemale: quota.examNumberStartCareerAcademicFemale,
          examNumberEndCareerAcademicFemale: quota.examNumberEndCareerAcademicFemale,
          examNumberStartCareerAcademicCombined: quota.examNumberStartCareerAcademicCombined,
          examNumberEndCareerAcademicCombined: quota.examNumberEndCareerAcademicCombined,
          examNumberStartCareerEmtMale: quota.examNumberStartCareerEmtMale,
          examNumberEndCareerEmtMale: quota.examNumberEndCareerEmtMale,
          examNumberStartCareerEmtFemale: quota.examNumberStartCareerEmtFemale,
          examNumberEndCareerEmtFemale: quota.examNumberEndCareerEmtFemale,
        }
  );
  const saveRegions = await pageRequest<{ updatedCount?: number }>(page, "/api/admin/regions", {
    method: "PUT",
    body: { examId, regions },
  });
  assert(saveRegions.ok && saveRegions.body?.updatedCount === quotas.length, `${tenant.type}: quota save failed: ${saveRegions.text}`);
  record(tenant.type, "새 회차·지역·모집인원 설정", `${examName}, ${quotas.length}개 지역 복사·저장`);

  return {
    examId,
    examName,
    seedUserName: `${PREFIX}-${tenant.type}-사전등록회원`,
    plainUserName: `${PREFIX}-${tenant.type}-일반회원`,
  };
}

async function buildAnswerCsv(
  prisma: PrismaClient,
  corrected: boolean
): Promise<{ csv: string; questionCount: number }> {
  const subjects = await prisma.subject.findMany({
    where: { examType: ExamType.PUBLIC },
    orderBy: { id: "asc" },
  });
  assert(subjects.length > 0, "PUBLIC subjects missing.");
  const lines = ["과목,문항번호,정답"];
  let globalIndex = 0;
  for (const subject of subjects) {
    for (let questionNumber = 1; questionNumber <= subject.questionCount; questionNumber += 1) {
      globalIndex += 1;
      lines.push(`${subject.name},${questionNumber},${corrected && globalIndex === 1 ? 2 : 1}`);
    }
  }
  return { csv: `\uFEFF${lines.join("\n")}`, questionCount: globalIndex };
}

async function uploadAnswerCsv(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState,
  corrected: boolean
) {
  const answerCsv = await buildAnswerCsv(prisma, corrected);
  await gotoLocal(page, `${tenant.baseUrl}/admin/answers`);
  await page.locator("#exam-select").selectOption(String(operation.examId));
  await page.locator("#exam-type").selectOption(ExamType.PUBLIC);
  const targetLabel = corrected ? "확정답안" : "가답안";
  await page.getByLabel(targetLabel, { exact: true }).check();
  if (corrected) {
    await page.locator("#rescore-reason").fill(`${PREFIX} 1번 정답 정정 및 확정`);
  }
  await page.locator('input[type="file"]').last().setInputFiles({
    name: `${tenant.type}-${corrected ? "confirmed" : "provisional"}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(answerCsv.csv, "utf8"),
  });
  await page.getByRole("button", { name: "CSV 저장", exact: true }).click();
  await confirmModal(page);
  await page.getByText(/CSV (정답 업로드가 완료되었습니다|업로드가 완료되었습니다)/).waitFor({ timeout: 40_000 });
  const storedCount = await prisma.answerKey.count({ where: { examId: operation.examId } });
  assert(storedCount === answerCsv.questionCount, `${tenant.type}: answer key count ${storedCount}/${answerCsv.questionCount}.`);
  record(
    tenant.type,
    corrected ? "확정답안 정정·재채점" : "가답안 CSV 입력",
    `${targetLabel} ${answerCsv.questionCount}문항 저장`
  );
}

async function activateOperationalExam(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState
) {
  await gotoLocal(page, `${tenant.baseUrl}/admin/exams`);
  const row = page.getByRole("row").filter({ hasText: operation.examName });
  await row.getByRole("button", { name: "활성화", exact: true }).click();
  await confirmModal(page);
  await page
    .getByText("시험이 활성화되고 사전 운영 단계로 초기화되었습니다.", { exact: true })
    .waitFor({ timeout: 30_000 });
  const active = await prisma.exam.findMany({ where: { isActive: true }, select: { id: true } });
  assert(active.length === 1 && active[0].id === operation.examId, `${tenant.type}: activation invariant failed.`);
  const settings = await pageRequest<{ settings?: Record<string, unknown> }>(page, "/api/admin/site");
  assert(settings.ok && settings.body?.settings, `${tenant.type}: post-activation settings missing.`);
  assert(settings.body.settings["site.answerInputEnabled"] === false, `${tenant.type}: answer input must reset closed.`);
  assert(settings.body.settings["site.finalPredictionEnabled"] === false, `${tenant.type}: final prediction must reset closed.`);
  assert(settings.body.settings["site.autoPassCutEnabled"] === false, `${tenant.type}: auto cut must reset off.`);
  assert(
    settings.body.settings["site.preRegistrationEnabled"] === (tenant.type === "police"),
    `${tenant.type}: pre-registration safe default mismatch.`
  );
  record(tenant.type, "회차 활성화·안전 운영단계 초기화", "활성 시험 1개 및 입력/최종예측/자동발표 안전값 확인");
}

async function seedAdminOperationalRows(
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState
) {
  const quota = await prisma.examRegionQuota.findFirst({
    where: { examId: operation.examId, region: { isActive: true } },
    orderBy: { regionId: "asc" },
  });
  assert(quota, `${tenant.type}: active quota missing.`);
  const subjects = await prisma.subject.findMany({
    where: { examType: ExamType.PUBLIC },
    orderBy: { id: "asc" },
  });
  const totalScore = subjects.reduce((sum, subject) => sum + subject.maxScore, 0);
  const now = new Date();
  const phoneSuffix = `${tenant.type === "police" ? "81" : "82"}${RUN_ID}`
    .replace(/\D/g, "")
    .slice(-8)
    .padStart(8, "0");
  const seedUser = await prisma.user.create({
    data: {
      name: operation.seedUserName,
      email: `${tenant.type}.${RUN_ID}@admin-flow.local`,
      emailVerifiedAt: now,
      phone: tenant.type === "police" ? `adminflow${RUN_ID}` : `010${phoneSuffix}`,
      contactPhone: `010${phoneSuffix}`,
      password: "$2b$10$HAfAnxSKfZT/tKe9Gy7TquBLOLCOYOcunzMXDAbmX0CtjayhJBb5S",
      role: Role.USER,
      termsAgreedAt: now,
      privacyAgreedAt: now,
    },
  });
  const plainUser = await prisma.user.create({
    data: {
      name: operation.plainUserName,
      email: `${tenant.type}.${RUN_ID}.plain@admin-flow.local`,
      phone: tenant.type === "police" ? `plainflow${RUN_ID}` : `011${phoneSuffix}`,
      contactPhone: `011${phoneSuffix}`,
      password: "$2b$10$HAfAnxSKfZT/tKe9Gy7TquBLOLCOYOcunzMXDAbmX0CtjayhJBb5S",
      role: Role.USER,
      termsAgreedAt: now,
      privacyAgreedAt: now,
    },
  });
  const examNumber = `99${RUN_ID}`;
  const submission = await prisma.submission.create({
    data: {
      examId: operation.examId,
      userId: seedUser.id,
      regionId: quota.regionId,
      examType: ExamType.PUBLIC,
      gender: Gender.MALE,
      examNumber,
      totalScore,
      bonusType: BonusType.NONE,
      bonusRate: 0,
      certificateBonus: 0,
      finalScore: totalScore,
      scoringStatus: SubmissionScoringStatus.SCORED,
      userAnswers: {
        create: subjects.flatMap((subject) =>
          Array.from({ length: subject.questionCount }, (_, index) => ({
            subjectId: subject.id,
            questionNumber: index + 1,
            selectedAnswer: 1,
            isCorrect: true,
          }))
        ),
      },
      subjectScores: {
        create: subjects.map((subject) => ({
          subjectId: subject.id,
          rawScore: subject.maxScore,
          isFailed: false,
        })),
      },
    },
  });
  await prisma.comment.create({
    data: {
      examId: operation.examId,
      userId: seedUser.id,
      content: `${PREFIX}-${tenant.type}-관리자삭제댓글`,
    },
  });
  if (tenant.type === "police") {
    await prisma.preRegistration.create({
      data: {
        examId: operation.examId,
        userId: seedUser.id,
        regionId: quota.regionId,
        examType: ExamType.PUBLIC,
        gender: Gender.MALE,
        examNumber,
        submissionId: submission.id,
        convertedAt: now,
      },
    });
    await prisma.preRegistration.create({
      data: {
        examId: operation.examId,
        userId: plainUser.id,
        regionId: quota.regionId,
        examType: ExamType.PUBLIC,
        gender: Gender.MALE,
        examNumber: `98${RUN_ID}`,
      },
    });
  }
  return { submissionId: submission.id, originalTotalScore: totalScore };
}

async function generateMockAndPublishCuts(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState
) {
  await prisma.examOperationState.update({
    where: { examId: operation.examId },
    data: { phase: ExamOperationPhase.ANALYSIS_OPEN, featureOverrides: {} },
  });
  await gotoLocal(page, `${tenant.baseUrl}/admin/mock-data`);
  await page.locator("#mock-exam").selectOption(String(operation.examId));
  await page.locator("#mock-public-per-region").fill("6");
  const careerInput = page.locator("#mock-career-per-region");
  if (await careerInput.count()) await careerInput.fill("2");
  await page.getByRole("button", { name: "목업 데이터 생성", exact: true }).click();
  await confirmModal(page);
  await page.getByText("목업 데이터 생성이 완료되었습니다.", { exact: true }).waitFor({ timeout: 90_000 });
  const mockSubmissionCount = await prisma.submission.count({
    where: { examId: operation.examId, examNumber: { startsWith: "MOCK-" } },
  });
  assert(mockSubmissionCount > 0, `${tenant.type}: mock submissions missing.`);
  record(tenant.type, "시험 당일 목업 표본 생성", `${mockSubmissionCount}건 생성`);

  await gotoLocal(page, `${tenant.baseUrl}/admin/pass-cut`);
  await page.locator("#exam-id").selectOption(String(operation.examId));
  for (let releaseNumber = 1; releaseNumber <= 2; releaseNumber += 1) {
    await page.locator("#release-memo").fill(`${PREFIX} ${releaseNumber}차 운영 검증`);
    const releaseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/pass-cut-release") &&
        response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: `${releaseNumber}차 합격컷 발표하기`, exact: true })
      .click();
    await confirmModal(page);
    const releaseResponse = await releaseResponsePromise;
    const releaseBody = (await releaseResponse.json()) as {
      success?: boolean;
      releaseNumber?: number;
      snapshotCount?: number;
      error?: string;
    };
    assert(
      releaseResponse.ok() &&
        releaseBody.success === true &&
        releaseBody.releaseNumber === releaseNumber &&
        Number(releaseBody.snapshotCount) > 0,
      `${tenant.type}: ${releaseNumber}차 pass-cut release failed: ${JSON.stringify(releaseBody)}`
    );
  }
  const releases = await prisma.passCutRelease.findMany({
    where: { examId: operation.examId },
    include: { snapshots: true },
    orderBy: { releaseNumber: "asc" },
  });
  assert(releases.length === 2 && releases.every((item) => item.snapshots.length > 0), `${tenant.type}: pass-cut release snapshots missing.`);
  const snapshots = releases.flatMap((item) => item.snapshots);
  const representative = snapshots.find((item) => item.participantCount > 0) ?? snapshots[0];
  assert(representative, `${tenant.type}: representative pass-cut snapshot missing.`);
  const historyParams = new URLSearchParams({
    examId: String(operation.examId),
    regionId: String(representative.regionId),
    examType: representative.examType,
  });
  if (tenant.type === "fire" && representative.gender) {
    historyParams.set("gender", representative.gender);
  }
  const publicHistory = await pageRequest<{
    releases?: Array<{
      snapshot?: {
        sureMinScore?: number | null;
        likelyMinScore?: number | null;
        possibleMinScore?: number | null;
      } | null;
    }>;
  }>(page, `/api/pass-cut-history?${historyParams.toString()}`);
  assert(publicHistory.ok, `${tenant.type}: public pass-cut history failed: ${publicHistory.text}`);
  if (tenant.type === "police") {
    const publishedSnapshots = publicHistory.body?.releases?.map((item) => item.snapshot).filter(Boolean) ?? [];
    assert(
      publishedSnapshots.length > 0 &&
        publishedSnapshots.every(
          (item) =>
            item?.sureMinScore === null &&
            item?.likelyMinScore === null &&
            item?.possibleMinScore === null
        ),
      "Police uncalibrated grades must stay hidden from the public release API."
    );
    assert(
      snapshots.some(
        (item) => item.sureMinScore !== null || item.likelyMinScore !== null || item.possibleMinScore !== null
      ),
      "Police calibration candidate boundaries were not archived."
    );
    record(
      tenant.type,
      "1·2차 합격컷 발표",
      `${snapshots.length}개 내부 보정 스냅샷 저장, 공개 API 확실·유력·가능 값 null 확인`
    );
  } else {
    const publishedGrades = snapshots.filter(
      (item) => item.sureMinScore !== null || item.likelyMinScore !== null || item.possibleMinScore !== null
    );
    assert(publishedGrades.length > 0, "Fire pass-cut grade boundaries were not published.");
    assert(
      publicHistory.body?.releases?.some(
        (item) =>
          Boolean(item.snapshot) &&
          [
            item.snapshot?.sureMinScore,
            item.snapshot?.likelyMinScore,
            item.snapshot?.possibleMinScore,
          ].some((value) => typeof value === "number")
      ),
      "Fire grade boundaries missing from public release API."
    );
    record(tenant.type, "1·2차 합격컷 발표", `${snapshots.length}개 스냅샷, 확실·유력·가능 경계 ${publishedGrades.length}건`);
  }
  const autoNoticeCount = await prisma.notice.count({
    where: { content: { contains: operation.examName }, title: { contains: "합격컷 발표" } },
  });
  assert(autoNoticeCount === 2, `${tenant.type}: pass-cut auto notices ${autoNoticeCount}/2.`);
}

async function verifyRescoreResult(
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState,
  submissionId: number,
  originalTotalScore: number
) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  assert(submission, `${tenant.type}: seeded submission disappeared.`);
  assert(submission.totalScore < originalTotalScore, `${tenant.type}: corrected answer did not reduce score.`);
  assert(submission.scoringStatus === SubmissionScoringStatus.SCORED, `${tenant.type}: rescore status is not SCORED.`);
  const [logCount, eventCount] = await Promise.all([
    prisma.answerKeyLog.count({ where: { examId: operation.examId } }),
    prisma.rescoreEvent.count({ where: { examId: operation.examId, examType: ExamType.PUBLIC } }),
  ]);
  assert(logCount > 0 && eventCount > 0, `${tenant.type}: answer log/rescore audit missing.`);
  record(
    tenant.type,
    "정답 수정 영향 확인",
    `총점 ${originalTotalScore}→${submission.totalScore}, 정답로그 ${logCount}건, 재채점 이벤트 ${eventCount}건`
  );
}

async function exerciseSiteOperationSetting(
  page: Page,
  tenant: TenantCase,
  baseline: TenantBaseline
) {
  const original = String(baseline.settings["site.mainPageRefreshInterval"] ?? "60");
  const changed = original === "71" ? "72" : "71";
  await gotoLocal(page, `${tenant.baseUrl}/admin/site/operations`);
  await page.locator("#main-refresh-interval").fill(changed);
  await page.getByRole("button", { name: "운영 설정 저장", exact: true }).click();
  await confirmModal(page);
  await page.getByText("운영 설정이 저장되었습니다.", { exact: true }).waitFor();
  const settings = await pageRequest<{ settings?: Record<string, unknown> }>(page, "/api/admin/site");
  assert(String(settings.body?.settings?.["site.mainPageRefreshInterval"]) === changed, `${tenant.type}: operation setting save failed.`);
  record(tenant.type, "운영 설정 수정", `메인 새로고침 ${original}초→${changed}초 저장 확인`);
}

async function exerciseAdminDataManagement(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient,
  operation: TenantOperationState,
  submissionId: number
) {
  const submissions = await pageRequest<{ submissions?: Array<{ id: number }> }>(
    page,
    `/api/admin/submissions?examId=${operation.examId}&search=${encodeURIComponent(operation.seedUserName)}`
  );
  assert(submissions.ok && submissions.text.includes(operation.seedUserName), `${tenant.type}: submission list missing seed user.`);
  const detail = await pageRequest(page, `/api/admin/submissions/detail?id=${submissionId}`);
  assert(detail.ok && detail.text.includes(operation.seedUserName), `${tenant.type}: submission detail failed.`);
  const exportResponse = await pageRequest(
    page,
    `/api/admin/submissions/export?examId=${operation.examId}`
  );
  assert(
    exportResponse.ok && Boolean(exportResponse.contentDisposition?.includes("attachment")),
    `${tenant.type}: submission export failed.`
  );
  const stats = await pageRequest(page, `/api/stats?examId=${operation.examId}`);
  assert(stats.ok, `${tenant.type}: admin statistics failed: ${stats.text}`);
  await gotoLocal(page, `${tenant.baseUrl}/admin/submissions`);
  await page.getByRole("heading", { name: "제출 현황", exact: true }).waitFor();
  record(tenant.type, "제출 목록·상세·통계·내보내기", "활성 회차 제출 조회, 상세, 통계, XLSX 응답 확인");

  const commentMarker = `${PREFIX}-${tenant.type}-관리자삭제댓글`;
  await gotoLocal(page, `${tenant.baseUrl}/admin/comments`);
  const commentSearch = page.getByPlaceholder("내용, 작성자명, 연락처 검색");
  await commentSearch.fill(commentMarker);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const commentRow = page.getByRole("row").filter({ hasText: commentMarker });
  await commentRow.getByRole("button", { name: "삭제", exact: true }).click();
  await confirmModal(page);
  await page.getByText("댓글을 삭제했습니다.", { exact: true }).waitFor();
  assert((await prisma.comment.count({ where: { content: commentMarker } })) === 0, `${tenant.type}: comment moderation delete failed.`);
  record(tenant.type, "댓글 관리", "검색 후 단건 삭제 확인");

  await gotoLocal(page, `${tenant.baseUrl}/admin/users`);
  await page.getByPlaceholder("이름, 아이디 또는 연락처 검색").fill(operation.seedUserName);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const userRow = page.getByRole("row").filter({ hasText: operation.seedUserName });
  await userRow.getByRole("button", { name: "재설정 코드", exact: true }).click();
  await confirmModal(page);
  await page.getByRole("heading", { name: "일회용 재설정 코드 발급 완료", exact: true }).waitFor();
  const resetCodeText = await page
    .getByText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    .innerText();
  assert(
    /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(resetCodeText.trim()),
    `${tenant.type}: admin reset code format invalid.`
  );
  await page.getByRole("button", { name: "확인", exact: true }).last().click();

  const allCsv = await pageRequest(page, "/api/admin/users/export");
  assert(allCsv.ok && allCsv.text.includes(operation.seedUserName) && allCsv.text.includes(operation.plainUserName), `${tenant.type}: all-user contact CSV failed.`);
  record(tenant.type, "회원·비밀번호·연락처 명단 관리", "재설정 코드 및 전체 일반회원 연락처 CSV 확인");

  if (tenant.type === "police") {
    await gotoLocal(page, `${tenant.baseUrl}/admin/pre-registrations`);
    await page.getByPlaceholder("이름, 연락처, 응시번호 검색").fill(PREFIX);
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await page.getByText(operation.seedUserName, { exact: true }).waitFor();
    const list = await pageRequest(
      page,
      `/api/admin/pre-registrations?examId=${operation.examId}&search=${encodeURIComponent(PREFIX)}`
    );
    assert(list.ok && list.text.includes(operation.seedUserName) && list.text.includes(operation.plainUserName), "Police pre-registration list failed.");
    const draw = await pageRequest<{ eligibleCount?: number; drawnWinnerCount?: number }>(
      page,
      "/api/admin/pre-registrations/draw",
      { method: "POST", body: { examId: operation.examId, search: PREFIX, winnerCount: 1 } }
    );
    assert(draw.ok && draw.body?.eligibleCount === 2 && draw.body?.drawnWinnerCount === 1, `Police pre-registration draw failed: ${draw.text}`);
    const preAll = await pageRequest(
      page,
      `/api/admin/pre-registrations/export?examId=${operation.examId}&search=${encodeURIComponent(PREFIX)}`
    );
    assert(preAll.ok && preAll.text.includes(operation.plainUserName), "Police pre-registration all export failed.");
    record(tenant.type, "사전등록·이벤트 추첨·CSV", "활성 회차 2명 조회, 1명 추첨");
  } else {
    const blocked = await nodeTenantRequest(page, tenant, "/api/admin/pre-registrations");
    assert(blocked.status === 404, "Fire must not expose police pre-registration admin API.");
    record(tenant.type, "경찰 전용 사전등록 차단", "소방 관리자 API 404 확인");
  }

  await gotoLocal(page, `${tenant.baseUrl}/admin/users`);
  const userSearch = page.getByPlaceholder("이름, 아이디 또는 연락처 검색");
  await userSearch.fill(operation.plainUserName);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const plainUserRow = page.getByRole("row").filter({ hasText: operation.plainUserName });
  await plainUserRow.waitFor();

  await plainUserRow.locator("select").selectOption(Role.ADMIN);
  await plainUserRow.getByRole("button", { name: "권한 저장", exact: true }).click();
  await confirmModal(page);
  await page
    .getByText(`${operation.plainUserName}님의 권한이 관리자로 변경되었습니다.`, {
      exact: true,
    })
    .waitFor();
  assert(
    (await prisma.user.findFirst({ where: { name: operation.plainUserName } }))?.role ===
      Role.ADMIN,
    `${tenant.type}: user role promotion failed.`
  );

  await plainUserRow.locator("select").selectOption(Role.USER);
  await plainUserRow.getByRole("button", { name: "권한 저장", exact: true }).click();
  await confirmModal(page);
  await page
    .getByText(`${operation.plainUserName}님의 권한이 일반 사용자로 변경되었습니다.`, {
      exact: true,
    })
    .waitFor();
  assert(
    (await prisma.user.findFirst({ where: { name: operation.plainUserName } }))?.role ===
      Role.USER,
    `${tenant.type}: user role demotion failed.`
  );

  await plainUserRow.getByRole("button", { name: "삭제", exact: true }).click();
  await confirmModal(page);
  await page
    .getByText(`${operation.plainUserName} 사용자가 삭제되었습니다.`, { exact: true })
    .waitFor();
  assert(
    (await prisma.user.count({ where: { name: operation.plainUserName } })) === 0,
    `${tenant.type}: user delete failed.`
  );
  record(
    tenant.type,
    "회원 권한 변경·삭제",
    "일반 사용자→관리자→일반 사용자 권한 왕복 및 계정 종속 데이터 삭제 확인"
  );
}

async function deleteContentThroughUi(
  page: Page,
  tenant: TenantCase,
  prisma: PrismaClient
) {
  const notice = await prisma.notice.findFirst({ where: { title: { contains: `${PREFIX}-${tenant.type}-공지` } } });
  if (notice) {
    await gotoLocal(page, `${tenant.baseUrl}/admin/notices`);
    const row = page.getByRole("row").filter({ hasText: notice.title });
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await confirmModal(page);
    await page.getByText("공지사항이 삭제되었습니다.", { exact: true }).waitFor();
  }
  const faq = await prisma.faq.findFirst({ where: { question: { contains: `${PREFIX}-${tenant.type}-FAQ` } } });
  if (faq) {
    await gotoLocal(page, `${tenant.baseUrl}/admin/faqs`);
    const row = page.getByRole("row").filter({ hasText: faq.question });
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await confirmModal(page);
    await page.getByText("FAQ가 삭제되었습니다.", { exact: true }).waitFor();
  }
  const event = await prisma.eventSection.findFirst({ where: { title: { contains: `${PREFIX}-${tenant.type}-이벤트` } } });
  if (event) {
    if (event.imageUrl) uploadedUrls[tenant.type].delete(event.imageUrl);
    await gotoLocal(page, `${tenant.baseUrl}/admin/events`);
    const row = page.getByRole("row").filter({ hasText: event.title });
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await confirmModal(page);
    await page.getByText("이벤트가 삭제되었습니다.", { exact: true }).waitFor();
  }
  const banner = await prisma.banner.findFirst({ where: { altText: `${PREFIX}-${tenant.type}-배너` } });
  if (banner) {
    if (banner.imageUrl) uploadedUrls[tenant.type].delete(banner.imageUrl);
    if (banner.mobileImageUrl) uploadedUrls[tenant.type].delete(banner.mobileImageUrl);
    await gotoLocal(page, `${tenant.baseUrl}/admin/banners`);
    const marker = page.getByText(`ID #${banner.id}`, { exact: true });
    const card = marker.locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' p-3 ') and contains(@class,'sm:flex-row')][1]",
    );
    await card
      .getByRole("button", { name: "삭제", exact: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await confirmModal(page);
    await page.getByText("배너가 삭제되었습니다.", { exact: true }).waitFor();
  }
  const remaining = await Promise.all([
    prisma.notice.count({ where: { title: { contains: `${PREFIX}-${tenant.type}-공지` } } }),
    prisma.faq.count({ where: { question: { contains: `${PREFIX}-${tenant.type}-FAQ` } } }),
    prisma.eventSection.count({ where: { title: { contains: `${PREFIX}-${tenant.type}-이벤트` } } }),
    prisma.banner.count({ where: { altText: `${PREFIX}-${tenant.type}-배너` } }),
  ]);
  assert(remaining.every((count) => count === 0), `${tenant.type}: content UI delete left rows ${remaining.join(",")}.`);
  record(tenant.type, "콘텐츠 삭제", "공지·FAQ·이벤트·배너 관리자 삭제 및 DB 반영 확인");
}

async function restoreSettings(
  tenantCase: TenantCase,
  cookieHeader: string,
  baseline: TenantBaseline
) {
  for (const section of SITE_SETTINGS_SECTIONS) {
    const settings = Object.fromEntries(
      section.settingKeys.map((key) => [key, baseline.settings[key]])
    );
    const response = await nodeTenantPageResponse(tenantCase, cookieHeader, `/api/admin/site?section=${section.key}`, {
      method: "PUT",
      body: { settings },
    });
    assert(response.ok, `${tenantCase.type}: restore ${section.key} settings failed: ${response.text}`);
  }
}

async function restoreAndVerifyBaseline(
  tenant: TenantCase,
  cookieHeader: string,
  prisma: PrismaClient,
  baseline: TenantBaseline,
  operation: TenantOperationState
) {
  const mockReset = await nodeTenantPageResponse(tenant, cookieHeader, `/api/admin/mock-data?examId=${operation.examId}`, {
    method: "DELETE",
  });
  assert(mockReset.ok, `${tenant.type}: mock reset before restore failed: ${mockReset.text}`);
  const reactivate = await nodeTenantPageResponse(tenant, cookieHeader, `/api/admin/exam?id=${baseline.activeExamId}`, {
    method: "PUT",
    body: { isActive: true },
  });
  assert(reactivate.ok, `${tenant.type}: original exam reactivation failed: ${reactivate.text}`);
  await restoreSettings(tenant, cookieHeader, baseline);
  await prisma.$transaction([
    prisma.examOperationAuditLog.deleteMany({
      where: {
        examId: baseline.activeExamId,
        id: { gt: baseline.operationAuditMaxId },
      },
    }),
    prisma.examOperationState.update({
      where: { id: baseline.operationState.id },
      data: {
        phase: baseline.operationState.phase,
        activeCampaignId: baseline.operationState.activeCampaignId,
        featureOverrides: baseline.operationState.featureOverrides ?? Prisma.JsonNull,
        version: baseline.operationState.version,
        updatedBy: baseline.operationState.updatedBy,
        updatedAt: baseline.operationState.updatedAt,
      },
    }),
  ]);

  const tempUserIds = (
    await prisma.user.findMany({
      where: { name: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((item) => item.id);
  await prisma.submission.deleteMany({ where: { examId: operation.examId } });
  await prisma.exam.delete({ where: { id: operation.examId } });
  if (tempUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: tempUserIds }, role: Role.USER } });
  }
  await prisma.notice.deleteMany({
    where: { OR: [{ title: { contains: PREFIX } }, { content: { contains: PREFIX } }] },
  });

  const [activeExams, restoredOperationState, operationAuditCount, userCount, submissions, answerKeyCount, preRegistrationCount] =
    await Promise.all([
      prisma.exam.findMany({ where: { isActive: true }, select: { id: true } }),
      prisma.examOperationState.findUnique({ where: { examId: baseline.activeExamId } }),
      prisma.examOperationAuditLog.count({
        where: {
          examId: baseline.activeExamId,
          id: { gt: baseline.operationAuditMaxId },
        },
      }),
      prisma.user.count(),
      prisma.submission.findMany({
        where: { examId: baseline.activeExamId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          regionId: true,
          examType: true,
          gender: true,
          examNumber: true,
          totalScore: true,
          finalScore: true,
          scoringStatus: true,
          editCount: true,
          updatedAt: true,
        },
      }),
      prisma.answerKey.count({ where: { examId: baseline.activeExamId } }),
      prisma.preRegistration.count({ where: { examId: baseline.activeExamId } }),
    ]);
  assert(activeExams.length === 1 && activeExams[0].id === baseline.activeExamId, `${tenant.type}: original active exam not restored.`);
  assert(
    restoredOperationState?.phase === baseline.operationState.phase &&
      restoredOperationState.activeCampaignId === baseline.operationState.activeCampaignId &&
      restoredOperationState.version === baseline.operationState.version &&
      serializeRows(restoredOperationState.featureOverrides) === serializeRows(baseline.operationState.featureOverrides),
    `${tenant.type}: operation state or representative campaign was not restored.`,
  );
  assert(operationAuditCount === 0, `${tenant.type}: test operation audit rows were not removed.`);
  assert(userCount === baseline.userCount, `${tenant.type}: user count changed ${baseline.userCount}→${userCount}.`);
  assert(serializeRows(submissions) === baseline.originalSubmissionFingerprint, `${tenant.type}: original submissions changed.`);
  assert(answerKeyCount === baseline.originalAnswerKeyCount, `${tenant.type}: original answer keys changed.`);
  assert(preRegistrationCount === baseline.originalPreRegistrationCount, `${tenant.type}: original pre-registrations changed.`);
  const settings = await nodeTenantPageResponse<{ settings?: Record<string, unknown> }>(tenant, cookieHeader, "/api/admin/site");
  assert(serializeRows(settings.body?.settings) === serializeRows(baseline.settings), `${tenant.type}: site settings were not restored.`);
  record(tenant.type, "운영 원상복구·기존 데이터 불변", `${baseline.activeExamName} 재활성화, 회원·제출·정답·사전등록·운영단계·대표 캠페인·설정 동일`);
}

async function verifyCrossTenantIsolation(prismas: Record<TenantType, PrismaClient>) {
  const policeNotice = await prismas.police.notice.count({ where: { title: { contains: `${PREFIX}-fire` } } });
  const fireNotice = await prismas.fire.notice.count({ where: { title: { contains: `${PREFIX}-police` } } });
  const policeFaq = await prismas.police.faq.count({ where: { question: { contains: `${PREFIX}-fire` } } });
  const fireFaq = await prismas.fire.faq.count({ where: { question: { contains: `${PREFIX}-police` } } });
  const policeBanner = await prismas.police.banner.count({ where: { altText: { contains: `${PREFIX}-fire` } } });
  const fireBanner = await prismas.fire.banner.count({ where: { altText: { contains: `${PREFIX}-police` } } });
  assert(policeNotice + fireNotice + policeFaq + fireFaq + policeBanner + fireBanner === 0, "Cross-tenant content leak detected.");
  record("shared", "경찰·소방 관리자 데이터 격리", "공지·FAQ·배너 교차 행 0건");
}

async function verifyOperationalTenantIsolation(
  prismas: Record<TenantType, PrismaClient>,
  operations: Record<TenantType, TenantOperationState>
) {
  const [policeActive, fireActive, policeForeignExam, fireForeignExam, policeForeignUser, fireForeignUser] =
    await Promise.all([
      prismas.police.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prismas.fire.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prismas.police.exam.count({ where: { name: operations.fire.examName } }),
      prismas.fire.exam.count({ where: { name: operations.police.examName } }),
      prismas.police.user.count({ where: { name: operations.fire.seedUserName } }),
      prismas.fire.user.count({ where: { name: operations.police.seedUserName } }),
    ]);
  assert(policeActive.length === 1 && policeActive[0].id === operations.police.examId, "Police operational exam not active.");
  assert(fireActive.length === 1 && fireActive[0].id === operations.fire.examId, "Fire operational exam not active.");
  assert(policeForeignExam + fireForeignExam + policeForeignUser + fireForeignUser === 0, "Operational tenant leak detected.");
  record(
    "shared",
    "경찰·소방 동시 운영 격리",
    "각 스키마 활성 시험 1개씩 동시 유지, 상대 시험·회원 교차 행 0건"
  );
}

async function cleanupTenant(prisma: PrismaClient, tenant: TenantType) {
  await prisma.authRateLimitBucket.deleteMany({
    where: {
      OR: [
        { namespace: { startsWith: "auth-login-" } },
        { namespace: { startsWith: "auth-admin-login-" } },
      ],
    },
  });
  const [events, banners] = await Promise.all([
    prisma.eventSection.findMany({
      where: { title: { contains: PREFIX } },
      select: { imageUrl: true },
    }),
    prisma.banner.findMany({
      where: { altText: { contains: PREFIX } },
      select: { imageUrl: true, mobileImageUrl: true },
    }),
  ]);
  for (const event of events) {
    if (event.imageUrl) uploadedUrls[tenant].add(event.imageUrl);
  }
  for (const banner of banners) {
    if (banner.imageUrl) uploadedUrls[tenant].add(banner.imageUrl);
    if (banner.mobileImageUrl) uploadedUrls[tenant].add(banner.mobileImageUrl);
  }
  for (const publicUrl of uploadedUrls[tenant]) {
    try {
      await deleteUploadedFileByPublicUrl(publicUrl);
    } catch (error) {
      console.warn(`[CLEANUP] ${tenant} upload cleanup failed for ${publicUrl}:`, error);
    }
  }
  uploadedUrls[tenant].clear();

  const exams = await prisma.exam.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true, isActive: true },
  });
  const examIds = exams.map((item) => item.id);
  if (examIds.length > 0) {
    if (exams.some((item) => item.isActive)) {
      const replacement = await prisma.exam.findFirst({
        where: { id: { notIn: examIds } },
        orderBy: [{ examDate: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (replacement) {
        await prisma.$transaction(async (tx) => {
          await tx.exam.updateMany({ where: { id: { in: examIds } }, data: { isActive: false } });
          await tx.exam.update({ where: { id: replacement.id }, data: { isActive: true } });
        });
      }
    }
    const [userRows, namedUsers] = await Promise.all([
      prisma.submission.findMany({
        where: { examId: { in: examIds } },
        select: { userId: true },
      }),
      prisma.user.findMany({
        where: { name: { startsWith: PREFIX }, role: Role.USER },
        select: { id: true },
      }),
    ]);
    const userIds = [
      ...new Set([...userRows.map((item) => item.userId), ...namedUsers.map((item) => item.id)]),
    ];
    await prisma.submission.deleteMany({ where: { examId: { in: examIds } } });
    await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds }, role: Role.USER, submissions: { none: {} } },
      });
    }
  }
  await prisma.notice.deleteMany({
    where: {
      OR: [
        { title: { contains: PREFIX } },
        { content: { contains: PREFIX } },
      ],
    },
  });
  await prisma.faq.deleteMany({ where: { question: { contains: PREFIX } } });
  await prisma.banner.deleteMany({ where: { altText: { contains: PREFIX } } });
  await prisma.eventSection.deleteMany({ where: { title: { contains: PREFIX } } });
  await prisma.promotionCampaign.deleteMany({ where: { name: { contains: PREFIX } } });
  console.log(`[CLEANUP] ${tenant}`);
}

async function main() {
  loadLocalEnv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const prismas = {} as Record<TenantType, PrismaClient>;
  for (const tenant of RUN_TENANTS) {
    prismas[tenant.type] = new PrismaClient({
      datasources: { db: { url: databaseUrl(tenant.schema) } },
    });
  }
  let browser: Browser | null = null;
  const contexts: BrowserContext[] = [];
  const pages = {} as Record<TenantType, Page>;
  const baselines = {} as Record<TenantType, TenantBaseline>;
  const operations = {} as Record<TenantType, TenantOperationState>;
  const restoredTenants = new Set<TenantType>();

  try {
    for (const tenant of RUN_TENANTS) {
      await cleanupTenant(prismas[tenant.type], tenant.type);
    }
    browser = await chromium.launch({
      headless: true,
      args: [
        "--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1",
      ],
    });

    for (const tenant of RUN_TENANTS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      contexts.push(context);
      const page = await loginAdmin(context, tenant);
      pages[tenant.type] = page;
      authCookieHeaders.set(
        tenant.type,
        (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
      );
      baselines[tenant.type] = await captureBaseline(page, tenant, prismas[tenant.type]);
      await capture(page, tenant.type, "01-dashboard-1280");
      await verifyAdminPages(page, tenant);
      await exercisePromotionCampaignCrud(page, tenant, prismas[tenant.type]);
      await exerciseExamOperationTransition(page, tenant, prismas[tenant.type]);
      await exerciseExamCrud(page, tenant, prismas[tenant.type]);
      await exerciseNoticeCrud(page, tenant, prismas[tenant.type]);
      await exerciseFaqCrud(page, tenant, prismas[tenant.type]);
      await exerciseEventCrud(page, tenant, prismas[tenant.type]);
      await exerciseBannerCrud(page, tenant, prismas[tenant.type]);
      await capture(page, tenant.type, "02-banner-1280");
      await exerciseSiteOperationSetting(page, tenant, baselines[tenant.type]);
      const operation = await createOperationalExam(
        page,
        tenant,
        prismas[tenant.type],
        baselines[tenant.type]
      );
      operations[tenant.type] = operation;
      await uploadAnswerCsv(page, tenant, prismas[tenant.type], operation, false);
      await activateOperationalExam(page, tenant, prismas[tenant.type], operation);
      const seeded = await seedAdminOperationalRows(tenant, prismas[tenant.type], operation);
      await uploadAnswerCsv(page, tenant, prismas[tenant.type], operation, true);
      await verifyRescoreResult(
        tenant,
        prismas[tenant.type],
        operation,
        seeded.submissionId,
        seeded.originalTotalScore
      );
      await generateMockAndPublishCuts(page, tenant, prismas[tenant.type], operation);
      await exerciseAdminDataManagement(
        page,
        tenant,
        prismas[tenant.type],
        operation,
        seeded.submissionId
      );
      await capture(page, tenant.type, "03-operation-1280");
    }

    if (RUN_TENANTS.length === 2) {
      await verifyCrossTenantIsolation(prismas);
      await verifyOperationalTenantIsolation(prismas, operations);
    }
    for (const tenant of RUN_TENANTS) {
      await deleteContentThroughUi(pages[tenant.type], tenant, prismas[tenant.type]);
    }
    for (const tenant of RUN_TENANTS) {
      await restoreAndVerifyBaseline(
        tenant,
        authCookieHeaders.get(tenant.type) ?? "",
        prismas[tenant.type],
        baselines[tenant.type],
        operations[tenant.type]
      );
      restoredTenants.add(tenant.type);
    }
    assert(runtimeErrors.length === 0, `Runtime errors: ${runtimeErrors.join(" | ")}`);

    const report = {
      result: "passed",
      generatedAt: new Date().toISOString(),
      runId: RUN_ID,
      checks,
      runtimeErrors,
      screenshots,
      cleanup: "temporary admin workflow rows removed",
    };
    writeFileSync(path.join(EVIDENCE_ROOT, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(
      path.join(EVIDENCE_ROOT, "VISUAL_QA.md"),
      [
        "# 경찰·소방 관리자 A-Z 워크플로우 QA",
        "",
        `- 실행 시각: ${report.generatedAt}`,
        "- 결과: PASS",
        "- 테넌트: 경찰, 소방",
        "- 브라우저 런타임 오류: 없음",
        "",
        ...checks.map((item) => `- PASS [${item.tenant}] ${item.name}: ${item.detail}`),
        "",
      ].join("\n"),
      "utf8"
    );
    writeFileSync(path.join(EVIDENCE_ROOT, "DESIGN_TOKENS.md"), readFileSync(path.join(APP_DIR, "DESIGN.md"), "utf8"), "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const tenant of RUN_TENANTS) {
      if (
        restoredTenants.has(tenant.type) ||
        !baselines[tenant.type] ||
        !operations[tenant.type] ||
        !authCookieHeaders.get(tenant.type)
      ) {
        continue;
      }
      await restoreAndVerifyBaseline(
        tenant,
        authCookieHeaders.get(tenant.type) ?? "",
        prismas[tenant.type],
        baselines[tenant.type],
        operations[tenant.type]
      ).catch((error) => {
        console.error(`[RECOVERY] ${tenant.type} baseline restore failed.`, error);
      });
    }
    for (const context of contexts) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    for (const tenant of RUN_TENANTS) {
      await cleanupTenant(prismas[tenant.type], tenant.type).catch(() => undefined);
    }
    await Promise.all(Object.values(prismas).map((prisma) => prisma.$disconnect()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
