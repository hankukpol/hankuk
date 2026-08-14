import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const baseUrl = "http://police.localhost:3200";
const landingUrl = `${baseUrl}/`;
const widths = [390, 768, 1280] as const;
const screenshotsDir = resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260812-pre-registration-modal/screenshots",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function loginPoliceUser(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    const response = await fetch("/api/auth/callback/credentials?json=true", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        username: "010-9115-1015",
        password: "police-user-15!",
        json: "true",
      }),
    });
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = (await sessionResponse.json()) as { user?: { id?: string } };
    return { status: response.status, userId: session.user?.id };
  });
  await page.close();
  assert(result.status === 200 && result.userId, "Police test login failed.");
}

function attachRuntimeChecks(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

async function addAndClickImageButtonLink(page: Page) {
  await page.evaluate(() => {
    const trigger = document.createElement("a");
    trigger.id = "qa-pre-registration-trigger";
    trigger.href = "#pre-registration";
    trigger.textContent = "사전예약 신청하기";
    document.body.prepend(trigger);
  });
  await page.locator("#qa-pre-registration-trigger").click();
}

async function verifyUnauthenticated(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  attachRuntimeChecks(page, errors);

  await page.goto(`${baseUrl}/?popup=pre-registration`, { waitUntil: "networkidle" });
  assert((await page.getByRole("dialog").count()) === 0, "Legacy popup URL opened the modal automatically.");
  await page.goto(landingUrl, { waitUntil: "networkidle" });
  assert((await page.getByRole("dialog").count()) === 0, "Modal opened before the image button was clicked.");
  await addAndClickImageButtonLink(page);
  await page.getByRole("dialog").waitFor();
  await page.getByRole("heading", { name: "사전예약 신청하기" }).waitFor();
  const loginLink = page.getByRole("link", { name: "기존 회원 로그인" });
  const registerLink = page.getByRole("link", { name: "회원가입 후 사전등록" });
  await loginLink.waitFor();
  await registerLink.waitFor();
  assert(
    (await loginLink.getAttribute("href"))?.includes("callbackUrl=") === true,
    "Login link does not preserve the modal callback.",
  );
  assert(
    (await registerLink.getAttribute("href"))?.includes("callbackUrl=") === true,
    "Registration link does not preserve the modal callback.",
  );
  assert(errors.length === 0, `Unauthenticated modal runtime errors: ${errors.join(" | ")}`);

  await page.screenshot({ path: resolve(screenshotsDir, "pre-registration-login-390.png"), fullPage: true });

  await loginLink.click({ noWaitAfter: true });
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("아이디").fill("010-9115-1015");
  await page.getByLabel("비밀번호").fill("police-user-15!");
  await page.getByRole("main").getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/police");
  const resumed = await page
    .getByRole("dialog")
    .locator("h1")
    .filter({ hasText: "수험번호 사전등록" })
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!resumed) {
    const diagnostics = await page.evaluate(async () => {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as { user?: { id?: string } };
      return {
        url: window.location.href,
        pending: window.sessionStorage.getItem("score-predict:open-pre-registration-after-auth"),
        userId: session.user?.id ?? null,
        promotionEnabled: document
          .querySelector("[data-promotion-pre-registration-enabled]")
          ?.getAttribute("data-promotion-pre-registration-enabled") ?? null,
        promotionAuthenticated: document
          .querySelector("[data-promotion-authenticated]")
          ?.getAttribute("data-promotion-authenticated") ?? null,
        promotionSessionStatus: document
          .querySelector("[data-promotion-session-status]")
          ?.getAttribute("data-promotion-session-status") ?? null,
        dialogs: [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].map((dialog) =>
          dialog.innerText.slice(0, 500),
        ),
        bodyText: document.body.innerText.slice(0, 1_000),
      };
    });
    throw new Error(`Login callback did not resume pre-registration: ${JSON.stringify(diagnostics)}`);
  }
  assert(errors.length === 0, `Login callback runtime errors: ${errors.join(" | ")}`);
  await context.close();
}

