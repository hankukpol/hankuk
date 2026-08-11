import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { richTextToPlainText } from "@/lib/rich-text";

type TenantType = "police" | "fire";

interface NoticeItem {
  id: number;
  title: string;
  content: string;
}

const evidenceRoot = resolve(process.cwd(), "../../.superloopy/evidence/frontend/20260811-notice-summary-plain-text");
const screenshotsDir = resolve(evidenceRoot, "screenshots");
const baseUrls: Record<TenantType, string> = {
  police: "http://police.localhost:3200",
  fire: "http://fire.localhost:3200",
};
const userPasswords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};
const checks: string[] = [];
const runtimeErrors: string[] = [];
let htmlFixtureVerified = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function attachDiagnostics(page: Page, label: string) {
  page.on("pageerror", (error) => runtimeErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${label}: ${message.text()}`);
  });
}

async function loginUser(context: BrowserContext, tenantType: TenantType) {
  const page = await context.newPage();
  await page.goto(`${baseUrls[tenantType]}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async ({ pageTenantType, pagePassword }) => {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        password: pagePassword,
        json: "true",
      });
      body.set(pageTenantType === "police" ? "username" : "phone", "010-9000-0000");
      const response = await fetch("/api/auth/callback/credentials?json=true", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload = (await response.json()) as { url?: string };
      return { status: response.status, url: payload.url };
    },
    { pageTenantType: tenantType, pagePassword: userPasswords[tenantType] },
  );
  assert(result.status === 200 && !result.url?.includes("error="), `${tenantType}: user login failed.`);
  await page.close();
}

async function readPublicNotices(page: Page): Promise<NoticeItem[]> {
  return page.evaluate(async () => {
    const response = await fetch("/api/notices", { cache: "no-store" });
    if (!response.ok) throw new Error(`Public notices request failed with ${response.status}.`);
    const data = (await response.json()) as { notices?: NoticeItem[] };
    return data.notices ?? [];
  });
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${label}: horizontal overflow ${dimensions.documentWidth}px > ${dimensions.viewportWidth}px.`,
  );
}

async function captureSummary(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  tenantType: TenantType,
  width: number,
) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await loginUser(context, tenantType);
  const page = await context.newPage();
  const label = `${tenantType}-${width}`;
  attachDiagnostics(page, label);

  await page.goto(`${baseUrls[tenantType]}/`, { waitUntil: "networkidle" });
  const heading = page.getByRole("heading", { name: "공지사항 / 이용안내", exact: true });
  await heading.waitFor();
  const section = heading.locator("xpath=ancestor::section[1]");
  const notices = await readPublicNotices(page);
  if (notices.some((notice) => /<[^>]+>/.test(notice.content))) htmlFixtureVerified = true;

  const cards = section.locator("li");
  const cardCount = await cards.count();
  assert(cardCount > 0, `${label}: notice summary cards were not rendered.`);

  for (let index = 0; index < cardCount; index += 1) {
    const card = cards.nth(index);
    const title = (await card.locator("p").first().innerText()).trim();
    const body = (await card.locator("p").nth(1).innerText()).trim();
    const source = notices.find((notice) => notice.title === title);
    assert(source, `${label}: rendered notice '${title}' was not returned by the public API.`);
    assert(body === richTextToPlainText(source.content), `${label}: '${title}' summary text did not match its plain-text form.`);
    assert(!/<\/?[a-z][^>]*>/i.test(body), `${label}: '${title}' exposed HTML tag syntax.`);
  }

  await assertNoHorizontalOverflow(page, label);
  await section.screenshot({ path: resolve(screenshotsDir, `${label}.png`) });
  checks.push(`${label}: HTML source rendered as plain text with no horizontal overflow`);
  await context.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  assert(
    richTextToPlainText("<p>첫 줄 <strong>강조</strong></p><p>A&amp;B</p><script>차단</script>") ===
      "첫 줄 강조\nA&B",
    "Rich-text plain-text conversion regression failed.",
  );

  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });

  try {
    for (const tenantType of ["police", "fire"] as const) {
      for (const width of [390, 768, 1280]) {
        await captureSummary(browser, tenantType, width);
      }
    }
    assert(htmlFixtureVerified, "No HTML notice fixture was verified in either tenant.");
    assert(runtimeErrors.length === 0, `Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  } finally {
    await browser.close();
  }

  const visualQa = [
    "# 공지 요약 일반 텍스트 Visual QA",
    "",
    "## 결과",
    "",
    ...checks.map((check) => `- [x] ${check}`),
    "- [x] 경찰·소방 공통 공지 요약에서 HTML 태그 문법 미노출",
    "- [x] 390px, 768px, 1280px에서 가로 스크롤 없음",
    "- [x] 브라우저 콘솔·페이지 런타임 오류 없음",
    "",
    "## Design Read",
    "",
    "- 사용자는 로그인 후 공지 요약을 확인하는 경찰·소방 수험생이다.",
    "- 기존 카드의 구조·색상·간격을 유지하고 본문 표현만 일반 텍스트로 교정했다.",
    "- 공지 상세 화면의 정제된 HTML 서식 렌더링은 변경하지 않았다.",
    "",
    "## Anti-slop 및 접근성",
    "",
    "- [x] 새 시각 토큰이나 장식 요소를 추가하지 않음",
    "- [x] 기존 service 색상 및 Noto Sans KR 체계 유지",
    "- [x] 경찰 블루·소방 레드 테마 분리 유지",
    "- [x] HTML을 요약 영역에 주입하지 않고 React 텍스트 노드로 출력",
  ].join("\n");
  const designTokens = [
    "# Design Tokens",
    "",
    "이번 수정은 기존 디자인 토큰을 그대로 사용한다.",
    "",
    "- Color: `service-50`, `service-200`, `service-600`, `slate-600`, `slate-900`",
    "- Typography: 기존 `text-sm`, `leading-relaxed`, `font-bold`",
    "- Spacing: 기존 `p-4`, `p-6`, `mt-1`, `mt-4`, `space-y-3`",
    "- Radius: 기존 `rounded-md`",
    "- 새 토큰: 없음",
  ].join("\n");

  writeFileSync(resolve(evidenceRoot, "VISUAL_QA.md"), `${visualQa}\n`, "utf8");
  writeFileSync(resolve(evidenceRoot, "DESIGN_TOKENS.md"), `${designTokens}\n`, "utf8");
  console.log(JSON.stringify({ result: "passed", checks, evidence: evidenceRoot }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
