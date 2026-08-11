import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { deleteUploadedFileByPublicUrl } from "@/lib/upload";

type TenantType = "police" | "fire";

interface NoticeItem {
  id: number;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const appDir = process.cwd();
const evidenceRoot = resolve(appDir, "../..", ".superloopy/evidence/frontend/20260810-notice-board");
const imageFixture = resolve(
  appDir,
  "../..",
  ".superloopy/evidence/frontend/20260810-notice-board/screenshots/police-notice-list-390.png",
);
const marker = `__NOTICE_BOARD_E2E_${Date.now()}__`;
const baseUrls: Record<TenantType, string> = {
  police: "http://police.localhost:3200",
  fire: "http://fire.localhost:3200",
};
const userPasswords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};
const adminPasswords: Record<TenantType, string> = {
  police: "PoliceAdmin!123",
  fire: "FireAdmin!123",
};
const schemas: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};
const checks: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readLocalEnvironment(): Record<string, string> {
  const envPath = resolve(appDir, ".env.docker.local");
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function readLocalDatabaseUrl(values: Record<string, string>): string {
  const rawUrl = values.DATABASE_URL;
  assert(rawUrl, "Local DATABASE_URL is missing.");
  const url = new URL(rawUrl);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname) && url.port === "54332",
    `Unsafe CRUD cleanup database target: ${url.hostname}:${url.port}.`
  );
  if (url.hostname === "host.docker.internal") url.hostname = "localhost";
  return url.toString();
}

function configureLocalStorageCleanup(values: Record<string, string>) {
  for (const name of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
    const rawValue = values[name];
    assert(rawValue, `Local ${name} is missing.`);
    const url = new URL(rawValue);
    assert(
      ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname) && url.port === "54331",
      `Unsafe CRUD upload cleanup target for ${name}: ${url.hostname}:${url.port}.`,
    );
    if (url.hostname === "host.docker.internal") url.hostname = "localhost";
    process.env[name] = url.toString();
  }

  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_STORAGE_BUCKET"] as const) {
    if (values[name]) process.env[name] = values[name];
  }
}

function tenantDatabaseUrl(rawUrl: string, tenantType: TenantType): string {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schemas[tenantType]);
  return url.toString();
}

async function cleanupTestNotices(databaseUrl: string) {
  for (const tenantType of ["police", "fire"] as const) {
    const db = new PrismaClient({ datasources: { db: { url: tenantDatabaseUrl(databaseUrl, tenantType) } } });
    try {
      await db.notice.deleteMany({ where: { title: { startsWith: "__NOTICE_BOARD_E2E_" } } });
    } finally {
      await db.$disconnect();
    }
  }
}

async function assertNoTestNotices(databaseUrl: string) {
  for (const tenantType of ["police", "fire"] as const) {
    const db = new PrismaClient({ datasources: { db: { url: tenantDatabaseUrl(databaseUrl, tenantType) } } });
    try {
      const remaining = await db.notice.count({ where: { title: { startsWith: "__NOTICE_BOARD_E2E_" } } });
      assert(remaining === 0, `${tenantType}: ${remaining} CRUD test notices remain after cleanup.`);
    } finally {
      await db.$disconnect();
    }
  }
}

