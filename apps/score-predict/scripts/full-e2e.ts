import { randomInt } from "node:crypto";
import { startServer as startNextServer } from "next/dist/server/lib/start-server";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
  error?: string;
};

type ExamSubject = {
  id: number;
  name: string;
  questionCount: number;
  pointPerQuestion: number;
  maxScore: number;
};

type ExamRegion = {
  id: number;
  name: string;
  isActive: boolean;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
};

type ExamNumberRange = {
  start: string | null;
  end: string | null;
};

type ScriptExamType = "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
type ScriptGender = "MALE" | "FEMALE";
type DivisionTenant = "fire" | "police";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const SERVER_MODE = process.env.E2E_SERVER_MODE === "dev" ? "dev" : "prod";
const TENANT_TYPE = process.env.NEXT_PUBLIC_TENANT_TYPE === "police" ? "police" : "fire";
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "010-0000-0000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1234!";
const RUN_ID = Date.now();
const USER_PASSWORD = "Usertest!123";
const USER_NAME = "\uD14C\uC2A4\uD2B8\uC0AC\uC6A9\uC790";
const USER_PHONE = makeRandomPhone();
const CRON_SECRET = process.env.AUTO_PASSCUT_CRON_SECRET ?? process.env.CRON_SECRET ?? "fire-exam-cron-2026-secret";

const results: StepResult[] = [];

let serverStarted = false;

let createdNoticeId: number | null = null;
let createdFaqId: number | null = null;
let createdEventId: number | null = null;
let createdBannerId: number | null = null;
let createdSubmissionId: number | null = null;
let createdCommentId: number | null = null;
let createdExamId: number | null = null;
let createdSecondaryCommentId: number | null = null;
let testUserId: number | null = null;
let originalFinalPredictionSetting: unknown = undefined;
let originalAnswerInputSetting: unknown = undefined;
let originalPreRegistrationSetting: unknown = undefined;

class HttpClient {
  private readonly jar = new Map<string, string>();

  constructor(private readonly name: string) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http://") || path.startsWith("https://") ? path : `${BASE_URL}${path}`;
    const headers = new Headers(init.headers ?? {});
    const redirectMode = init.redirect ?? "manual";
    const requestInit: RequestInit = { ...init };
    delete requestInit.redirect;

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader.length > 0) {
      headers.set("cookie", cookieHeader);
    }

    const response = await fetch(url, {
      ...requestInit,
      headers,
      redirect: redirectMode,
    });

    this.captureCookies(response);
    return response;
  }

  async requestJson(path: string, init: RequestInit = {}): Promise<{ status: number; json: JsonValue; response: Response }> {
    const response = await this.request(path, init);
    const text = await response.text();
    let parsed: JsonValue;
    try {
      parsed = text.length > 0 ? (JSON.parse(text) as JsonValue) : null;
    } catch (error) {
      throw new Error(`${this.name} ${path} returned non-JSON body: ${String(error)}\nBody: ${text.slice(0, 4000)}`);
    }
    return { status: response.status, json: parsed, response };
  }

  private getCookieHeader(): string {
    if (this.jar.size < 1) return "";
    return Array.from(this.jar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private captureCookies(response: Response): void {
    const headerBag = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookieRows = typeof headerBag.getSetCookie === "function"
      ? headerBag.getSetCookie()
      : [];

    const fallback = response.headers.get("set-cookie");
    if (fallback && setCookieRows.length < 1) {
      setCookieRows.push(fallback);
    }

    for (const row of setCookieRows) {
      const firstPart = row.split(";")[0];
      const separator = firstPart.indexOf("=");
      if (separator < 1) continue;
      const cookieName = firstPart.slice(0, separator).trim();
      const cookieValue = firstPart.slice(separator + 1).trim();
      if (cookieValue.length < 1) {
        this.jar.delete(cookieName);
      } else {
        this.jar.set(cookieName, cookieValue);
      }
    }
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asRecord(value: JsonValue, context: string): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} is not an object`);
  }
  return value as Record<string, JsonValue>;
}

function asArray(value: JsonValue, context: string): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} is not an array`);
  }
  return value;
}

function asString(value: JsonValue, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} is not a string`);
  }
  return value;
}

function asNumber(value: JsonValue, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} is not a number`);
  }
  return value;
}

function asBoolean(value: JsonValue, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} is not a boolean`);
  }
  return value;
}

async function isBaseUrlReachable(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

function asNullableString(value: JsonValue, context: string): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(`${context} is not a string or null`);
}

function getExamTypeCode(examType: ScriptExamType): "01" | "03" | "04" | "05" {
  if (examType === "PUBLIC") return "01";
  if (examType === "CAREER_EMT") return "03";
  if (examType === "CAREER_RESCUE") return "04";
  return "05";
}

function getGenderDigit(gender: ScriptGender): "1" | "2" {
  return gender === "FEMALE" ? "2" : "1";
}

function parseExamNumberRange(range: ExamNumberRange | null): { start: number; end: number } | null {
  if (!range?.start || !range.end) return null;
  if (!/^\d{10}$/.test(range.start) || !/^\d{10}$/.test(range.end)) return null;

  const start = Number(range.start);
  const end = Number(range.end);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start > end) return null;

  return { start, end };
}

function buildExamNumberCandidate(params: {
  examType: ScriptExamType;
  gender: ScriptGender;
  range: ExamNumberRange | null;
}): string {
  const parsedRange = parseExamNumberRange(params.range);
  if (parsedRange) {
    return String(randomInt(parsedRange.start, parsedRange.end + 1)).padStart(10, "0");
  }

  const prefix = String(randomInt(0, 1000)).padStart(3, "0");
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");
  const genderDigit = getGenderDigit(params.gender);
  const typeCode = getExamTypeCode(params.examType);
  return `${prefix}${genderDigit}${typeCode}${suffix}`;
}

async function runStep(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? undefined });
    if (detail) {
      console.log(`[PASS] ${name} - ${detail}`);
    } else {
      console.log(`[PASS] ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    console.error(`[FAIL] ${name}`);
    console.error(message);
    throw error;
  }
}

