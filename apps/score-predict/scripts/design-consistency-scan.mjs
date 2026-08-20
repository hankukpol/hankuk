/**
 * DESIGN.md 규칙을 실제 렌더링에서 검사한다.
 * 소스 정적 분석이 아니라 computed style 기준으로 판정한다.
 *
 * 사용: node scripts/design-consistency-scan.mjs
 * 전제: pnpm local:up (코드 변경 시 --build 필요)
 */
import { chromium } from "playwright";

const TENANTS = [
  { name: "police", base: "http://police.localhost:3200", admin: { id: "admin", pw: "1234!!" } },
  { name: "fire", base: "http://fire.localhost:3200", admin: { id: "010-0000-0000", pw: "FireAdmin!123" } },
];
const SELECTED_TENANTS = process.env.SCORE_DESIGN_TENANT
  ? TENANTS.filter((tenant) => tenant.name === process.env.SCORE_DESIGN_TENANT)
  : TENANTS;
const ADMIN_PATHS = [
  "/admin", "/admin/exams", "/admin/answers", "/admin/regions", "/admin/pass-cut",
  "/admin/pre-registrations", "/admin/submissions", "/admin/stats", "/admin/visitors",
  "/admin/users", "/admin/comments", "/admin/banners", "/admin/events", "/admin/notices",
  "/admin/faqs", "/admin/mock-data", "/admin/promotions",
  "/admin/site", "/admin/site/basic", "/admin/site/features", "/admin/site/operations",
  "/admin/site/policies", "/admin/site/visibility", "/admin/site/auto-pass-cut",
];
// 로그인 상태에서만 렌더되는 응시·계정 화면
const APP_PATHS = [
  "/exam", "/exam/main", "/exam/input", "/exam/result", "/exam/prediction",
  "/exam/final", "/exam/comments", "/account/notifications", "/account/security",
];
const PUBLIC_PATHS = [
  "/", "/login", "/register", "/terms", "/privacy", "/exam/notices", "/exam/faq",
  "/forgot-password", "/reset-password", "/maintenance",
];
// 주의: 공개 경로는 관리자 세션이 살아 있는 상태로도 순회한다. 로그인 여부에 따라
// 랜딩이 다른 패널을 그리므로, 비로그인 상태만 보면 놓치는 컨트롤이 생긴다.

