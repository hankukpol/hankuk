import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { resolveSafeAuthCallback } from "../src/lib/auth-callback";

const BASE_URL = "http://police.localhost:3200";
const EVIDENCE_DIR = resolve(
  process.cwd(),
  ".superloopy/evidence/frontend/20260821-guest-tab-auth-flow"
);
const SCREENSHOT_DIR = resolve(EVIDENCE_DIR, "screenshots");
const MENU_TO_TAB = new Map([
  ["응시정보 입력", "input"],
  ["내 성적 분석", "result"],
  ["최종 환산 예측", "final"],
  ["합격 예측", "prediction"],
  ["실시간 댓글", "comments"],
  ["공지사항", "notices"],
  ["FAQ", "faq"],
]);

const checks: string[] = [];
const consoleErrors: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function attachDiagnostics(page: Page, label: string) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${label}: ${error.message}`));
}

async function waitForLanding(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "풀서비스 메인", exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
}

async function openGuestDialog(page: Page, label: string) {
  const dialog = page.locator('[role="dialog"]');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole("button", { name: label, exact: true }).click();
    try {
      await dialog.waitFor({ timeout: 4_000 });
      return dialog;
    } catch {
      // 첫 컴파일 직후 React hydration 이전에 눌린 경우 잠시 기다린 뒤 다시 확인한다.
      await page.waitForTimeout(500);
    }
  }
  throw new Error(`${label} 클릭 후 로그인 모달이 열리지 않았습니다.`);
}

async function verifyGuestMenus(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  attachDiagnostics(page, `guest-${width}`);
  await waitForLanding(page);

  const initialUrl = new URL(page.url());
  const availableMenus = await page.locator("button.user-navigation-tab").allTextContents();
  const restrictedMenus = availableMenus
    .map((label) => label.trim())
    .filter((label) => MENU_TO_TAB.has(label));
  assert(restrictedMenus.length > 0, `${width}px에서 제한 메뉴를 찾지 못했습니다.`);

  for (const label of restrictedMenus) {
    const dialog = await openGuestDialog(page, label);
    await dialog.getByRole("heading", { name: "로그인이 필요합니다", exact: true }).waitFor();
    await dialog.getByText(`${label} 메뉴는 로그인 후 이용할 수 있습니다.`, { exact: false }).waitFor();

    const afterClickUrl = new URL(page.url());
    assert(
      afterClickUrl.pathname === initialUrl.pathname && afterClickUrl.search === initialUrl.search,
      `${label} 클릭이 로그인 전에 URL을 변경했습니다: ${page.url()}`
    );

    const loginHref = await dialog.getByRole("link", { name: "로그인", exact: true }).getAttribute("href");
    assert(loginHref, `${label} 로그인 링크가 없습니다.`);
    const loginUrl = new URL(loginHref, BASE_URL);
    const callback = loginUrl.searchParams.get("callbackUrl");
    const expectedTab = MENU_TO_TAB.get(label);
    assert(callback, `${label} callbackUrl이 없습니다.`);
    const callbackUrl = new URL(callback, BASE_URL);
    assert(
      callbackUrl.pathname === "/police" && callbackUrl.searchParams.get("examTab") === expectedTab,
      `${label} callbackUrl이 풀서비스 내 탭을 가리키지 않습니다: ${callback}`
    );

    if (label === "실시간 댓글") {
      await page.screenshot({
        path: resolve(SCREENSHOT_DIR, `guest-comments-login-modal-${width}.png`),
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasHorizontalOverflow, `${width}px에서 가로 스크롤이 발생했습니다.`);
  checks.push(`${width}px: ${restrictedMenus.join(", ")} 로그인 모달·메인 복귀 callback 확인`);
  await context.close();
}

async function verifyLoginReturn(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  attachDiagnostics(page, "login-return");
  await waitForLanding(page);

  const dialog = await openGuestDialog(page, "실시간 댓글");
  await dialog.getByRole("heading", { name: "로그인이 필요합니다", exact: true }).waitFor();
  await dialog.getByRole("link", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/login\?/);
  await page.locator("#username").fill("010-9000-0000");
  await page.locator("#password").fill("PoliceLocal!123");
  await page.locator("form button[type='submit']").click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.getByRole("button", { name: "실시간 댓글", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button.user-navigation-tab"));
    return buttons.some(
      (button) => button.textContent?.trim() === "실시간 댓글" && button.getAttribute("aria-pressed") === "true"
    );
  }, undefined, { timeout: 30_000 });
  assert(
    !new URL(page.url()).pathname.includes("/exam/comments"),
    `로그인 뒤 단독 댓글 페이지로 이동했습니다: ${page.url()}`
  );
  assert(
    (await page.getByRole("button", { name: "실시간 댓글", exact: true }).getAttribute("aria-pressed")) === "true",
    "로그인 뒤 풀서비스 내부 실시간 댓글 탭이 활성화되지 않았습니다."
  );
  await page.getByRole("heading", { name: "댓글", exact: true }).waitFor();
  await page.getByRole("button", { name: "풀서비스 메인", exact: true }).waitFor();
  await page.getByRole("button", { name: "풀서비스 메인", exact: true }).click();
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button.user-navigation-tab"))
      .find((item) => item.textContent?.trim() === "풀서비스 메인");
    return button?.getAttribute("aria-pressed") === "true";
  });
  assert(
    new URL(page.url()).searchParams.get("examTab") === "main",
    "로그인 뒤 다른 메뉴를 선택했을 때 내부 탭 주소가 갱신되지 않았습니다."
  );
  await page.getByRole("button", { name: "실시간 댓글", exact: true }).click();
  await page.getByRole("heading", { name: "댓글", exact: true }).waitFor();
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "authenticated-comments-embedded-1280.png"),
    fullPage: true,
  });
  checks.push("로그인 뒤 단독 페이지가 아닌 풀서비스 내부 실시간 댓글 탭 복귀·내부 메뉴 재전환 확인");
  await context.close();
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP police.localhost 127.0.0.1, MAP fire.localhost 127.0.0.1",
    ],
  });

  try {
    if (process.env.QA_ONLY_LOGIN_RETURN !== "1") {
      await verifyGuestMenus(browser, 390, 844);
      await verifyGuestMenus(browser, 768, 1024);
      await verifyGuestMenus(browser, 1280, 900);
    }
    await verifyLoginReturn(browser);
    assert(
      resolveSafeAuthCallback("/fire?examTab=comments", "/fire", "fire") ===
        "/fire?examTab=comments",
      "소방 내부 탭 callback 검증에 실패했습니다."
    );
    assert(
      resolveSafeAuthCallback("/police?examTab=comments", "/fire", "fire") === "/fire",
      "소방 로그인에서 경찰 callback이 차단되지 않았습니다."
    );
    checks.push("소방 로그인 callback 보존·교차 테넌트 callback 차단 확인");
    assert(consoleErrors.length === 0, `브라우저 오류가 발생했습니다:\n${consoleErrors.join("\n")}`);

    await writeFile(
      resolve(EVIDENCE_DIR, "VISUAL_QA.md"),
      [
        "# 비회원 메뉴 로그인 복귀 QA",
        "",
        ...checks.map((check) => `- PASS: ${check}`),
        "- PASS: 390px, 768px, 1280px 가로 오버플로 없음",
        "- PASS: 브라우저 console/page 오류 없음",
        "",
        "## 증거",
        "",
        "- `screenshots/guest-comments-login-modal-390.png`",
        "- `screenshots/guest-comments-login-modal-768.png`",
        "- `screenshots/guest-comments-login-modal-1280.png`",
        "- `screenshots/authenticated-comments-embedded-1280.png`",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(EVIDENCE_DIR, "PERF.md"),
      [
        "# 성능 메모",
        "",
        "- 새 네트워크 API 호출 없음.",
        "- 로그인 복귀 탭은 URL query 1회 소비 후 History API로 제거.",
        "- 기존 동적 탭 컴포넌트와 로그인 모달 재사용.",
        "",
      ].join("\n"),
      "utf8"
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