function printSummary(): void {
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;

  console.log("\n=== E2E SUMMARY ===");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  for (const item of results) {
    if (item.ok) {
      console.log(`- PASS: ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
    } else {
      console.log(`- FAIL: ${item.name} -> ${item.error ?? "unknown error"}`);
    }
  }
}

async function startServer(): Promise<void> {
  if (serverStarted) return;
  if (await isBaseUrlReachable()) {
    serverStarted = true;
    return;
  }
  const parsed = new URL(BASE_URL);
  const port = parsed.port ? Number(parsed.port) : 3200;
  await startNextServer({
    dir: process.cwd(),
    port,
    isDev: SERVER_MODE === "dev",
    allowRetry: false,
  });
  serverStarted = true;
}

async function stopServer(): Promise<void> {
  serverStarted = false;
}

function makeRandomPhone(): string {
  const block1 = String(randomInt(1000, 10000));
  const block2 = String(randomInt(1000, 10000));
  return `010-${block1}-${block2}`;
}

function withDivisionPath(tenant: DivisionTenant, pathname: string): string {
  return pathname === "/" ? `/${tenant}` : `/${tenant}${pathname}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatJsonDebug(value: JsonValue): string {
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value);
  }
}

async function waitForJsonCondition(
  client: HttpClient,
  path: string,
  predicate: (json: JsonValue) => boolean,
  errorMessage: string,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<JsonValue> {
  const attempts = options.attempts ?? 8;
  const delayMs = options.delayMs ?? 250;

  let lastStatus = 0;
  let lastJson: JsonValue = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await client.requestJson(path);
    lastStatus = result.status;
    lastJson = result.json;

    if (result.status === 200 && predicate(result.json)) {
      return result.json;
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`${errorMessage}. status=${lastStatus}, body=${formatJsonDebug(lastJson)}`);
}

function buildAnswerRows(subjects: ExamSubject[], strategy: "admin" | "user"): Array<{
  subjectName: string;
  questionNo: number;
  answer: number;
}> {
  const rows: Array<{ subjectName: string; questionNo: number; answer: number }> = [];
  for (const subject of subjects) {
    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      const correctAnswer = ((questionNo - 1) % 4) + 1;
      const answer =
        strategy === "admin"
          ? correctAnswer
          : (() => {
              if (questionNo % 5 !== 0) {
                return correctAnswer;
              }
              return (correctAnswer % 4) + 1;
            })();
      rows.push({
        subjectName: subject.name,
        questionNo,
        answer,
      });
    }
  }
  return rows;
}

async function updateAdminSiteSettings(
  client: HttpClient,
  settings: Record<string, unknown>
): Promise<void> {
  const response = await client.requestJson("/api/admin/site?section=features", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  assertCondition(response.status === 200, `PUT /api/admin/site failed: ${response.status}`);
}

async function restoreSiteSettings(client: HttpClient): Promise<void> {
  const settings: Record<string, unknown> = {};

  if (originalFinalPredictionSetting !== undefined) {
    settings["site.finalPredictionEnabled"] = originalFinalPredictionSetting;
  }
  if (originalAnswerInputSetting !== undefined) {
    settings["site.answerInputEnabled"] = originalAnswerInputSetting;
  }
  if (originalPreRegistrationSetting !== undefined) {
    settings["site.preRegistrationEnabled"] = originalPreRegistrationSetting;
  }

  if (Object.keys(settings).length < 1) {
    return;
  }

  await updateAdminSiteSettings(client, settings);
}

async function setTenant(client: HttpClient, tenant: DivisionTenant): Promise<void> {
  const response = await client.request(`/${tenant}`);
  assertCondition([200, 307].includes(response.status), `Failed to set tenant=${tenant}. status=${response.status}`);
}

async function login(client: HttpClient, phone: string, password: string): Promise<Record<string, JsonValue>> {
  const csrf = await client.requestJson("/api/auth/csrf");
  assertCondition(csrf.status === 200, `Failed to fetch CSRF token. status=${csrf.status}`);
  const csrfBody = asRecord(csrf.json, "csrf body");
  const csrfToken = asString(csrfBody.csrfToken ?? null, "csrfToken");

  const params = new URLSearchParams();
  params.set("csrfToken", csrfToken);
  params.set("phone", phone);
  params.set("password", password);
  params.set("callbackUrl", `${BASE_URL}/exam/main`);
  params.set("json", "true");

  const signInResponse = await client.request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (![200, 302].includes(signInResponse.status)) {
    const bodyText = await signInResponse.text();
    throw new Error(`Sign-in failed. status=${signInResponse.status}, body=${bodyText.slice(0, 300)}`);
  }

  const session = await client.requestJson("/api/auth/session");
  assertCondition(session.status === 200, `Session request failed: status=${session.status}`);
  const sessionBody = asRecord(session.json, "session body");
  const user = asRecord(sessionBody.user ?? null, "session user");
  return user;
}

async function loginAdminForTenant(
  client: HttpClient,
  tenant: DivisionTenant,
  phone: string,
  password: string
): Promise<Record<string, JsonValue>> {
  await setTenant(client, tenant);

  const csrf = await client.requestJson("/api/auth/csrf");
  assertCondition(csrf.status === 200, `Failed to fetch CSRF token for ${tenant}. status=${csrf.status}`);
  const csrfBody = asRecord(csrf.json, "csrf body");
  const csrfToken = asString(csrfBody.csrfToken ?? null, "csrfToken");

  const params = new URLSearchParams();
  params.set("csrfToken", csrfToken);
  params.set("password", password);
  params.set("callbackUrl", `${BASE_URL}/${tenant}/admin`);
  params.set("json", "true");

  if (tenant === "police") {
    params.set("username", phone);
    params.set("adminOnly", "true");
  } else {
    params.set("phone", phone);
  }

  const signInResponse = await client.request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (![200, 302].includes(signInResponse.status)) {
    const bodyText = await signInResponse.text();
    throw new Error(
      `Tenant admin sign-in failed for ${tenant}. status=${signInResponse.status}, body=${bodyText.slice(0, 300)}`
    );
  }

  const session = await client.requestJson("/api/auth/session");
  assertCondition(session.status === 200, `Tenant session request failed for ${tenant}: status=${session.status}`);
  const sessionBody = asRecord(session.json, "session body");
  const user = asRecord(sessionBody.user ?? null, "session user");
  return user;
}

async function main(): Promise<void> {
  const anonymous = new HttpClient("anonymous");
  const admin = new HttpClient("admin");
  const user = new HttpClient("user");

  let activeExamId = 0;
  let publicSubjects: ExamSubject[] = [];
  let chosenRegion: ExamRegion | null = null;
  let examNumber = "";
  let releaseNumberForCreate: number | null = 1;

  await runStep("Start app server", async () => {
    await startServer();
    return `${BASE_URL} (${SERVER_MODE})`;
  });

  await runStep("Public API health checks", async () => {
    const endpoints = [
      "/api/terms",
      "/api/site-settings",
      "/api/notices",
      "/api/faqs",
      "/api/events",
      "/api/banners",
    ];
    for (const endpoint of endpoints) {
      const response = await anonymous.request(endpoint);
      assertCondition(response.status === 200, `${endpoint} expected 200, got ${response.status}`);
    }
    return `${endpoints.length} endpoints`;
  });

  await runStep("Admin login", async () => {
    const adminUser = await login(admin, ADMIN_PHONE, ADMIN_PASSWORD);
    const role = asString(adminUser.role ?? null, "admin role");
    assertCondition(role === "ADMIN", `Expected ADMIN role, got ${role}`);
    return asString(adminUser.phone ?? null, "admin phone");
  });

  await runStep("Tenant-scoped site content isolation", async () => {
    const fireAdmin = new HttpClient("fire-admin");
    const policeAdmin = new HttpClient("police-admin");
    const firePublic = new HttpClient("fire-public");
    const policePublic = new HttpClient("police-public");
    let fireNoticeId: number | null = null;
    let policeFaqId: number | null = null;
    let fireBannerId: number | null = null;
    let policeEventId: number | null = null;

    try {
      await setTenant(firePublic, "fire");
      await setTenant(policePublic, "police");
      const fireSession = await loginAdminForTenant(fireAdmin, "fire", ADMIN_PHONE, ADMIN_PASSWORD);
      assertCondition(asString(fireSession.role ?? null, "fire admin role") === "ADMIN", "Fire admin login failed");
      const policeSession = await loginAdminForTenant(policeAdmin, "police", ADMIN_PHONE, ADMIN_PASSWORD);
      assertCondition(asString(policeSession.role ?? null, "police admin role") === "ADMIN", "Police admin login failed");

      const fireNoticeTitle = `E2E Fire Notice ${RUN_ID}`;
      const policeFaqQuestion = `E2E Police FAQ ${RUN_ID}?`;

      const createNotice = await fireAdmin.requestJson("/api/admin/notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: fireNoticeTitle,
          content: "Fire only notice",
          isActive: true,
          priority: 88,
        }),
      });
      assertCondition(createNotice.status === 201, `POST /api/admin/notices failed: ${createNotice.status}`);
      const createdNoticeBody = asRecord(createNotice.json, "fire notice create");
      const createdNotice = asRecord(createdNoticeBody.notice ?? null, "fire notice");
      fireNoticeId = asNumber(createdNotice.id ?? null, "fire notice id");

      const createFaq = await policeAdmin.requestJson("/api/admin/faqs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: policeFaqQuestion,
          answer: "Police only FAQ",
          isActive: true,
          priority: 66,
        }),
      });
      assertCondition(createFaq.status === 201, `POST /api/admin/faqs failed: ${createFaq.status}`);
      const createdFaqBody = asRecord(createFaq.json, "police faq create");
      const createdFaq = asRecord(createdFaqBody.faq ?? null, "police faq");
      policeFaqId = asNumber(createdFaq.id ?? null, "police faq id");

      const createBanner = await fireAdmin.requestJson("/api/admin/banners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone: "hero",
          htmlContent: `<div>Fire Banner ${RUN_ID}</div>`,
          altText: "fire-banner",
          isActive: true,
          sortOrder: 2,
        }),
      });
      assertCondition(createBanner.status === 201, `POST /api/admin/banners failed: ${createBanner.status}`);
      const createdBannerBody = asRecord(createBanner.json, "fire banner create");
      const createdBanner = asRecord(createdBannerBody.banner ?? null, "fire banner");
      fireBannerId = asNumber(createdBanner.id ?? null, "fire banner id");

      const createEventForm = new FormData();
      createEventForm.set("title", `Police Event ${RUN_ID}`);
      createEventForm.set("description", "Police only event");
      createEventForm.set("isActive", "true");
      createEventForm.set("sortOrder", "3");
      createEventForm.set("bgColor", "#ffffff");
      const createEvent = await policeAdmin.requestJson("/api/admin/events", {
        method: "POST",
        body: createEventForm,
      });
      assertCondition(createEvent.status === 201, `POST /api/admin/events failed: ${createEvent.status}`);
      const createdEventBody = asRecord(createEvent.json, "police event create");
      const createdEvent = asRecord(createdEventBody.event ?? null, "police event");
      policeEventId = asNumber(createdEvent.id ?? null, "police event id");

      const fireNoticesList = await fireAdmin.requestJson("/api/admin/notices");
      const fireNotices = asArray(asRecord(fireNoticesList.json, "fire notices").notices ?? null, "fire notices");
      assertCondition(
        fireNotices.some((item) => asString(asRecord(item as JsonValue, "fire notice item").title ?? null, "fire notice title") === fireNoticeTitle),
        "Fire notice missing from fire admin list"
      );

      const policeNoticesList = await policeAdmin.requestJson("/api/admin/notices");
      const policeNotices = asArray(asRecord(policeNoticesList.json, "police notices").notices ?? null, "police notices");
      assertCondition(
        !policeNotices.some((item) => asString(asRecord(item as JsonValue, "police notice item").title ?? null, "police notice title") === fireNoticeTitle),
        "Fire notice leaked into police admin list"
      );

      const firePublicNotices = await waitForJsonCondition(
        firePublic,
        withDivisionPath("fire", "/api/notices"),
        (json) =>
          asArray(asRecord(json, "fire public notices").notices ?? null, "fire public notices").some(
            (item) => asString(asRecord(item as JsonValue, "fire public notice").title ?? null, "fire public notice title") === fireNoticeTitle
          ),
        "Fire notice missing from fire public API"
      );
      asArray(asRecord(firePublicNotices, "fire public notices").notices ?? null, "fire public notices");

      const policePublicNotices = await waitForJsonCondition(
        policePublic,
        withDivisionPath("police", "/api/notices"),
        (json) =>
          !asArray(asRecord(json, "police public notices").notices ?? null, "police public notices").some(
            (item) => asString(asRecord(item as JsonValue, "police public notice").title ?? null, "police public notice title") === fireNoticeTitle
          ),
        "Fire notice leaked into police public API"
      );
      asArray(asRecord(policePublicNotices, "police public notices").notices ?? null, "police public notices");

      const fireFaqsList = await fireAdmin.requestJson("/api/admin/faqs");
      const fireFaqs = asArray(asRecord(fireFaqsList.json, "fire faqs").faqs ?? null, "fire faqs");
      assertCondition(
        !fireFaqs.some((item) => asString(asRecord(item as JsonValue, "fire faq item").question ?? null, "fire faq question") === policeFaqQuestion),
        "Police FAQ leaked into fire admin list"
      );

      const policeFaqsList = await policeAdmin.requestJson("/api/admin/faqs");
      const policeFaqs = asArray(asRecord(policeFaqsList.json, "police faqs").faqs ?? null, "police faqs");
      assertCondition(
        policeFaqs.some((item) => asString(asRecord(item as JsonValue, "police faq item").question ?? null, "police faq question") === policeFaqQuestion),
        "Police FAQ missing from police admin list"
      );

      const firePublicFaqs = await waitForJsonCondition(
        firePublic,
        withDivisionPath("fire", "/api/faqs"),
        (json) =>
          !asArray(asRecord(json, "fire public faqs").faqs ?? null, "fire public faqs").some(
            (item) => asString(asRecord(item as JsonValue, "fire public faq").question ?? null, "fire public faq question") === policeFaqQuestion
          ),
        "Police FAQ leaked into fire public API"
      );
      asArray(asRecord(firePublicFaqs, "fire public faqs").faqs ?? null, "fire public faqs");

      const policePublicFaqs = await waitForJsonCondition(
        policePublic,
        withDivisionPath("police", "/api/faqs"),
        (json) =>
          asArray(asRecord(json, "police public faqs").faqs ?? null, "police public faqs").some(
            (item) => asString(asRecord(item as JsonValue, "police public faq").question ?? null, "police public faq question") === policeFaqQuestion
          ),
        "Police FAQ missing from police public API"
      );
      asArray(asRecord(policePublicFaqs, "police public faqs").faqs ?? null, "police public faqs");

      const firePublicBanners = await waitForJsonCondition(
        firePublic,
        withDivisionPath("fire", "/api/banners"),
        (json) =>
          asArray(asRecord(json, "fire banners").banners ?? null, "fire banners").some(
            (item) => asNumber(asRecord(item as JsonValue, "fire banner item").id ?? null, "fire banner item id") === fireBannerId
          ),
        "Fire banner missing from fire public API"
      );
      asArray(asRecord(firePublicBanners, "fire banners").banners ?? null, "fire banners");

      const policePublicBanners = await waitForJsonCondition(
        policePublic,
        withDivisionPath("police", "/api/banners"),
        (json) =>
          !asArray(asRecord(json, "police banners").banners ?? null, "police banners").some(
            (item) => asNumber(asRecord(item as JsonValue, "police banner item").id ?? null, "police banner item id") === fireBannerId
          ),
        "Fire banner leaked into police public API"
      );
      asArray(asRecord(policePublicBanners, "police banners").banners ?? null, "police banners");

      const firePublicEvents = await waitForJsonCondition(
        firePublic,
        withDivisionPath("fire", "/api/events"),
        (json) =>
          !asArray(asRecord(json, "fire events").events ?? null, "fire events").some(
            (item) => asNumber(asRecord(item as JsonValue, "fire event item").id ?? null, "fire event item id") === policeEventId
          ),
        "Police event leaked into fire public API"
      );
      asArray(asRecord(firePublicEvents, "fire events").events ?? null, "fire events");

      const policePublicEvents = await waitForJsonCondition(
        policePublic,
        withDivisionPath("police", "/api/events"),
        (json) =>
          asArray(asRecord(json, "police events").events ?? null, "police events").some(
            (item) => asNumber(asRecord(item as JsonValue, "police event item").id ?? null, "police event item id") === policeEventId
          ),
        "Police event missing from police public API"
      );
      asArray(asRecord(policePublicEvents, "police events").events ?? null, "police events");

      return "notice/faq/banner/event isolation verified";
    } finally {
      if (fireNoticeId) {
        await fireAdmin.request(`/api/admin/notices?id=${fireNoticeId}`, { method: "DELETE" });
      }
      if (policeFaqId) {
        await policeAdmin.request(`/api/admin/faqs?id=${policeFaqId}`, { method: "DELETE" });
      }
      if (fireBannerId) {
        await fireAdmin.request(`/api/admin/banners?id=${fireBannerId}`, { method: "DELETE" });
      }
      if (policeEventId) {
        await policeAdmin.request(`/api/admin/events?id=${policeEventId}`, { method: "DELETE" });
      }
    }
  });

  await runStep("Read admin site settings", async () => {
    const settingsResponse = await admin.requestJson("/api/admin/site");
    assertCondition(settingsResponse.status === 200, `GET /api/admin/site failed: ${settingsResponse.status}`);
    const body = asRecord(settingsResponse.json, "admin site response");
    const settings = asRecord(body.settings ?? null, "admin site settings");
    originalFinalPredictionSetting = settings["site.finalPredictionEnabled"];
    originalAnswerInputSetting = settings["site.answerInputEnabled"];
    originalPreRegistrationSetting = settings["site.preRegistrationEnabled"];
    return "settings loaded";
  });

  await runStep("Enable E2E-required site settings", async () => {
    await updateAdminSiteSettings(admin, {
      "site.finalPredictionEnabled": true,
      "site.commentsEnabled": true,
      "site.answerInputEnabled": true,
      "site.preRegistrationEnabled": true,
    });
    return "finalPredictionEnabled/comments/answerInput/preRegistration=true";
  });

  await runStep("Register new test user", async () => {
    const response = await anonymous.requestJson("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: USER_NAME,
        phone: USER_PHONE,
        password: USER_PASSWORD,
        agreedToTerms: true,
        agreedToPrivacy: true,
      }),
    });
    assertCondition(response.status === 201, `Register failed. status=${response.status}`);
    return USER_PHONE;
  });

  await runStep("User login", async () => {
    const userSession = await login(user, USER_PHONE, USER_PASSWORD);
    return asString(userSession.phone ?? null, "user phone");
  });

  await runStep("Load exam metadata for submission", async () => {
    const response = await user.requestJson("/api/exams?active=true");
    assertCondition(response.status === 200, `GET /api/exams failed: ${response.status}`);
    const body = asRecord(response.json, "exams response");
    const activeExam = asRecord(body.activeExam ?? null, "activeExam");
    activeExamId = asNumber(activeExam.id ?? null, "activeExam.id");

    const subjectGroups = asRecord(body.subjectGroups ?? null, "subjectGroups");
    const publicSubjectsRaw = asArray(subjectGroups.PUBLIC ?? null, "subjectGroups.PUBLIC");
    publicSubjects = publicSubjectsRaw.map((item, index) => {
      const row = asRecord(item as JsonValue, `PUBLIC subject ${index}`);
      return {
        id: asNumber(row.id ?? null, `subject.id[${index}]`),
        name: asString(row.name ?? null, `subject.name[${index}]`),
        questionCount: asNumber(row.questionCount ?? null, `subject.questionCount[${index}]`),
        pointPerQuestion: asNumber(row.pointPerQuestion ?? null, `subject.pointPerQuestion[${index}]`),
        maxScore: asNumber(row.maxScore ?? null, `subject.maxScore[${index}]`),
      };
    });
    assertCondition(publicSubjects.length > 0, "No PUBLIC subjects found");

    const regionsRaw = asArray(body.regions ?? null, "regions");
    const regions: ExamRegion[] = regionsRaw.map((item, index) => {
      const row = asRecord(item as JsonValue, `region[${index}]`);
      return {
        id: asNumber(row.id ?? null, `region.id[${index}]`),
        name: asString(row.name ?? null, `region.name[${index}]`),
        isActive: asBoolean(row.isActive ?? null, `region.isActive[${index}]`),
        recruitPublicMale: asNumber(row.recruitPublicMale ?? null, `region.recruitPublicMale[${index}]`),
        recruitPublicFemale: asNumber(row.recruitPublicFemale ?? null, `region.recruitPublicFemale[${index}]`),
        recruitRescue: asNumber(row.recruitRescue ?? null, `region.recruitRescue[${index}]`),
        recruitAcademicMale: asNumber(row.recruitAcademicMale ?? null, `region.recruitAcademicMale[${index}]`),
        recruitAcademicFemale: asNumber(row.recruitAcademicFemale ?? null, `region.recruitAcademicFemale[${index}]`),
        recruitAcademicCombined: asNumber(row.recruitAcademicCombined ?? null, `region.recruitAcademicCombined[${index}]`),
        recruitEmtMale: asNumber(row.recruitEmtMale ?? null, `region.recruitEmtMale[${index}]`),
        recruitEmtFemale: asNumber(row.recruitEmtFemale ?? null, `region.recruitEmtFemale[${index}]`),
      };
    });

    chosenRegion = regions.find((row) => row.isActive && row.recruitPublicMale > 0) ?? null;
    assertCondition(chosenRegion, "No valid PUBLIC MALE region found");

    return `examId=${activeExamId}, region=${chosenRegion.name}, subjects=${publicSubjects.length}`;
  });

  await runStep("Seed PUBLIC answer keys via admin", async () => {
    const answerRows = buildAnswerRows(publicSubjects, "admin");

    const previewResponse = await admin.requestJson("/api/admin/answers/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        examType: "PUBLIC",
        isConfirmed: true,
        answers: answerRows,
      }),
    });
    assertCondition(previewResponse.status === 200, `Answer preview failed: ${previewResponse.status}`);

    const saveResponse = await admin.requestJson("/api/admin/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        examType: "PUBLIC",
        isConfirmed: true,
        reason: "E2E answer-key sync",
        answers: answerRows,
      }),
    });
    assertCondition([200, 201].includes(saveResponse.status), `Answer save failed: ${saveResponse.status}`);

    const logsResponse = await admin.requestJson(`/api/admin/answers/logs?examId=${activeExamId}&examType=PUBLIC&limit=10`);
    assertCondition(logsResponse.status === 200, `Answer logs failed: ${logsResponse.status}`);
    return `rows=${answerRows.length}`;
  });

  await runStep("Generate valid exam number + duplicate check", async () => {
    assertCondition(chosenRegion, "Region is not selected");
    const chosenRegionId = chosenRegion.id;
    const regionMetaResponse = await admin.requestJson(`/api/admin/regions?examId=${activeExamId}`);
    assertCondition(regionMetaResponse.status === 200, `GET /api/admin/regions failed: ${regionMetaResponse.status}`);
    const regionMetaBody = asRecord(regionMetaResponse.json, "admin regions response");
    const adminRegionsRaw = asArray(regionMetaBody.regions ?? null, "admin regions list");
    const adminRegion = adminRegionsRaw
      .map((item) => asRecord(item as JsonValue, "admin region row"))
      .find((row) => asNumber(row.id ?? null, "admin region id") === chosenRegionId);
    assertCondition(adminRegion, `Region metadata not found for regionId=${chosenRegionId}`);

    const examNumberRange: ExamNumberRange = {
      start: asNullableString(adminRegion.examNumberStartPublicMale ?? null, "examNumberStartPublicMale"),
      end: asNullableString(adminRegion.examNumberEndPublicMale ?? null, "examNumberEndPublicMale"),
    };

    let available = false;
    let lastReason = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      examNumber = buildExamNumberCandidate({
        examType: "PUBLIC",
        gender: "MALE",
        range: examNumberRange,
      });
      const query = new URLSearchParams({
        examId: String(activeExamId),
        regionId: String(chosenRegionId),
        examType: "PUBLIC",
        gender: "MALE",
        examNumber,
      });
      const response = await user.requestJson(`/api/exam-number/check?${query.toString()}`);
      assertCondition(response.status === 200, `Exam number check failed: ${response.status}`);
      const body = asRecord(response.json, "exam number check");
      available = asBoolean(body.available ?? null, "available");
      lastReason = asNullableString(body.reason ?? null, "reason") ?? "";
      if (available) break;
    }
    assertCondition(available, `Failed to find available exam number${lastReason ? `: ${lastReason}` : ""}`);
    return examNumber;
  });

  await runStep("Feature gate rejects submission API when answer input is disabled", async () => {
    assertCondition(chosenRegion, "Region is not selected");

    await updateAdminSiteSettings(admin, {
      "site.answerInputEnabled": false,
    });

    const answerRows = buildAnswerRows(publicSubjects, "user");
    const difficulty = publicSubjects.map((subject) => ({
      subjectName: subject.name,
      rating: "NORMAL",
    }));

    const response = await user.requestJson("/api/submission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        examType: "PUBLIC",
        gender: "MALE",
        regionId: chosenRegion.id,
        examNumber,
        submitDurationMs: 130_000,
        answers: answerRows,
        difficulty,
      }),
    });

    assertCondition(response.status === 403, `Expected 403 from /api/submission, got ${response.status}`);
    const body = asRecord(response.json, "submission feature gate response");
    const error = asString(body.error ?? null, "submission feature gate error");
    assertCondition(error.length > 0, "Disabled submission response should include an error message");

    await updateAdminSiteSettings(admin, {
      "site.answerInputEnabled": true,
    });

    return `status=${response.status}`;
  });

  if (TENANT_TYPE === "police") {
    await runStep("Feature gate rejects pre-registration API when pre-registration is disabled", async () => {
      assertCondition(chosenRegion, "Region is not selected");

      await updateAdminSiteSettings(admin, {
        "site.preRegistrationEnabled": false,
      });

      const response = await user.requestJson("/api/pre-registration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          examId: activeExamId,
          examType: "PUBLIC",
          gender: "MALE",
          regionId: chosenRegion.id,
          examNumber,
        }),
      });

      assertCondition(
        response.status === 403,
        `Expected 403 from /api/pre-registration, got ${response.status}`
      );
      const body = asRecord(response.json, "pre-registration feature gate response");
      const error = asString(body.error ?? null, "pre-registration feature gate error");
      assertCondition(error.length > 0, "Disabled pre-registration response should include an error message");

      await updateAdminSiteSettings(admin, {
        "site.preRegistrationEnabled": true,
      });

      return `status=${response.status}`;
    });
  }

  await runStep("Create submission (user input flow)", async () => {
    assertCondition(chosenRegion, "Region is not selected");
    const answerRows = buildAnswerRows(publicSubjects, "user");
    const difficulty = publicSubjects.map((subject) => ({
      subjectName: subject.name,
      rating: "NORMAL",
    }));

    const response = await user.requestJson("/api/submission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        examType: "PUBLIC",
        gender: "MALE",
        regionId: chosenRegion.id,
        examNumber,
        bonusType: "NONE",
        certificateBonus: 0,
        submitDurationMs: 135000,
        difficulty,
        answers: answerRows,
      }),
    });

    assertCondition([200, 201].includes(response.status), `Submission create failed: ${response.status}`);
    const body = asRecord(response.json, "submission create body");
    createdSubmissionId = asNumber(body.submissionId ?? null, "submissionId");
    return `submissionId=${createdSubmissionId}`;
  });

  await runStep("Edit submission (user correction flow)", async () => {
    assertCondition(createdSubmissionId, "No submissionId");
    assertCondition(chosenRegion, "Region is not selected");
    const answerRows = buildAnswerRows(publicSubjects, "user");
    if (answerRows.length > 0) {
      answerRows[0] = { ...answerRows[0], answer: 1 };
    }

    const response = await user.requestJson("/api/submission", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: createdSubmissionId,
        examId: activeExamId,
        examType: "PUBLIC",
        gender: "MALE",
        regionId: chosenRegion.id,
        examNumber,
        bonusType: "NONE",
        certificateBonus: 0,
        submitDurationMs: 146000,
        difficulty: publicSubjects.map((subject) => ({ subjectName: subject.name, rating: "HARD" })),
        answers: answerRows,
      }),
    });

    assertCondition(response.status === 200, `Submission edit failed: ${response.status}`);
    return `submissionId=${createdSubmissionId}`;
  });

  await runStep("Result + analytics endpoints", async () => {
    assertCondition(createdSubmissionId, "No submissionId");
    const endpoints = [
      `/api/result?submissionId=${createdSubmissionId}`,
      `/api/analysis/subject-stats?submissionId=${createdSubmissionId}`,
      `/api/analysis/score-distribution?submissionId=${createdSubmissionId}`,
      `/api/analysis/answer-change-impact?submissionId=${createdSubmissionId}`,
      `/api/analysis/wrong-rate-top?submissionId=${createdSubmissionId}`,
      `/api/difficulty?examId=${activeExamId}`,
      `/api/prediction?submissionId=${createdSubmissionId}`,
      `/api/prediction/competitor?submissionId=${createdSubmissionId}&baseSubmissionId=${createdSubmissionId}`,
      `/api/pass-cut-history?examId=${activeExamId}&regionId=${chosenRegion?.id ?? 0}&examType=PUBLIC&gender=MALE`,
      `/api/share/data?submissionId=${createdSubmissionId}`,
    ];

    for (const endpoint of endpoints) {
      const response = await user.request(endpoint);
      if (response.status !== 200) {
        const body = await response.text();
        throw new Error(`${endpoint} expected 200, got ${response.status}, body=${body.slice(0, 400)}`);
      }
    }

    const ogImageResponse = await user.request(
      `/api/share/og-image?examTitle=E2E&userName=Tester&examTypeLabel=PUBLIC&regionName=TEST&finalScore=123.45&rank=1&totalParticipants=10`
    );
    assertCondition(ogImageResponse.status === 200, `OG image expected 200, got ${ogImageResponse.status}`);

    return `${endpoints.length + 1} endpoints`;
  });

  await runStep("Comments flow (create/list/delete)", async () => {
    const listBefore = await user.requestJson("/api/comments?page=1&limit=20");
    assertCondition(listBefore.status === 200, `GET /api/comments failed: ${listBefore.status}`);

    const created = await user.requestJson("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `E2E comment ${RUN_ID}` }),
    });
    assertCondition(created.status === 200, `POST /api/comments failed: ${created.status}`);
    const createdBody = asRecord(created.json, "created comment response");
    const comment = asRecord(createdBody.comment ?? null, "created comment");
    createdCommentId = asNumber(comment.id ?? null, "created comment id");

    const incremental = await user.request(`/api/comments?after=${Math.max(0, createdCommentId - 1)}`);
    assertCondition(incremental.status === 200, `GET /api/comments?after failed: ${incremental.status}`);

    const deleted = await user.requestJson(`/api/comments?id=${createdCommentId}`, { method: "DELETE" });
    assertCondition(deleted.status === 200, `DELETE /api/comments failed: ${deleted.status}`);

    return `commentId=${createdCommentId}`;
  });

  await runStep("Final prediction flow", async () => {
    assertCondition(createdSubmissionId, "No submissionId");

    const getBefore = await user.request(`/api/final-prediction?submissionId=${createdSubmissionId}`);
    assertCondition(getBefore.status === 200, `GET /api/final-prediction failed: ${getBefore.status}`);

    const saved = await user.requestJson("/api/final-prediction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: createdSubmissionId,
        fitnessRawScore: 41.5,
        certificateBonus: 2,
      }),
    });
    assertCondition(saved.status === 200, `POST /api/final-prediction failed: ${saved.status}`);

    const getAfter = await user.request(`/api/final-prediction?submissionId=${createdSubmissionId}`);
    assertCondition(getAfter.status === 200, `GET /api/final-prediction after save failed: ${getAfter.status}`);

    return `submissionId=${createdSubmissionId}`;
  });

  await runStep("Admin exam CRUD + region copy", async () => {
    const examList = await admin.requestJson("/api/admin/exam?feature=exams");
    assertCondition(examList.status === 200, `GET /api/admin/exam?feature=exams failed: ${examList.status}`);
    const examListBody = asRecord(examList.json, "exam list body");
    const exams = asArray(examListBody.exams ?? null, "exam list");
    const usedYearRoundPairs = new Set(
      exams.map((exam, index) => {
        const row = asRecord(exam, `exam[${index}]`);
        const year = asNumber(row.year ?? null, `exam[${index}].year`);
        const round = asNumber(row.round ?? null, `exam[${index}].round`);
        return `${year}:${round}`;
      })
    );

    let year = 2099;
    let round = 1;
    let foundAvailablePair = false;
    for (let candidateYear = 2099; candidateYear >= 2000; candidateYear -= 1) {
      for (let candidateRound = 1; candidateRound <= 20; candidateRound += 1) {
        if (usedYearRoundPairs.has(`${candidateYear}:${candidateRound}`)) {
          continue;
        }

        year = candidateYear;
        round = candidateRound;
        foundAvailablePair = true;
        break;
      }

      if (foundAvailablePair) {
        break;
      }
    }

    assertCondition(foundAvailablePair, "Could not find an unused exam year/round pair");

    const createExam = await admin.requestJson("/api/admin/exam", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `E2E Exam ${RUN_ID}`,
        year,
        round,
        examDate: "2099-03-01T01:00:00.000Z",
        isActive: false,
      }),
    });

    assertCondition([200, 201].includes(createExam.status), `POST /api/admin/exam failed: ${createExam.status}`);
    const createBody = asRecord(createExam.json, "create exam body");
    const createdExam = asRecord(createBody.exam ?? null, "created exam");
    createdExamId = asNumber(createdExam.id ?? null, "created exam id");

    const updateExam = await admin.requestJson(`/api/admin/exam?id=${createdExamId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `E2E Exam ${RUN_ID} Updated` }),
    });
    assertCondition(updateExam.status === 200, `PUT /api/admin/exam failed: ${updateExam.status}`);

    const copyRegions = await admin.requestJson("/api/admin/regions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceExamId: activeExamId,
        targetExamId: createdExamId,
      }),
    });
    assertCondition(copyRegions.status === 200, `POST /api/admin/regions copy failed: ${copyRegions.status}`);

    return `createdExamId=${createdExamId}`;
  });

  await runStep("Admin regions GET/PUT", async () => {
    const getResponse = await admin.requestJson(`/api/admin/regions?examId=${activeExamId}`);
    assertCondition(getResponse.status === 200, `GET /api/admin/regions failed: ${getResponse.status}`);
    const body = asRecord(getResponse.json, "regions payload");
    const regions = asArray(body.regions ?? null, "regions list");
    assertCondition(regions.length > 0, "No regions from admin/regions");

    const firstRegion = asRecord(regions[0] as JsonValue, "first region");
    const regionPayload = {
      regionId: asNumber(firstRegion.id ?? null, "region.id"),
      isActive: asBoolean(firstRegion.isActive ?? null, "region.isActive"),
      recruitPublicMale: asNumber(firstRegion.recruitPublicMale ?? null, "recruitPublicMale"),
      recruitPublicFemale: asNumber(firstRegion.recruitPublicFemale ?? null, "recruitPublicFemale"),
      recruitRescue: asNumber(firstRegion.recruitRescue ?? null, "recruitRescue"),
      recruitAcademicMale: asNumber(firstRegion.recruitAcademicMale ?? null, "recruitAcademicMale"),
      recruitAcademicFemale: asNumber(firstRegion.recruitAcademicFemale ?? null, "recruitAcademicFemale"),
      recruitAcademicCombined: asNumber(firstRegion.recruitAcademicCombined ?? null, "recruitAcademicCombined"),
      recruitEmtMale: asNumber(firstRegion.recruitEmtMale ?? null, "recruitEmtMale"),
      recruitEmtFemale: asNumber(firstRegion.recruitEmtFemale ?? null, "recruitEmtFemale"),
      applicantPublicMale: firstRegion.applicantPublicMale,
      applicantPublicFemale: firstRegion.applicantPublicFemale,
      applicantRescue: firstRegion.applicantRescue,
      applicantAcademicMale: firstRegion.applicantAcademicMale,
      applicantAcademicFemale: firstRegion.applicantAcademicFemale,
      applicantAcademicCombined: firstRegion.applicantAcademicCombined,
      applicantEmtMale: firstRegion.applicantEmtMale,
      applicantEmtFemale: firstRegion.applicantEmtFemale,
      examNumberStartPublicMale: firstRegion.examNumberStartPublicMale,
      examNumberEndPublicMale: firstRegion.examNumberEndPublicMale,
      examNumberStartPublicFemale: firstRegion.examNumberStartPublicFemale,
      examNumberEndPublicFemale: firstRegion.examNumberEndPublicFemale,
      examNumberStartCareerRescue: firstRegion.examNumberStartCareerRescue,
      examNumberEndCareerRescue: firstRegion.examNumberEndCareerRescue,
      examNumberStartCareerAcademicMale: firstRegion.examNumberStartCareerAcademicMale,
      examNumberEndCareerAcademicMale: firstRegion.examNumberEndCareerAcademicMale,
      examNumberStartCareerAcademicFemale: firstRegion.examNumberStartCareerAcademicFemale,
      examNumberEndCareerAcademicFemale: firstRegion.examNumberEndCareerAcademicFemale,
      examNumberStartCareerAcademicCombined: firstRegion.examNumberStartCareerAcademicCombined,
      examNumberEndCareerAcademicCombined: firstRegion.examNumberEndCareerAcademicCombined,
      examNumberStartCareerEmtMale: firstRegion.examNumberStartCareerEmtMale,
      examNumberEndCareerEmtMale: firstRegion.examNumberEndCareerEmtMale,
      examNumberStartCareerEmtFemale: firstRegion.examNumberStartCareerEmtFemale,
      examNumberEndCareerEmtFemale: firstRegion.examNumberEndCareerEmtFemale,
    };

    const putResponse = await admin.requestJson("/api/admin/regions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        regions: [regionPayload],
      }),
    });
    assertCondition(putResponse.status === 200, `PUT /api/admin/regions failed: ${putResponse.status}`);

    return `regionId=${regionPayload.regionId}`;
  });

  await runStep("Admin notices CRUD", async () => {
    const create = await admin.requestJson("/api/admin/notices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `E2E Notice ${RUN_ID}`,
        content: "E2E notice content",
        isActive: true,
        priority: 77,
      }),
    });
    assertCondition(create.status === 201, `POST /api/admin/notices failed: ${create.status}`);
    const createBody = asRecord(create.json, "notice create");
    const created = asRecord(createBody.notice ?? null, "notice");
    createdNoticeId = asNumber(created.id ?? null, "notice id");

    const update = await admin.requestJson(`/api/admin/notices?id=${createdNoticeId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `E2E Notice ${RUN_ID} Updated` }),
    });
    assertCondition(update.status === 200, `PUT /api/admin/notices failed: ${update.status}`);

    const list = await admin.request("/api/admin/notices");
    assertCondition(list.status === 200, `GET /api/admin/notices failed: ${list.status}`);

    const remove = await admin.requestJson(`/api/admin/notices?id=${createdNoticeId}`, { method: "DELETE" });
    assertCondition(remove.status === 200, `DELETE /api/admin/notices failed: ${remove.status}`);
    createdNoticeId = null;
    return "ok";
  });

  await runStep("Admin FAQs CRUD", async () => {
    const create = await admin.requestJson("/api/admin/faqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: `E2E FAQ ${RUN_ID}?`,
        answer: "E2E FAQ answer",
        isActive: true,
        priority: 55,
      }),
    });
    assertCondition(create.status === 201, `POST /api/admin/faqs failed: ${create.status}`);
    const createBody = asRecord(create.json, "faq create");
    const faq = asRecord(createBody.faq ?? null, "faq");
    createdFaqId = asNumber(faq.id ?? null, "faq id");

    const update = await admin.requestJson(`/api/admin/faqs?id=${createdFaqId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer: "E2E FAQ answer updated",
      }),
    });
    assertCondition(update.status === 200, `PUT /api/admin/faqs failed: ${update.status}`);

    const list = await admin.request("/api/admin/faqs");
    assertCondition(list.status === 200, `GET /api/admin/faqs failed: ${list.status}`);

    const remove = await admin.requestJson(`/api/admin/faqs?id=${createdFaqId}`, { method: "DELETE" });
    assertCondition(remove.status === 200, `DELETE /api/admin/faqs failed: ${remove.status}`);
    createdFaqId = null;
    return "ok";
  });

  await runStep("Admin events CRUD + reorder", async () => {
    const createForm = new FormData();
    createForm.set("title", `E2E Event ${RUN_ID}`);
    createForm.set("description", "E2E event");
    createForm.set("isActive", "true");
    createForm.set("sortOrder", "0");
    createForm.set("bgColor", "#ffffff");

    const create = await admin.requestJson("/api/admin/events", {
      method: "POST",
      body: createForm,
    });
    assertCondition(create.status === 201, `POST /api/admin/events failed: ${create.status}`);
    const createBody = asRecord(create.json, "event create");
    const event = asRecord(createBody.event ?? null, "event");
    createdEventId = asNumber(event.id ?? null, "event id");

    const updateForm = new FormData();
    updateForm.set("title", `E2E Event ${RUN_ID} Updated`);
    updateForm.set("isActive", "true");
    updateForm.set("sortOrder", "1");
    updateForm.set("bgColor", "#f5f5f5");

    const update = await admin.requestJson(`/api/admin/events?id=${createdEventId}`, {
      method: "PUT",
      body: updateForm,
    });
    assertCondition(update.status === 200, `PUT /api/admin/events failed: ${update.status}`);

    const list = await admin.requestJson("/api/admin/events");
    assertCondition(list.status === 200, `GET /api/admin/events failed: ${list.status}`);
    const listBody = asRecord(list.json, "events list");
    const events = asArray(listBody.events ?? null, "events");
    const eventIds = events
      .map((item) => asRecord(item as JsonValue, "event item"))
      .map((row) => asNumber(row.id ?? null, "event id"));

    const reorder = await admin.requestJson("/api/admin/events/reorder", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventIds }),
    });
    assertCondition(reorder.status === 200, `PUT /api/admin/events/reorder failed: ${reorder.status}`);

    const remove = await admin.requestJson(`/api/admin/events?id=${createdEventId}`, { method: "DELETE" });
    assertCondition(remove.status === 200, `DELETE /api/admin/events failed: ${remove.status}`);
    createdEventId = null;
    return "ok";
  });

  await runStep("Admin banners CRUD (HTML mode)", async () => {
    const create = await admin.requestJson("/api/admin/banners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        zone: "hero",
        htmlContent: `<div>E2E Banner ${RUN_ID}</div>`,
        altText: "e2e",
        isActive: true,
        sortOrder: 1,
      }),
    });
    assertCondition(create.status === 201, `POST /api/admin/banners failed: ${create.status}`);
    const createBody = asRecord(create.json, "banner create");
    const banner = asRecord(createBody.banner ?? null, "banner");
    createdBannerId = asNumber(banner.id ?? null, "banner id");

    const update = await admin.requestJson(`/api/admin/banners?id=${createdBannerId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        htmlContent: `<div>E2E Banner ${RUN_ID} Updated</div>`,
        isActive: true,
      }),
    });
    assertCondition(update.status === 200, `PUT /api/admin/banners failed: ${update.status}`);

    const list = await admin.request("/api/admin/banners");
    assertCondition(list.status === 200, `GET /api/admin/banners failed: ${list.status}`);

    const remove = await admin.requestJson(`/api/admin/banners?id=${createdBannerId}`, { method: "DELETE" });
    assertCondition(remove.status === 200, `DELETE /api/admin/banners failed: ${remove.status}`);
    createdBannerId = null;
    return "ok";
  });

  await runStep("Admin image upload endpoints (validation path)", async () => {
    const bannerUpload = await admin.request("/api/admin/banners/upload-image", {
      method: "POST",
      body: new FormData(),
    });
    assertCondition(bannerUpload.status === 400, `Expected 400 for empty banner image upload, got ${bannerUpload.status}`);

    const siteUpload = await admin.request("/api/admin/site/upload", {
      method: "POST",
      body: new FormData(),
    });
    assertCondition(siteUpload.status === 400, `Expected 400 for empty site upload, got ${siteUpload.status}`);
    return "validation errors ok";
  });

  await runStep("Admin users list/update + locate test user", async () => {
    const list = await admin.requestJson(`/api/admin/users?search=${encodeURIComponent(USER_PHONE)}`);
    assertCondition(list.status === 200, `GET /api/admin/users failed: ${list.status}`);
    const listBody = asRecord(list.json, "users list");
    const users = asArray(listBody.users ?? null, "users");
    assertCondition(users.length > 0, "No users found for test phone");

    const found = users
      .map((item) => asRecord(item as JsonValue, "user row"))
      .find((row) => asString(row.phone ?? null, "user phone") === USER_PHONE);
    assertCondition(found, `Test user ${USER_PHONE} not found in admin users`);
    testUserId = asNumber(found.id ?? null, "testUserId");

    const update = await admin.requestJson(`/api/admin/users?id=${testUserId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "USER",
        resetPassword: false,
      }),
    });
    assertCondition(update.status === 200, `PUT /api/admin/users failed: ${update.status}`);
    return `testUserId=${testUserId}`;
  });

  await runStep("Admin submissions list/detail", async () => {
    assertCondition(createdSubmissionId, "No submissionId");
    const list = await admin.request(`/api/admin/submissions?search=${encodeURIComponent(examNumber)}&page=1&limit=20`);
    assertCondition(list.status === 200, `GET /api/admin/submissions failed: ${list.status}`);

    const detail = await admin.request(`/api/admin/submissions/detail?id=${createdSubmissionId}`);
    assertCondition(detail.status === 200, `GET /api/admin/submissions/detail failed: ${detail.status}`);
    return `submissionId=${createdSubmissionId}`;
  });

  await runStep("Admin comments moderation", async () => {
    const createSecond = await user.requestJson("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `E2E admin-delete comment ${RUN_ID}` }),
    });
    assertCondition(createSecond.status === 200, `Failed to create second comment: ${createSecond.status}`);
    const secondBody = asRecord(createSecond.json, "second comment");
    const secondComment = asRecord(secondBody.comment ?? null, "second comment object");
    createdSecondaryCommentId = asNumber(secondComment.id ?? null, "second comment id");

    const list = await admin.request("/api/admin/comments?page=1&limit=20");
    assertCondition(list.status === 200, `GET /api/admin/comments failed: ${list.status}`);

    const remove = await admin.requestJson(`/api/admin/comments?id=${createdSecondaryCommentId}`, { method: "DELETE" });
    assertCondition(remove.status === 200, `DELETE /api/admin/comments failed: ${remove.status}`);
    createdSecondaryCommentId = null;
    return "ok";
  });

  await runStep("Admin mock data generate + reset", async () => {
    const create = await admin.requestJson("/api/admin/mock-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        publicPerRegion: 2,
        careerPerRegion: 1,
        includeEmploymentBonus: true,
        resetBeforeGenerate: true,
        includeFinalPredictionMock: true,
      }),
    });
    assertCondition(create.status === 200, `POST /api/admin/mock-data failed: ${create.status}`);

    const reset = await admin.requestJson(`/api/admin/mock-data?examId=${activeExamId}`, { method: "DELETE" });
    assertCondition(reset.status === 200, `DELETE /api/admin/mock-data failed: ${reset.status}`);
    return "generate+reset";
  });

  await runStep("Admin pass-cut release GET/POST", async () => {
    const list = await admin.requestJson(`/api/admin/pass-cut-release?examId=${activeExamId}`);
    assertCondition(list.status === 200, `GET /api/admin/pass-cut-release failed: ${list.status}`);
    const listBody = asRecord(list.json, "pass-cut list");
    const releases = asArray(listBody.releases ?? null, "pass-cut releases");
    const used = new Set(
      releases
        .map((item) => asRecord(item as JsonValue, "release row"))
        .map((row) => asNumber(row.releaseNumber ?? null, "releaseNumber"))
    );
    releaseNumberForCreate = [1, 2, 3, 4].find((value) => !used.has(value)) ?? null;

    if (releaseNumberForCreate === null) {
      return "all release slots already used";
    }

    const create = await admin.requestJson("/api/admin/pass-cut-release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        releaseNumber: releaseNumberForCreate,
        memo: "E2E auto release",
        autoNotice: false,
      }),
    });
    if (create.status === 409) {
      return `releaseNumber=${releaseNumberForCreate} already exists`;
    }

    assertCondition(create.status === 200, `POST /api/admin/pass-cut-release failed: ${create.status}`);
    return `releaseNumber=${releaseNumberForCreate}`;
  });

  await runStep("Rescore + user notifications", async () => {
    const rescore = await admin.requestJson("/api/admin/rescore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: activeExamId,
        examType: "PUBLIC",
        reason: "E2E rescore",
      }),
    });
    assertCondition(rescore.status === 200, `POST /api/admin/rescore failed: ${rescore.status}`);

    const notifications = await user.requestJson("/api/notifications/rescore");
    assertCondition(notifications.status === 200, `GET /api/notifications/rescore failed: ${notifications.status}`);
    const notifBody = asRecord(notifications.json, "notifications");
    const notifList = asArray(notifBody.notifications ?? null, "notifications array");
    if (notifList.length > 0) {
      const first = asRecord(notifList[0] as JsonValue, "notification 0");
      const rescoreEventId = asNumber(first.rescoreEventId ?? null, "rescoreEventId");
      const read = await user.requestJson("/api/notifications/rescore/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rescoreEventId }),
      });
      assertCondition(read.status === 200, `POST /api/notifications/rescore/read failed: ${read.status}`);
    }

    return `notifications=${notifList.length}`;
  });

  await runStep("Stats + main stats + internal auto-pass-cut", async () => {
    const stats = await admin.request(`/api/stats?examId=${activeExamId}`);
    assertCondition(stats.status === 200, `GET /api/stats failed: ${stats.status}`);

    const mainStats = await user.request("/api/main-stats");
    assertCondition(mainStats.status === 200, `GET /api/main-stats failed: ${mainStats.status}`);

    const internalGet = await anonymous.request(`/api/internal/pass-cut-auto-release?examId=${activeExamId}`, {
      headers: {
        "x-auto-release-secret": CRON_SECRET,
      },
    });
    assertCondition(internalGet.status === 200, `GET internal auto-release failed: ${internalGet.status}`);

    const internalPost = await anonymous.request("/api/internal/pass-cut-auto-release", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auto-release-secret": CRON_SECRET,
      },
      body: JSON.stringify({ examId: activeExamId, force: false }),
    });
    assertCondition(internalPost.status === 200, `POST internal auto-release failed: ${internalPost.status}`);
    return "ok";
  });

  await runStep("Key page routes render checks", async () => {
    const userPages = [
      "/login",
      "/register",
      "/exam/main",
      "/exam/input",
      "/exam/result",
      "/exam/prediction",
      "/exam/final",
      "/exam/comments",
      "/exam/faq",
      "/exam/notices",
    ];
    for (const page of userPages) {
      const response = await user.request(page, { redirect: "follow" });
      assertCondition(response.status === 200, `User page ${page} expected 200, got ${response.status}`);
    }

    const adminPages = [
      "/admin",
      "/admin/exams",
      "/admin/answers",
      "/admin/regions",
      "/admin/submissions",
      "/admin/users",
      "/admin/notices",
      "/admin/faqs",
      "/admin/events",
      "/admin/banners",
      "/admin/pass-cut",
      "/admin/stats",
      "/admin/site",
      "/admin/site/basic",
      "/admin/site/policies",
      "/admin/site/visibility",
      "/admin/site/operations",
      "/admin/site/auto-pass-cut",
      "/admin/comments",
      "/admin/mock-data",
    ];
    for (const page of adminPages) {
      const response = await admin.request(page, { redirect: "follow" });
      assertCondition(response.status === 200, `Admin page ${page} expected 200, got ${response.status}`);
    }

    return `${userPages.length + adminPages.length} pages`;
  });

  await runStep("Cleanup: restore site settings", async () => {
    if (
      originalFinalPredictionSetting === undefined &&
      originalAnswerInputSetting === undefined &&
      originalPreRegistrationSetting === undefined
    ) {
      return "skip";
    }
    await restoreSiteSettings(admin);
    return "restored";
  });
}

async function safeCleanup(): Promise<void> {
  const admin = new HttpClient("cleanup-admin");
  try {
    await login(admin, ADMIN_PHONE, ADMIN_PASSWORD);
  } catch {
    // Ignore cleanup login failures.
  }

  try {
    await restoreSiteSettings(admin);
  } catch {
    // Ignore cleanup setting restore failures.
  }

  if (createdNoticeId) {
    await admin.request(`/api/admin/notices?id=${createdNoticeId}`, { method: "DELETE" });
    createdNoticeId = null;
  }
  if (createdFaqId) {
    await admin.request(`/api/admin/faqs?id=${createdFaqId}`, { method: "DELETE" });
    createdFaqId = null;
  }
  if (createdEventId) {
    await admin.request(`/api/admin/events?id=${createdEventId}`, { method: "DELETE" });
    createdEventId = null;
  }
  if (createdBannerId) {
    await admin.request(`/api/admin/banners?id=${createdBannerId}`, { method: "DELETE" });
    createdBannerId = null;
  }
  if (createdSecondaryCommentId) {
    await admin.request(`/api/admin/comments?id=${createdSecondaryCommentId}`, { method: "DELETE" });
    createdSecondaryCommentId = null;
  }
  if (testUserId) {
    await admin.request(`/api/admin/users?id=${testUserId}&confirm=true`, { method: "DELETE" });
    testUserId = null;
  }
}

main()
  .then(async () => {
    await safeCleanup();
    await stopServer();
    printSummary();
    const hasFailure = results.some((item) => !item.ok);
    process.exit(hasFailure ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("\nE2E run aborted due to failure.");
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    await safeCleanup();
    await stopServer();
    printSummary();
    process.exit(1);
  });