const AUDIT = `(() => {
  const NEUTRAL = /^rgba?\\((\\d+), *(\\d+), *(\\d+)/;
  const isNeutral = (c) => {
    const m = c.match(NEUTRAL);
    if (!m) return true;
    const [r, g, bl] = [ +m[1], +m[2], +m[3] ];
    return Math.max(r,g,bl) - Math.min(r,g,bl) < 18;   // 채도 낮으면 중립색
  };
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  };
  // 표면은 사방이 닫힌 경계선을 가진다. border-t 하나만 있는 건 구분선이지 표면이 아니다.
  const hasBorderBox = (cs) =>
    ["borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth"]
      .every((k) => (Number.parseFloat(cs[k]) || 0) > 0);
  const hasBorder = (cs) => hasBorderBox(cs)
    && cs.borderTopColor !== "rgba(0, 0, 0, 0)";
  // 카드 = 표면. 폼 컨트롤·버튼·링크는 경계와 radius가 있어도 카드가 아니다.
  const NOT_SURFACE = new Set(["INPUT","SELECT","TEXTAREA","BUTTON","A","LABEL","OPTION",
                               "IMG","VIDEO","CANVAS","SVG","IFRAME"]);
  // Figma 원본을 그대로 옮긴 회차 프로모션은 자체 radius 언어를 쓴다(DESIGN.md 8장). 위계 검사 대상에서 제외한다.
  const isPromotion = (el) => /Promotion_/.test((el.className || "").toString())
    || !!el.closest('[class*="Promotion_"]');
  const isCard = (el) => {
    if (NOT_SURFACE.has(el.tagName)) return false;
    if (el.closest("nav, [role=navigation]")) return false;
    if (el.classList.contains("user-navigation-surface")) return false;
    if (isPromotion(el)) return false;
    const cs = getComputedStyle(el);
    if (!(vis(el) && hasBorder(cs) && (Number.parseFloat(cs.borderTopLeftRadius)||0) >= 6)) return false;
    // 한 줄짜리 컨트롤 묶음(라디오 한 줄, 세그먼트 탭)은 표면이 아니라 컨트롤이다. 폼 radius(6px)를 쓴다.
    const h = el.getBoundingClientRect().height;
    if (h <= 56 && el.querySelector("input, select, textarea, button")) return false;
    // 자식이 전부 컨트롤이면 줄바꿈으로 높아져도 세그먼트 컨트롤이다.
    const kids = [...el.children];
    if (kids.length > 0 && kids.every((k) => NOT_SURFACE.has(k.tagName))) return false;
    // 리치 텍스트 에디터도 폼 컨트롤이다(DESIGN.md: 에디터는 rounded-md).
    if (el.querySelector(".sun-editor, [contenteditable]")) return false;
    // 차트 툴팁 등 문서 흐름 밖의 부유 요소
    if (el.closest(".recharts-tooltip-wrapper, [role=dialog], [role=tooltip]")) return false;
    // 스크롤 영역은 표면이 아니라 뷰포트다. 경계선이 '더 읽을 내용이 있다'는 신호이므로 지우면 안 된다.
    if (/(auto|scroll)/.test(cs.overflowY) && cs.maxHeight !== "none") return false;
    return true;
  };
  // DESIGN.md가 '카드 안 카드'의 예외로 둔 실제 입력 컨트롤 그룹.
  // radius 위계는 이들에게도 적용해야 하므로 isCard에서 빼지 않고 여기서만 걸러낸다.
  const isControlGroup = (el) => {
    if (el.tagName === "FORM" || el.tagName === "FIELDSET") return true;
    if (el.querySelector("input, select, textarea")) return true;
    return false;
  };
  // 중첩 판정용. 컨트롤 그룹도 '보이는 표면'이므로 그 안의 요소는 중첩으로 봐야 한다.
  // 이걸 isCard로 판정하면 예외 처리한 부모가 사라져 자식이 최상위로 오해된다.
  const isVisualSurface = (el) => {
    if (NOT_SURFACE.has(el.tagName)) return false;
    const cs = getComputedStyle(el);
    // 사용자 메인 카드는 외곽선 색만 투명화하므로, 중첩 판정에서는
    // 투명한 1px border box도 여전히 부모 표면으로 취급한다.
    return vis(el) && hasBorderBox(cs) && (Number.parseFloat(cs.borderTopLeftRadius)||0) >= 6;
  };

  const out = { btnHeights: {}, btnBg: {}, cardPad: {}, nested: [], tableIssues: [],
                tableAlignmentIssues: [],
                adminTabIssues: [],
                uniformGrid: [], accentColors: {}, radiusBad: [], radiusTop: {}, radiusNested: {},
                squareSurfaces: [] };
  const isAdminPage = /^\\/(police\\/|fire\\/)?admin(?:\\/|$)/.test(location.pathname);

  // I. 문서형 디자인에 남은 둥근 표면.
  //    원형 컨트롤·배지와 프로모션은 제외하고, 제품 UI의 표면은 radius 0이어야 한다.
  const CELL = new Set(["TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","HR"]);
  document.querySelectorAll("*").forEach((el) => {
    if (NOT_SURFACE.has(el.tagName) || CELL.has(el.tagName)) return;
    if (el.closest("nav, [role=navigation]") || el.classList.contains("user-navigation-surface") || isPromotion(el)) return;
    // 차트 툴팁 등 부유 요소는 문서 흐름 밖이라 카드 규칙을 적용하지 않는다.
    if (el.closest(".recharts-tooltip-wrapper, [role=dialog], [role=tooltip]")) return;
    const cs = getComputedStyle(el);
    if (!vis(el) || !hasBorder(cs)) return;
    if ((Number.parseFloat(cs.borderTopLeftRadius) || 0) === 0) return;
    if (/(auto|scroll)/.test(cs.overflowY) && cs.maxHeight !== "none") return;
    if (el.querySelector("input, select, textarea, button, .sun-editor")) return;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 40) return;   // 작은 구분자·배지는 제외
    out.squareSurfaces.push({ cls: (el.className||"").toString().slice(0,52),
                              text: (el.innerText||"").trim().replace(/\\s+/g," ").slice(0,20) });
  });
  out.squareSurfaces = out.squareSurfaces.slice(0, 12);

  // A. 버튼 높이 · 배경색 (SunEditor 등 서드파티 위젯 내부는 우리 토큰 대상이 아니다)
  document.querySelectorAll("button, a[role=button], input[type=submit]").forEach((el) => {
    if (!vis(el)) return;
    if (el.closest(".sun-editor")) return;
    if (isPromotion(el)) return;   // Figma 원본 CTA는 자체 규격을 따른다(DESIGN.md 8장)
    const cs = getComputedStyle(el);
    // 배경도 경계도 없는 버튼은 텍스트 링크다. 줄높이를 따르므로 높이 계열 대상이 아니다.
    const flat = cs.backgroundColor === "rgba(0, 0, 0, 0)" && !hasBorder(cs);
    if (flat) return;
    // 목록 행 버튼(divide-* 목록 안의 전체 너비 항목)은 내용 높이를 따른다. 44px을 강제하면 두 줄 항목이 잘린다.
    const parentCls = (el.parentElement?.className || "").toString();
    if (/\\bdivide-/.test(parentCls) && cs.display === "block") return;
    const h = Math.round(el.getBoundingClientRect().height);
    if (h >= 20) out.btnHeights[h] = (out.btnHeights[h] || 0) + 1;
    const bg = cs.backgroundColor;
    if (!isNeutral(bg) || /rgb\\(0, 0, 0\\)|rgb\\(1[0-9], 1[0-9], 1[0-9]\\)/.test(bg)) {
      out.btnBg[bg] = (out.btnBg[bg] || 0) + 1;
    }
  });

  // C. 카드 padding · E. 중첩 카드
  document.querySelectorAll("*").forEach((el) => {
    if (!isCard(el)) return;
    const cs = getComputedStyle(el);
    const pad = cs.paddingTop;
    out.cardPad[pad] = (out.cardPad[pad] || 0) + 1;
    const radius = Math.round(Number.parseFloat(cs.borderTopLeftRadius) || 0);
    // divide-* 또는 gap-px 로 행을 나눈 단일 표면은 DESIGN.md가 권장하는 묶음이지 '카드 안 카드'가 아니다.
    const isGroupedSurface = /\\b(divide-|gap-px)/.test((el.className || "").toString())
      || isControlGroup(el);
    let p = el.parentElement, hops = 0, isNested = false;
    while (p && p !== document.body && hops < 6) {
      if (isVisualSurface(p)) {
        isNested = true;
        if (!isGroupedSurface) {
          out.nested.push({ child: (el.className||"").toString().slice(0,40),
                            parent: (p.className||"").toString().slice(0,40),
                            text: (el.innerText||"").trim().slice(0,24) });
        }
        break;
      }
      p = p.parentElement; hops++;
    }
    // G. 제품 UI 표면의 radius는 사용자·관리자 모두 0이다.
    //    (원형 배지 등 999px는 제외)
    if (radius < 100) {
      const bucket = isNested ? out.radiusNested : out.radiusTop;
      bucket[radius] = (bucket[radius] || 0) + 1;
      const expected = 0;
      if (radius !== expected) {
        out.radiusBad.push({ nested: isNested, radius, expected,
                             cls: (el.className||"").toString().slice(0,52),
                             text: (el.innerText||"").trim().replace(/\\s+/g," ").slice(0,20) });
      }
    }
  });

  // D. 표: 외곽 중복 · 셀 좌우 격자 · 관리자 셀 정렬
  document.querySelectorAll("table").forEach((t) => {
    if (!vis(t)) return;
    let outer = hasBorder(getComputedStyle(t)) ? 1 : 0;
    let p = t.parentElement, hops = 0;
    while (p && hops < 3 && p !== document.body) { if (isCard(p)) outer++; p = p.parentElement; hops++; }
    let grid = 0;
    t.querySelectorAll("td,th").forEach((c) => {
      const cs = getComputedStyle(c);
      if ((Number.parseFloat(cs.borderLeftWidth)||0) > 0 || (Number.parseFloat(cs.borderRightWidth)||0) > 0) grid++;
    });
    const requiresGrid = isAdminPage || t.classList.contains("data-table");
    if (outer >= 2 || (requiresGrid && grid === 0)) out.tableIssues.push({ outer, grid });

    // DESIGN.md: 관리자 표의 기본값은 가운데, 자릿수 비교 열만 num-right다.
    // 에디터 내부 표는 콘텐츠이므로 제품 데이터 표 검사에서 제외한다.
    if (isAdminPage && !t.closest(".sun-editor")) {
      t.querySelectorAll("th,td").forEach((cell) => {
        if (!vis(cell)) return;
        const expected = cell.classList.contains("num-right") ? "right" : "center";
        const actual = getComputedStyle(cell).textAlign;
        if (actual !== expected) {
          out.tableAlignmentIssues.push({
            tag: cell.tagName.toLowerCase(),
            expected,
            actual,
            text: (cell.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 28),
            cls: (cell.className || "").toString().slice(0, 70),
          });
        }

        // 셀의 text-align이 가운데여도 block flex 자식은 기본값 flex-start로
        // 따로 왼쪽에 붙는다. 관리 버튼 묶음처럼 셀을 직접 채우는 행 방향
        // flex 컨테이너까지 실제 가로 배치를 검사한다.
        [...cell.children].forEach((child) => {
          if (!vis(child)) return;
          const childStyle = getComputedStyle(child);
          if (childStyle.display === "flex" && childStyle.flexDirection.startsWith("row")) {
            const balanced = new Set(["center", "space-between", "space-around", "space-evenly"]);
            if (!balanced.has(childStyle.justifyContent)) {
              out.tableAlignmentIssues.push({
                tag: child.tagName.toLowerCase(),
                expected: "balanced flex content",
                actual: childStyle.justifyContent,
                text: (child.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 28),
                cls: (child.className || "").toString().slice(0, 70),
              });
            }
          }
        });
      });

      t.querySelectorAll(".num-right").forEach((el) => {
        if (!vis(el) || el.matches("th,td")) return;
        const actual = getComputedStyle(el).textAlign;
        if (actual !== "right") {
          out.tableAlignmentIssues.push({
            tag: el.tagName.toLowerCase(),
            expected: "right",
            actual,
            text: (el.value || el.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 28),
            cls: (el.className || "").toString().slice(0, 70),
          });
        }
      });
    }
  });

  // E. 관리자 탭: 각 탭 목록에는 활성 항목이 정확히 하나 있고,
  // 사용자 풀서비스의 공채·경채 탭과 같은 폴더형 상태가 계산되어야 한다.
  if (isAdminPage) {
    document.querySelectorAll(".admin-content-tabs").forEach((tabList) => {
      if (!vis(tabList)) return;
      const tabs = [...tabList.querySelectorAll(".admin-content-tab")].filter(vis);
      if (tabs.length === 0) return;
      const activeTabs = tabs.filter((tab) =>
        tab.matches('[aria-current="page"], [aria-selected="true"], [data-active="true"]')
      );
      if (activeTabs.length !== 1) {
        out.adminTabIssues.push({
          reason: "active-count-" + activeTabs.length,
          label: tabList.getAttribute("aria-label") || "관리자 탭",
        });
        return;
      }

      const activeStyle = getComputedStyle(activeTabs[0]);
      const inactiveTab = tabs.find((tab) => tab !== activeTabs[0]);
      const inactiveStyle = inactiveTab ? getComputedStyle(inactiveTab) : null;
      const activeIsDistinct =
        Number.parseInt(activeStyle.fontWeight, 10) >= 700 &&
        activeStyle.backgroundColor === "rgb(255, 255, 255)" &&
        (Number.parseFloat(activeStyle.borderBottomWidth) || 0) === 0 &&
        (!inactiveStyle || activeStyle.backgroundColor !== inactiveStyle.backgroundColor);
      if (!activeIsDistinct) {
        out.adminTabIssues.push({
          reason: "active-style-not-distinct",
          label: tabList.getAttribute("aria-label") || "관리자 탭",
          active: (activeTabs[0].textContent || "").trim().replace(/\\s+/g, " "),
          background: activeStyle.backgroundColor,
          weight: activeStyle.fontWeight,
          bottom: activeStyle.borderBottomWidth,
        });
      }
    });
  }

  // F. 균일 카드 그리드 (같은 크기 카드 4장 이상 나열)
  document.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== "grid") return;
    const kids = [...el.children].filter((k) => isCard(k));
    if (kids.length < 4) return;
    const sizes = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().width)));
    if (sizes.size <= 2) out.uniformGrid.push({ count: kids.length, cls: (el.className||"").toString().slice(0,46) });
  });

  // H. 강조색 다양성 (중립색 제외한 글자색)
  document.querySelectorAll("p, span, h1, h2, h3, h4, div").forEach((el) => {
    if (el.children.length || !vis(el)) return;
    const c = getComputedStyle(el).color;
    if (!isNeutral(c)) out.accentColors[c] = (out.accentColors[c] || 0) + 1;
  });

  out.nested = out.nested.slice(0, 5);
  out.uniformGrid = out.uniformGrid.slice(0, 4);
  out.radiusBad = out.radiusBad.slice(0, 40);
  return out;
})()`;

