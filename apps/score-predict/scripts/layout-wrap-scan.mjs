/**
 * 짧은 한글 라벨이 두 줄로 깨지는지, 가로 넘침이 생겼는지 실제 렌더링에서 검사한다.
 * 소스 정적 분석이 아니라 Range.getClientRects()로 실제 줄 수를 판정한다.
 *
 * 사용: node scripts/layout-wrap-scan.mjs
 * 전제: pnpm local:up 으로 로컬 환경이 떠 있어야 한다(코드 변경 시 --build 필요).
 */
import { chromium } from "playwright";

const TENANTS = [
  // 로컬 시드 계정(prisma/seed-local.ts). 경찰만 admin/1234!! 계정을 따로 만든다.
  { name: "police", base: "http://police.localhost:3200", admin: { id: "admin", pw: "1234!!" } },
  { name: "fire", base: "http://fire.localhost:3200", admin: { id: "010-0000-0000", pw: "FireAdmin!123" } },
];

const ADMIN_PATHS = [
  "/admin", "/admin/exams", "/admin/answers", "/admin/regions", "/admin/pass-cut",
  "/admin/pre-registrations", "/admin/submissions", "/admin/stats", "/admin/visitors",
  "/admin/users", "/admin/comments", "/admin/banners", "/admin/events", "/admin/notices",
  "/admin/faqs", "/admin/site", "/admin/mock-data",
];
const PUBLIC_PATHS = ["/", "/login", "/register", "/exam/notices", "/exam/faq", "/forgot-password"];
const VIEWPORTS = [
  { label: "390", width: 390, height: 844 },
  { label: "768", width: 768, height: 1024 },
  { label: "1280", width: 1280, height: 1000 },
];

/** 짧은 한글 라벨의 실제 줄 수 + 페이지 가로 넘침 */
const DETECT = `(() => {
  const wrapped = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || "").trim();
    if (!text || text.length > 12 || !/[가-힣]/.test(text)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const node = el.firstChild;
    if (!node || node.nodeType !== 3) continue;
    const r = document.createRange();
    r.selectNodeContents(node);
    if (r.getClientRects().length > 1) {
      wrapped.push({ text, cls: (el.className || "").slice(0, 60) });
    }
  }
  const doc = document.documentElement;
  return {
    wrapped: wrapped.slice(0, 10),
    wrappedCount: wrapped.length,
    overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
  };
})()`;

async function loginAdmin(page, tenant) {
  await page.goto(tenant.base + "/admin-login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const id = page.locator("#username");
  const pw = page.locator("#password");
  if ((await id.count()) === 0) return false;
  await id.fill(tenant.admin.id);
  await pw.fill(tenant.admin.pw);
  await page.locator("form button[type='submit']").first().click();
  await page.waitForTimeout(4000);
  return !page.url().includes("/admin-login");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
});

let totalWrapped = 0;
let totalOverflow = 0;

for (const tenant of TENANTS) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const loggedIn = await loginAdmin(page, tenant);
    const paths = loggedIn ? [...ADMIN_PATHS, ...PUBLIC_PATHS] : PUBLIC_PATHS;

    for (const path of paths) {
      try {
        const res = await page.goto(tenant.base + path, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(1200);
        if (!res || res.status() >= 400) continue;
        const r = await page.evaluate(DETECT);
        if (r.wrappedCount > 0 || r.overflowX > 1) {
          totalWrapped += r.wrappedCount;
          if (r.overflowX > 1) totalOverflow += 1;
          console.log(`[${tenant.name}@${vp.label}] ${path}`);
          if (r.overflowX > 1) console.log(`   가로넘침 ${r.overflowX}px`);
          for (const w of r.wrapped) console.log(`   줄바꿈 "${w.text}"  (${w.cls})`);
        }
      } catch {
        /* 개별 경로 실패는 건너뛴다 */
      }
    }
    console.log(`--- ${tenant.name} @ ${vp.label}px 완료 (admin ${loggedIn ? "O" : "X"}) ---`);
    await ctx.close();
  }
}

console.log(`\n===== 줄바꿈 ${totalWrapped}건, 가로넘침 화면 ${totalOverflow}개 =====`);
await browser.close();
process.exitCode = totalWrapped > 0 || totalOverflow > 0 ? 1 : 0;
