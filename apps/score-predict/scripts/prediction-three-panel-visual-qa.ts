import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const evidenceDir = resolve(
  process.cwd(),
  ".superloopy/evidence/frontend/20260821-prediction-three-panel"
);

const tenants = {
  police: {
    baseUrl: "http://police.localhost:3200",
    identity: "010-9000-0000",
    password: "PoliceLocal!123",
  },
  fire: {
    baseUrl: "http://fire.localhost:3200",
    identity: "010-0000-0000",
    password: "FireAdmin!123",
  },
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function login(context: BrowserContext, tenant: keyof typeof tenants) {
  const page = await context.newPage();
  const config = tenants[tenant];
  await page.goto(`${config.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(async ({ identity, password }) => {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken ?? "",
      callbackUrl: window.location.origin,
      username: identity,
      password,
      json: "true",
    });
    const response = await fetch("/api/auth/callback/credentials?json=true", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return response.status;
  }, config);
  assert(status === 200, `${tenant} 로그인 실패: ${status}`);
  await page.close();
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasOverflow, `${label}: 가로 스크롤이 발생했습니다.`);
}

async function verifyViewport(
  context: BrowserContext,
  tenant: keyof typeof tenants,
  width: number,
  height: number
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${tenants[tenant].baseUrl}/exam/prediction`, { waitUntil: "networkidle" });

  await page.getByText("내 표본 순위", { exact: true }).waitFor();
  await page.getByText("표본 내 위치", { exact: true }).first().waitFor();
  await page.getByText("표본 집계 상태", { exact: true }).waitFor();

  const cards = page.locator("article").filter({
    has: page.locator("p", { hasText: /내 표본 순위|표본 내 위치|표본 집계 상태/ }),
  });
  assert((await cards.count()) === 3, `${tenant} ${width}px: 3단 카드 수가 3개가 아닙니다.`);

  const boxes = await Promise.all([0, 1, 2].map((index) => cards.nth(index).boundingBox()));
  assert(boxes.every(Boolean), `${tenant} ${width}px: 카드 위치를 읽지 못했습니다.`);
  if (width >= 1024) {
    assert(
      Math.abs(boxes[0]!.y - boxes[1]!.y) < 2 && Math.abs(boxes[1]!.y - boxes[2]!.y) < 2,
      `${tenant} ${width}px: PC 3단 카드가 같은 행에 정렬되지 않았습니다.`
    );
  } else {
    assert(
      boxes[0]!.y < boxes[1]!.y && boxes[1]!.y < boxes[2]!.y,
      `${tenant} ${width}px: 모바일·태블릿 카드가 순서대로 쌓이지 않았습니다.`
    );
  }

  if (tenant === "police") {
    const bodyText = await page.locator("body").innerText();
    for (const unsafeLabel of ["합격컷까지", "내 배수", "합격 확실권", "합격 유력권", "합격 가능권", "합격 도전권"]) {
      assert(!bodyText.includes(unsafeLabel), `경찰 ${width}px: 금지 문구가 노출됐습니다. ${unsafeLabel}`);
    }
  }

  await assertNoHorizontalOverflow(page, `${tenant} 합격예측 ${width}px`);
  const dashboard = page.getByText("내 표본 순위", { exact: true }).locator("xpath=ancestor::section[1]");
  await dashboard.screenshot({
    path: resolve(evidenceDir, `${tenant}-prediction-three-panel-${width}.png`),
  });
  await page.close();
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1",
    ],
  });

  try {
    for (const tenant of ["police"] as const) {
      const context = await browser.newContext();
      try {
        await login(context, tenant);
        for (const viewport of [
          { width: 390, height: 844 },
          { width: 768, height: 1024 },
          { width: 1280, height: 900 },
        ]) {
          await verifyViewport(context, tenant, viewport.width, viewport.height);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ passed: true, evidenceDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