const merge = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; };

// dev 서버가 부하 중 간헐적으로 연결을 끊는다. 실패한 이동은 다시 시도한다.
async function gotoWithRetry(page, url, tries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(3000 * attempt);
    }
  }
  throw lastError;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
});

let hasTableAlignmentFailure = false;
let hasAdminTabFailure = false;

for (const t of SELECTED_TENANTS) {
  const viewportWidth = Number(process.env.SCORE_DESIGN_VIEWPORT || 1280);
  const ctx = await browser.newContext({ viewport: { width: viewportWidth, height: 1000 } });
  const page = await ctx.newPage();
  // 한 테넌트가 실패해도 나머지는 계속 검사한다.
  const reachable = await gotoWithRetry(page, t.base + "/admin-login")
    .then(() => true)
    .catch((err) => { console.log(`  [경고] ${t.name} 접속 실패: ${String(err).split("\n")[0]}`); return false; });
  await page.waitForTimeout(1500);
  let loggedIn = false;
  if (reachable && (await page.locator("#username").count())) {
    await page.locator("#username").fill(t.admin.id);
    await page.locator("#password").fill(t.admin.pw);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/admin-login"), { timeout: 60000 }).catch(() => {}),
      page.locator("form button[type='submit']").first().click(),
    ]);
    // 최초 컴파일 때문에 리다이렉트가 느리다. /admin 재진입 후 로그인 폼이 없으면 인증된 것으로 본다.
    await gotoWithRetry(page, t.base + "/admin").catch(() => {});
    await page.waitForTimeout(1500);
    loggedIn = !page.url().includes("/admin-login") && (await page.locator("#password").count()) === 0;
    if (!loggedIn) console.log(`  [경고] ${t.name} 관리자 로그인 실패 — 관리자 화면 미검사`);
  }

  const total = { btnHeights: {}, btnBg: {}, cardPad: {}, accentColors: {}, radiusTop: {}, radiusNested: {} };
  const nested = [], tables = [], tableAlignments = [], adminTabs = [], grids = [], radiusBad = [], square = [];

  const requestedPath = process.env.SCORE_DESIGN_PATH;
  const requestedPathPrefix = process.env.SCORE_DESIGN_PATH_PREFIX;
  const requestedScope = process.env.SCORE_DESIGN_SCOPE;
  const targetPool = requestedScope === "admin"
    ? (loggedIn ? ADMIN_PATHS : [])
    : [...(loggedIn ? [...ADMIN_PATHS, ...APP_PATHS] : []), ...PUBLIC_PATHS];
  const targets = reachable
    ? targetPool.filter(
        (path) =>
          (!requestedPath || path === requestedPath) &&
          (!requestedPathPrefix || path.startsWith(requestedPathPrefix))
      )
    : [];
  const scanned = [], skipped = [];
  for (const path of targets) {
    try {
      const res = await gotoWithRetry(page, t.base + path);
      // 스타일 적용 전 화면을 찍으면 브라우저 기본값(파란 링크·거대한 버튼)이 결과를 오염시킨다.
      await page
        .waitForFunction(
          () => getComputedStyle(document.body).getPropertyValue("--service-600").trim() !== "",
          { timeout: 20000 }
        )
        .catch(() => console.log(`  [경고] ${t.name}${path} 스타일 미적용 상태로 검사됨`));
      await page.waitForTimeout(1300);
      if (!res || res.status() >= 400) { skipped.push(`${path}(${res ? res.status() : "no-res"})`); continue; }
      // 리다이렉트로 다른 화면이 뜨면 그 경로를 검사했다고 볼 수 없다.
      const landed = new URL(page.url()).pathname.replace(/^\/(police|fire)/, "") || "/";
      if (landed !== path) { skipped.push(`${path}→${landed}`); continue; }
      scanned.push(path);
      const r = await page.evaluate(AUDIT);
      merge(total.btnHeights, r.btnHeights);
      merge(total.btnBg, r.btnBg);
      merge(total.cardPad, r.cardPad);
      merge(total.accentColors, r.accentColors);
      merge(total.radiusTop, r.radiusTop);
      merge(total.radiusNested, r.radiusNested);
      r.radiusBad.forEach((x) => radiusBad.push({ path, ...x }));
      r.squareSurfaces.forEach((x) => square.push({ path, ...x }));
      r.nested.forEach((n) => nested.push({ path, ...n }));
      r.tableIssues.forEach((x) => tables.push({ path, ...x }));
      r.tableAlignmentIssues.forEach((x) => tableAlignments.push({ path, ...x }));
      r.adminTabIssues.forEach((x) => adminTabs.push({ path, ...x }));
      r.uniformGrid.forEach((g) => grids.push({ path, ...g }));
    } catch (error) {
      const reason = String(error).split("\n")[0].slice(0, 160);
      skipped.push(`${path}(error: ${reason})`);
      console.log(`  [검사 오류] ${t.name}${path}: ${reason}`);
    }
  }

  const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  console.log(`\n${"=".repeat(58)}\n${t.name} (admin ${loggedIn ? "O" : "X"})\n${"=".repeat(58)}`);
  console.log(`검사한 화면: ${scanned.length}/${targets.length}`);
  if (skipped.length) console.log(`미검사: ${skipped.join(", ")}`);
  console.log("버튼 높이:", sorted(total.btnHeights).map(([k, v]) => `${k}px×${v}`).join(", "));
  console.log("버튼 강조 배경:", sorted(total.btnBg).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(" | "));
  console.log("카드 padding:", sorted(total.cardPad).map(([k, v]) => `${k}×${v}`).join(", "));
  console.log("강조 글자색 종류:", sorted(total.accentColors).length, "→", sorted(total.accentColors).slice(0, 8).map(([k, v]) => `${k}×${v}`).join(" | "));
  console.log("제품 표면 radius 최상위(기대 0px):", sorted(total.radiusTop).map(([k, v]) => `${k}px×${v}`).join(", "));
  console.log("제품 표면 radius 중첩(기대 0px):", sorted(total.radiusNested).map(([k, v]) => `${k}px×${v}`).join(", "));
  console.log(`radius 위계 위반: ${radiusBad.length}건`);
  radiusBad.slice(0, 40).forEach((x) =>
    console.log(`   ${x.path}  ${x.nested ? "중첩" : "최상위"} ${x.radius}px(기대 ${x.expected}px)  "${x.text}"  ${x.cls}`));
  console.log(`라운드가 남은 표면: ${square.length}건`);
  square.slice(0, 8).forEach((x) => console.log(`   ${x.path}  "${x.text}"  ${x.cls}`));
  console.log(`카드 안 카드: ${nested.length}건`);
  nested.slice(0, 5).forEach((n) => console.log(`   ${n.path}  "${n.text}"  ${n.child}`));
  console.log(`표 이중외곽·필수격자 누락: ${tables.length}건`);
  tables.slice(0, 5).forEach((x) => console.log(`   ${x.path}  외곽${x.outer}중 셀격자${x.grid}`));
  console.log(`관리자 표 정렬 위반: ${tableAlignments.length}건`);
  tableAlignments.slice(0, 12).forEach((x) =>
    console.log(`   ${x.path}  ${x.tag} ${x.actual}(기대 ${x.expected})  "${x.text}"  ${x.cls}`));
  if (tableAlignments.length > 0) hasTableAlignmentFailure = true;
  console.log(`관리자 탭 활성 상태 위반: ${adminTabs.length}건`);
  adminTabs.slice(0, 12).forEach((x) =>
    console.log(`   ${x.path}  ${x.label}  ${x.reason}${x.active ? `  활성 "${x.active}"` : ""}`));
  if (adminTabs.length > 0) hasAdminTabFailure = true;
  console.log(`균일 카드 그리드: ${grids.length}건`);
  grids.slice(0, 4).forEach((g) => console.log(`   ${g.path}  카드${g.count}장  ${g.cls}`));
  await ctx.close();
}
await browser.close();
if (hasTableAlignmentFailure) process.exitCode = 1;
if (hasAdminTabFailure) process.exitCode = 1;