async function authenticateContext(
  context: BrowserContext,
  tenantType: TenantType,
  identifier: string,
  password: string,
  adminOnly: boolean
) {
  const page = await context.newPage();
  await page.goto(`${baseUrls[tenantType]}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async ({ pageTenantType, pageIdentifier, pagePassword, pageAdminOnly }) => {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        password: pagePassword,
        json: "true",
      });
      body.set(pageTenantType === "police" ? "username" : "phone", pageIdentifier);
      if (pageAdminOnly) body.set("adminOnly", "true");
      const response = await fetch("/api/auth/callback/credentials?json=true", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload = (await response.json()) as { url?: string };
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as { user?: { tenantType?: string; role?: string } };
      return { status: response.status, payload, session };
    },
    { pageTenantType: tenantType, pageIdentifier: identifier, pagePassword: password, pageAdminOnly: adminOnly }
  );
  assert(result.status === 200 && !result.payload.url?.includes("error="), `${tenantType}: authentication failed.`);
  assert(result.session.user?.tenantType === tenantType, `${tenantType}: authenticated tenant mismatch.`);
  if (adminOnly) assert(result.session.user?.role === "ADMIN", `${tenantType}: admin role is missing.`);
  await page.close();
}

async function createAuthenticatedContexts(browser: Browser, tenantType: TenantType) {
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const user = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await authenticateContext(admin, tenantType, "010-0000-0000", adminPasswords[tenantType], true);
  await authenticateContext(user, tenantType, "010-9000-0000", userPasswords[tenantType], false);
  return { admin, user };
}

async function getAdminNotices(page: Page): Promise<NoticeItem[]> {
  return page.evaluate(async () => {
    const response = await fetch("/api/admin/notices", { cache: "no-store" });
    if (!response.ok) throw new Error(`Admin notices request failed with ${response.status}.`);
    const data = (await response.json()) as { notices?: NoticeItem[] };
    return data.notices ?? [];
  });
}

function fingerprint(items: NoticeItem[]): string {
  return JSON.stringify(
    items
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        isActive: item.isActive,
        priority: item.priority,
        startAt: item.startAt,
        endAt: item.endAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => a.id - b.id)
  );
}

async function confirmDialog(page: Page, title: string, method: "POST" | "PUT" | "DELETE") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: title, exact: true }).waitFor();
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/admin/notices") && response.request().method() === method
  );
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  const response = await responsePromise;
  assert(response.status() >= 200 && response.status() < 300, `${title}: ${method} returned ${response.status()}.`);
}

async function openAdminBoard(page: Page, tenantType: TenantType) {
  await page.goto(`${baseUrls[tenantType]}/admin/notices`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "공지사항 게시판 관리", exact: true }).waitFor();
}

async function saveCurrentForm(page: Page, mode: "create" | "update") {
  await page.getByRole("button", { name: mode === "create" ? "공지 등록" : "수정 저장", exact: true }).click();
  await confirmDialog(page, mode === "create" ? "공지사항 등록" : "공지사항 수정", mode === "create" ? "POST" : "PUT");
  await page.getByText(mode === "create" ? "공지사항이 등록되었습니다." : "공지사항이 수정되었습니다.", { exact: true }).waitFor();
}

async function editNotice(page: Page, title: string) {
  const row = page.locator("tbody tr").filter({ hasText: title });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("#notice-title").waitFor();
}

async function setEditorHtml(page: Page, html: string) {
  const codeViewButton = page.locator('[data-command="codeView"]');
  await codeViewButton.waitFor();
  await codeViewButton.click();
  const codeEditor = page.locator("textarea.se-wrapper-code");
  await codeEditor.waitFor();
  await codeEditor.fill(html);
  await codeViewButton.click();
  await page.locator(".sun-editor-editable").waitFor();
}

async function uploadEditorImage(page: Page, tenantType: TenantType): Promise<string> {
  await page.locator('[data-command="image"]').click();
  const dialog = page.locator(".se-dialog-image:visible");
  await dialog.waitFor();
  await dialog.locator('input[type="file"]').setInputFiles(imageFixture);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/admin/notices/upload-image") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  const response = await responsePromise;
  const data = (await response.json()) as { success?: boolean; url?: string; error?: string };
  assert(response.ok() && data.success && data.url, `${tenantType}: editor image upload failed (${response.status()}).`);
  await page.locator('.sun-editor-editable img').waitFor();
  return data.url;
}

async function verifyPublicNotice(
  page: Page,
  tenantType: TenantType,
  title: string,
  content: string,
  formattedSelector: string,
  imageUrl?: string,
) {
  await page.goto(`${baseUrls[tenantType]}/exam/notices`, { waitUntil: "domcontentloaded" });
  const titleButton = page.getByRole("button", { name: title, exact: true });
  await titleButton.waitFor();
  await titleButton.click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByText(content, { exact: true }).waitFor();
  await page.locator(formattedSelector).filter({ hasText: content }).waitFor();
  if (imageUrl) {
    const image = page.locator('img[alt="공지 테스트 이미지"]');
    await image.waitFor();
    assert((await image.getAttribute("src")) === imageUrl, `${tenantType}: public notice image URL mismatch.`);
  }
  await page.getByRole("button", { name: "목록", exact: true }).click();
}

async function assertPublicNoticeAbsent(page: Page, tenantType: TenantType, title: string) {
  await page.goto(`${baseUrls[tenantType]}/exam/notices`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "공지사항", exact: true }).waitFor();
  assert((await page.getByRole("button", { name: title, exact: true }).count()) === 0, `${tenantType}: hidden notice is still public.`);
}

async function exerciseTenant(
  browser: Browser,
  tenantType: TenantType,
  oppositeUserPage: Page,
  uploadedUrls: string[],
) {
  const { admin, user } = await createAuthenticatedContexts(browser, tenantType);
  const adminPage = await admin.newPage();
  const userPage = await user.newPage();
  const originalTitle = `${marker}-${tenantType}-작성`;
  const originalContent = `${tenantType} 공지 작성 내용`;
  const updatedTitle = `${marker}-${tenantType}-수정`;
  const updatedContent = `${tenantType} 공지 수정 내용`;
  const updatedHtml = `<p>${updatedContent}</p><blockquote>${tenantType} 인용 안내</blockquote>`;

  try {
    await openAdminBoard(adminPage, tenantType);
    const baseline = await getAdminNotices(adminPage);
    const baselineFingerprint = fingerprint(baseline);

    await adminPage.getByRole("button", { name: "새 공지 작성", exact: true }).click();
    await adminPage.locator("#notice-title").fill(originalTitle);
    const uploadedImageUrl = await uploadEditorImage(adminPage, tenantType);
    uploadedUrls.push(uploadedImageUrl);
    const originalHtml = `<h2>${originalContent}</h2><p><strong>${tenantType} 굵은 안내</strong></p><ul><li>${tenantType} 목록 항목</li></ul><p><img src="${uploadedImageUrl}" alt="공지 테스트 이미지" /></p><script>alert("blocked")</script>`;
    await setEditorHtml(adminPage, originalHtml);
    await adminPage.locator("#notice-priority").fill("77");
    await saveCurrentForm(adminPage, "create");

    let current = await getAdminNotices(adminPage);
    const created = current.find((item) => item.title === originalTitle);
    assert(created, `${tenantType}: created notice was not returned by the admin API.`);
    assert(
      created.content.includes(`<h2>${originalContent}</h2>`) &&
        created.content.includes("<strong>") &&
        created.content.includes(uploadedImageUrl) &&
        !created.content.includes("<script") &&
        created.isActive &&
        created.priority === 77,
      `${tenantType}: created rich-text notice data mismatch.`,
    );
    await verifyPublicNotice(userPage, tenantType, originalTitle, originalContent, "h2", uploadedImageUrl);
    await assertPublicNoticeAbsent(oppositeUserPage, tenantType === "police" ? "fire" : "police", originalTitle);
    checks.push(`${tenantType}: rich-text create, HTML sanitization, public detail, cross-tenant isolation`);

    await editNotice(adminPage, originalTitle);
    await adminPage.locator("#notice-title").fill(updatedTitle);
    await setEditorHtml(adminPage, updatedHtml);
    await adminPage.locator("#notice-priority").fill("1");
    await saveCurrentForm(adminPage, "update");
    current = await getAdminNotices(adminPage);
    const updated = current.find((item) => item.id === created.id);
    assert(
      updated?.title === updatedTitle &&
        updated.content.includes(`<p>${updatedContent}</p>`) &&
        updated.content.includes("<blockquote>") &&
        updated.priority === 1,
      `${tenantType}: updated rich-text notice data mismatch.`,
    );
    await assertPublicNoticeAbsent(userPage, tenantType, originalTitle);
    await verifyPublicNotice(userPage, tenantType, updatedTitle, updatedContent, "p");
    checks.push(`${tenantType}: rich-text update reflected in admin and public detail`);

    await editNotice(adminPage, updatedTitle);
    await adminPage.getByLabel("활성 공지로 표시").uncheck();
    await saveCurrentForm(adminPage, "update");
    await assertPublicNoticeAbsent(userPage, tenantType, updatedTitle);
    checks.push(`${tenantType}: inactive notice hidden from public board`);

    await editNotice(adminPage, updatedTitle);
    await adminPage.getByLabel("활성 공지로 표시").check();
    await saveCurrentForm(adminPage, "update");
    await verifyPublicNotice(userPage, tenantType, updatedTitle, updatedContent, "p");
    checks.push(`${tenantType}: reactivated notice returned to public board`);

    const row = adminPage.locator("tbody tr").filter({ hasText: updatedTitle });
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await confirmDialog(adminPage, "공지사항 삭제", "DELETE");
    await adminPage.getByText("공지사항이 삭제되었습니다.", { exact: true }).waitFor();
    await assertPublicNoticeAbsent(userPage, tenantType, updatedTitle);
    current = await getAdminNotices(adminPage);
    assert(fingerprint(current) === baselineFingerprint, `${tenantType}: baseline notices were not restored after delete.`);
    checks.push(`${tenantType}: delete removed notice and restored baseline exactly`);
  } finally {
    await admin.close();
    await user.close();
  }
}

async function main() {
  const localEnvironment = readLocalEnvironment();
  const databaseUrl = readLocalDatabaseUrl(localEnvironment);
  configureLocalStorageCleanup(localEnvironment);
  await cleanupTestNotices(databaseUrl);
  const uploadedUrls: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });

  const policeOpposite = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const fireOpposite = await browser.newContext({ viewport: { width: 1024, height: 900 } });

  try {
    await authenticateContext(policeOpposite, "police", "010-9000-0000", userPasswords.police, false);
    await authenticateContext(fireOpposite, "fire", "010-9000-0000", userPasswords.fire, false);
    const policePage = await policeOpposite.newPage();
    const firePage = await fireOpposite.newPage();
    await exerciseTenant(browser, "police", firePage, uploadedUrls);
    await exerciseTenant(browser, "fire", policePage, uploadedUrls);

    const anonymous = await browser.newContext();
    for (const tenantType of ["police", "fire"] as const) {
      const response = await anonymous.request.post(`http://localhost:3200/${tenantType}/api/admin/notices`, {
        data: { title: `${marker}-unauthorized`, content: "unauthorized", priority: 0, isActive: true },
      });
      assert(response.status() === 401, `${tenantType}: anonymous create expected 401, received ${response.status()}.`);

      const uploadResponse = await anonymous.request.post(
        `http://localhost:3200/${tenantType}/api/admin/notices/upload-image`,
        { multipart: {} },
      );
      assert(
        uploadResponse.status() === 401,
        `${tenantType}: anonymous editor image upload expected 401, received ${uploadResponse.status()}.`,
      );
    }
    checks.push("police and fire anonymous notice writes and editor image uploads rejected with 401");
    await anonymous.close();
  } finally {
    await policeOpposite.close();
    await fireOpposite.close();
    await browser.close();
    await cleanupTestNotices(databaseUrl);
    for (const publicUrl of uploadedUrls) {
      await deleteUploadedFileByPublicUrl(publicUrl);
    }
  }

  await assertNoTestNotices(databaseUrl);
  checks.push("police and fire CRUD test notice cleanup verified at 0 rows");
  checks.push("police and fire editor image uploads completed and test objects were deleted");

  mkdirSync(evidenceRoot, { recursive: true });
  const report = [
    "# 공지사항 게시판 CRUD QA",
    "",
    "## 결과",
    "",
    ...checks.map((check) => `- [x] ${check}`),
    "",
    "## 안전 확인",
    "",
    "- [x] 로컬 데이터베이스 호스트와 포트를 검증한 뒤 테스트했다.",
    "- [x] 테스트 공지는 경찰·소방 스키마에서 모두 0건으로 정리했다.",
    "- [x] 테스트 이미지 객체는 업로드 검증 후 Storage에서 삭제했다.",
    "- [x] 공지 저장 시 허용되지 않은 script 태그가 제거됐다.",
  ].join("\n");
  const evidencePath = resolve(evidenceRoot, "CRUD_QA.md");
  writeFileSync(evidencePath, `${report}\n`, "utf8");

  console.log(JSON.stringify({ result: "passed", marker, checks, cleanup: "completed", evidence: evidencePath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