async function verifyAuthenticatedViewport(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  width: (typeof widths)[number],
) {
  const context = await browser.newContext({ viewport: { width, height: 920 } });
  await loginPoliceUser(context);
  const page = await context.newPage();
  const errors: string[] = [];
  const saveCapture: { payload?: Record<string, unknown> } = {};
  attachRuntimeChecks(page, errors);

  await page.route("**/api/pre-registration", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          preRegistration: null,
        }),
      });
      return;
    }

    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    saveCapture.payload = route.request().postDataJSON() as Record<string, unknown>;
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "사전등록 완료",
        preRegistration: {
          id: 999999,
          examId: saveCapture.payload.examId,
          examType: saveCapture.payload.examType,
          gender: saveCapture.payload.gender,
          regionId: saveCapture.payload.regionId,
          examNumber: saveCapture.payload.examNumber,
          createdAt: now,
          updatedAt: now,
        },
      }),
    });
  });
  await page.route("**/api/exam-number/check?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true }),
    });
  });

  await page.goto(landingUrl, { waitUntil: "networkidle" });
  assert((await page.getByRole("dialog").count()) === 0, `${width}: modal opened automatically.`);
  await addAndClickImageButtonLink(page);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("h1").filter({ hasText: "수험번호 사전등록" }).waitFor();
  await dialog.getByLabel("성별").waitFor();
  await dialog.getByLabel("지역").waitFor();
  const examNumberInput = dialog.getByLabel("응시번호 (필수)");
  await examNumberInput.waitFor();
  assert((await examNumberInput.getAttribute("maxlength")) === "5", `${width}: police exam number maxlength is not 5.`);
  await examNumberInput.fill("123456");
  assert((await examNumberInput.inputValue()) === "12345", `${width}: police exam number was not limited to five digits.`);
  await examNumberInput.fill("");
  await dialog.getByRole("button", { name: /사전등록.*저장/ }).waitFor();

  const layout = await page.evaluate(() => {
    const dialogElement = document.querySelector<HTMLElement>('[role="dialog"]');
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      dialogWidth: dialogElement?.getBoundingClientRect().width ?? 0,
    };
  });
  assert(
    layout.documentWidth <= layout.viewportWidth + 1,
    `${width}: horizontal overflow ${layout.documentWidth}px > ${layout.viewportWidth}px.`,
  );
  assert(layout.dialogWidth <= layout.viewportWidth, `${width}: dialog exceeds viewport width.`);
  assert(errors.length === 0, `${width}: modal runtime errors: ${errors.join(" | ")}`);

  await page.screenshot({
    path: resolve(screenshotsDir, `pre-registration-form-${width}.png`),
    fullPage: true,
  });

  if (width === 1280) {
    await dialog.getByLabel("성별").selectOption("MALE");
    await dialog.getByLabel("지역").selectOption({ label: "대구" });
    await dialog.getByLabel("응시번호 (필수)").fill("04998");
    await dialog.getByText("사용 가능한 응시번호입니다.", { exact: true }).waitFor();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/pre-registration") && response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: /사전등록.*저장/ }).click();
    await responsePromise;
    const savedPayload = saveCapture.payload;
    assert(savedPayload, "Modal save did not call the pre-registration API.");
    assert(typeof savedPayload.examId === "number", "Modal save omitted examId.");
    assert(typeof savedPayload.regionId === "number", "Modal save omitted regionId.");
    assert(typeof savedPayload.examNumber === "string", "Modal save omitted examNumber.");
  }

  await dialog.getByRole("button", { name: "닫기" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert(new URL(page.url()).hash === "", `${width}: trigger changed the page hash.`);
  await context.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });
  try {
    await verifyUnauthenticated(browser);
    for (const width of widths) {
      await verifyAuthenticatedViewport(browser, width);
    }
  } finally {
    await browser.close();
  }
  console.log("pre-registration-modal-visual-qa: unauthenticated and 390/768/1280 authenticated passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
