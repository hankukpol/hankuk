/**
 * 사용자 입장에서 실제 워크플로우를 실행해 버그·에러를 찾는다.
 * 회원가입 → 로그인 → 사전등록 → 답안 입력 → 결과/예측 → 비밀번호 찾기 → 비밀번호 변경.
 *
 * 사용: node scripts/user-workflow-qa.mjs
 * 전제: pnpm local:up (코드 변경 시 --build 필요)
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const CONTAINER = "score-predict-local-web-1";
const TENANTS = [
  {
    name: "police",
    base: "http://police.localhost:3200",
    register: "police",
  },
  {
    name: "fire",
    base: "http://fire.localhost:3200",
    register: "fire",
  },
];

const suffix = `${Date.now()}`.slice(-8);
// 응시번호는 10자리 숫자여야 한다(src/lib/fire/exam-number.ts, api/submission).
// 소방 응시번호 규칙(src/lib/fire/exam-number.ts): 4번째=성별코드, 5~6번째=유형코드.
// 공채(남) → 성별 "1", 유형 "01".
const examNumberValue = `202${1}01${suffix.slice(0, 4)}`;
// 경찰은 지역별 유효 범위 안이어야 한다. 저장 실패 응답의 범위를 읽어 다시 시도한다.
// 범위의 첫 번호는 앞선 검증에서 이미 선점됐을 수 있어 구간 안에서 무작위로 고른다.
// 서버 응답("유효 범위(A~B)")과 화면 문구("A~B 범위로 입력해 주세요") 양쪽을 인식한다.
// 경찰은 클라이언트에서 먼저 막아 요청 자체가 나가지 않으므로 화면 문구도 읽어야 한다.
function pickInRange(text, attempt = 0) {
  const m = String(text).match(/(\d{10})\s*~\s*(\d{10})/);
  if (!m) return null;
  const [min, max] = [Number(m[1]), Number(m[2])];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  const span = max - min + 1;
  const offset = (Number(suffix) + attempt * 137) % span;
  return String(min + offset).padStart(10, "0");
}
const findings = [];
const passed = [];

function note(tenant, step, detail) {
  findings.push({ tenant, step, detail });
  console.log(`  [문제] ${tenant} · ${step} — ${detail}`);
}
function ok(tenant, step, detail = "") {
  passed.push({ tenant, step });
  console.log(`  [정상] ${tenant} · ${step}${detail ? ` — ${detail}` : ""}`);
}

/** 콘솔 오류·미처리 예외·실패 응답을 단계별로 모은다. */
function attachWatchers(page, state) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Download the React DevTools/.test(text)) return;
    // 화면 전환 중 개발 서버 연결이 끊기며 나는 잡음. 실제 결함이 아니다.
    if (/webpack-hmr|WebSocket connection|CLIENT_FETCH_ERROR/.test(text)) return;
    // 제출 이력이 없을 때의 404는 설계된 신호다. 요청 필터와 같은 기준으로 제외한다.
    if (state.expect404 && /status of 404/.test(text)) return;
    if (/status of 409/.test(text)) return;   // 사전등록 범위 안내
    state.consoleErrors.push(text.slice(0, 200));
  });
  page.on("pageerror", (err) => state.pageErrors.push(String(err).slice(0, 200)));
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (url.includes("/_next/") || url.includes("favicon")) return;
    const pathname = new URL(url).pathname;
    // 제출 이력이 없을 때의 404는 화면이 '답안 입력으로 이동'을 판단하는 신호라 설계된 동작이다.
    if (status === 404 && /\/api\/(result|prediction|final-prediction)$/.test(pathname)) return;
    // 사전등록 범위 안내 409는 검증이 동작한 결과이며, 스크립트가 안내대로 재시도한다.
    if (status === 409 && pathname === "/api/pre-registration") return;
    // 상태코드만으로는 원인을 알 수 없다. 응답 본문까지 남긴다.
    state.badResponses.push(
      res
        .text()
        .then((body) => `${status} ${res.request().method()} ${pathname} — ${body.replace(/\s+/g, " ").slice(0, 160)}`)
        .catch(() => `${status} ${res.request().method()} ${pathname}`)
    );
  });
}

/** 본문 전체에서 정규식으로 긁으면 라벨을 오류로 오인한다. 실제 오류 요소만 읽는다. */
async function readErrorText(page) {
  return page.evaluate(() => {
    const el = document.querySelector(
      "p.bg-red-50, .text-red-600, .text-rose-700, .text-rose-600, [role=alert]"
    );
    return el ? el.innerText.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  });
}

async function drainWatchers(tenant, step, state) {
  for (const e of state.pageErrors) note(tenant, step, `미처리 예외: ${e}`);
  for (const e of state.consoleErrors) note(tenant, step, `콘솔 오류: ${e}`);
  for (const r of await Promise.all(state.badResponses)) note(tenant, step, `요청 실패: ${r}`);
  state.pageErrors.length = 0;
  state.consoleErrors.length = 0;
  state.badResponses.length = 0;
}

function readLatestResetCode() {
  try {
    const file = execFileSync(
      "docker",
      ["exec", CONTAINER, "sh", "-lc", "ls -t .mail-preview/password-reset-code-*.txt 2>/dev/null | head -n 1"],
      { encoding: "utf8" }
    ).trim();
    if (!file) return null;
    const content = execFileSync("docker", ["exec", CONTAINER, "cat", file], { encoding: "utf8" });
    const match = content.match(/인증코드:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fillIfPresent(page, selector, value) {
  const el = page.locator(selector);
  if ((await el.count()) === 0) return false;
  await el.first().fill(value);
  return true;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
});

for (const t of TENANTS) {
  console.log(`\n${"=".repeat(60)}\n${t.name} 사용자 워크플로우\n${"=".repeat(60)}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const state = { consoleErrors: [], pageErrors: [], badResponses: [], expect404: false };
  attachWatchers(page, state);

  const account = {
    // 이름은 한글만 허용된다(2~20자). 영문·숫자를 섞으면 가입이 거부된다.
    name: t.name === "police" ? "김검증" : "박검증",
    username: `qa${t.name}${suffix}`,
    phone: `010-9${suffix.slice(0, 3)}-${suffix.slice(4, 8)}`,
    email: `qa-${t.name}-${suffix}@example.test`,
    password: "QaWork!1234",
    nextPassword: "QaWork!5678",
  };

  // ── 0. 비로그인 차단 ───────────────────────────────────────
  // 사전등록은 로그인한 사용자만 가능해야 한다. 화면과 API 양쪽을 확인한다.
  try {
    const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const anon = await anonCtx.newPage();
    await anon.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
    await anon.waitForTimeout(1500);
    const landed = new URL(anon.url()).pathname;
    const hasExamNumber = await anon.locator("#examNumber").count();
    if (hasExamNumber > 0) {
      note(t.name, "비로그인 차단", `로그인하지 않았는데 응시번호 입력란이 노출됩니다(현재 ${landed}).`);
    } else if (!/\/login/.test(landed)) {
      const prompt = await anon.evaluate(() => /로그인/.test(document.body.innerText));
      if (!prompt) note(t.name, "비로그인 차단", `로그인 화면으로 보내지도, 로그인 안내를 보여주지도 않습니다(현재 ${landed}).`);
      else ok(t.name, "비로그인 차단", `화면 접근 차단 · 로그인 안내 표시(${landed})`);
    } else {
      ok(t.name, "비로그인 차단", `로그인 화면으로 이동(${landed})`);
    }

    // API 직접 호출도 막혀야 한다.
    const apiStatus = await anon.evaluate(async () => {
      try {
        const r = await fetch("/api/pre-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber: "00000000" }),
        });
        return r.status;
      } catch {
        return -1;
      }
    });
    if (apiStatus === 401 || apiStatus === 403) {
      ok(t.name, "비로그인 차단(API)", `사전등록 API가 ${apiStatus}로 거부`);
    } else {
      note(t.name, "비로그인 차단(API)", `비로그인 사전등록 요청이 ${apiStatus}를 반환합니다(401/403이어야 함).`);
    }
    await anonCtx.close();
  } catch (err) {
    note(t.name, "비로그인 차단", `예외: ${String(err).split("\n")[0]}`);
  }

  // ── 1. 회원가입 ────────────────────────────────────────────
  try {
    await page.goto(`${t.base}/register`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);

    await fillIfPresent(page, "#name", account.name);
    await fillIfPresent(page, "#username", account.username);
    await fillIfPresent(page, "#contactPhone", account.phone);
    await fillIfPresent(page, "#phone", account.phone);
    await fillIfPresent(page, "#email", account.email);
    await fillIfPresent(page, "#password", account.password);
    await fillIfPresent(page, "#passwordConfirm", account.password);

    // 동의 체크박스는 화면마다 id가 달라 전부 체크한다.
    const boxes = page.locator("input[type=checkbox]");
    const boxCount = await boxes.count();
    for (let i = 0; i < boxCount; i += 1) {
      const box = boxes.nth(i);
      if (await box.isVisible().catch(() => false)) {
        await box.check().catch(() => {});
      }
    }

    const submit = page.locator("form button[type=submit]").first();
    if ((await submit.count()) === 0) {
      note(t.name, "회원가입", "제출 버튼을 찾지 못했습니다.");
    } else {
      if (await submit.isDisabled()) {
        note(t.name, "회원가입", "모든 항목을 채웠는데 제출 버튼이 비활성 상태입니다.");
      }
      await submit.click();
      await page.waitForTimeout(6000);
      const url = page.url();
      if (/\/register/.test(url)) {
        const err = await readErrorText(page);
        note(t.name, "회원가입", `가입 후에도 회원가입 화면에 남아 있습니다. 오류: ${err || "(오류 요소 없음)"}`);
      } else {
        ok(t.name, "회원가입", `이동: ${new URL(url).pathname}`);
      }
    }
  } catch (err) {
    note(t.name, "회원가입", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "회원가입", state);

  // ── 2. 로그인 ─────────────────────────────────────────────
  try {
    await page.goto(`${t.base}/login`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1000);
    const loginId = t.name === "police" ? account.username : account.phone;
    const idField = page.locator("#username, #phone, input[name=username], input[name=phone]").first();
    if ((await idField.count()) === 0) {
      note(t.name, "로그인", "아이디 입력란을 찾지 못했습니다.");
    } else {
      await idField.fill(loginId);
      await page.locator("#password").fill(account.password);
      await Promise.all([
        page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 }).catch(() => {}),
        page.locator("form button[type=submit]").first().click(),
      ]);
      await page.waitForTimeout(2500);
      if (page.url().includes("/login")) {
        const err = await readErrorText(page);
        note(t.name, "로그인", `로그인 후에도 로그인 화면입니다. 오류: ${err || "(오류 요소 없음)"}`);
      } else {
        ok(t.name, "로그인");
      }
    }
  } catch (err) {
    note(t.name, "로그인", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "로그인", state);

  // ── 3. 사전등록 수험번호 입력 ──────────────────────────────
  try {
    await page.goto(`${t.base}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    const trigger = page
      .locator("button, a[role=button]")
      .filter({ hasText: /사전등록/ })
      .first();
    if ((await trigger.count()) === 0) {
      // 랜딩에 모달 진입점이 없어도 /exam/input 안에 사전등록 폼이 있을 수 있다.
      await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1800);
      const examNumber = page.locator("#examNumber");
      if ((await examNumber.count()) === 0) {
        note(t.name, "사전등록", "랜딩과 답안 입력 어디에도 응시번호 입력란이 없습니다.");
      } else {
        // 성명은 계정에서 자동 채워지는 읽기 전용 칸이라 건드리지 않는다.
        for (const sel of ["#gender", "#examType", "#examCategory", "#region"]) {
          const el = page.locator(sel);
          if ((await el.count()) === 0) continue;
          const options = await el.locator("option").evaluateAll((nodes) =>
            nodes.map((n) => n.value).filter(Boolean)
          );
          if (options.length) await el.selectOption(options[0]).catch(() => {});
          await page.waitForTimeout(300);
        }
        await examNumber.fill(examNumberValue);
        let rangeHint = "";   // 서버가 알려준 유효 범위 안내를 보관해 재시도에 쓴다

        const saveBtn = page.getByRole("button", { name: /사전등록 (저장|수정 저장)/ }).first();
        if ((await saveBtn.count()) === 0) {
          // 사전등록은 경찰 전용 기능이다(_FirePage.tsx에 관련 코드가 없다).
          if (t.name === "fire") ok(t.name, "사전등록", "소방은 사전등록을 제공하지 않는다(경찰 전용 기능)");
          else note(t.name, "사전등록", "응시번호는 입력되지만 사전등록 저장 버튼이 없습니다.");
        } else if (await saveBtn.isDisabled().catch(() => false)) {
          note(t.name, "사전등록", "응시정보를 모두 채웠는데 저장 버튼이 비활성입니다.");
        } else {
          // 안내된 범위 안에서 번호를 바꿔가며 시도한다(수험표대로 다시 입력하는 상황).
          const attemptSave = async () => {
            const btn = page.getByRole("button", { name: /사전등록 (저장|수정 저장)/ }).first();
            const [res] = await Promise.all([
              page
                .waitForResponse(
                  (r) => r.url().includes("/api/pre-registration") && r.request().method() === "POST",
                  { timeout: 30000 }
                )
                .catch(() => null),
              btn.click(),
            ]);
            await page.waitForTimeout(2500);
            return res;
          };

          let result = await attemptSave();
          for (let attempt = 0; attempt < 5; attempt += 1) {
            if (result && result.ok()) break;
            // 요청이 나가지 않았다면 클라이언트 검증에서 막힌 것이니 화면 문구를 읽는다.
            let hint = "";
            if (result) { try { hint = await result.text(); } catch { hint = ""; } }
            else hint = await readErrorText(page);
            if (pickInRange(hint)) rangeHint = hint;
            const next = pickInRange(hint, attempt) ?? pickInRange(rangeHint, attempt + 1);
            if (!next) break;
            await examNumber.fill(next);
            await page.waitForTimeout(400);
            result = await attemptSave();
          }
          if (!result) {
            note(t.name, "사전등록", "저장 버튼을 눌렀지만 저장 요청이 발생하지 않았습니다.");
          } else if (!result.ok()) {
            let detail = "";
            try { detail = (await result.text()).slice(0, 120); } catch {}
            note(t.name, "사전등록", `저장 실패 ${result.status()} — ${detail}`);
          } else {
            const confirmed = await page.evaluate(() =>
              /사전등록 완료|저장되었습니다|수정 저장/.test(document.body.innerText)
            );
            if (!confirmed) note(t.name, "사전등록", "저장 요청은 성공했는데 화면에 완료 표시가 없습니다.");
            else {
              ok(t.name, "사전등록", "응시정보 입력 → 저장 → 완료 표시까지 정상");
              const savedNumber = await examNumber.inputValue();

              // ① 다시 들어왔을 때 저장한 값이 복원되는가
              await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
              await page.waitForTimeout(2500);
              const restored = await page.locator("#examNumber").inputValue().catch(() => "");
              if (restored !== savedNumber) {
                note(t.name, "사전등록 복원", `재접속 시 응시번호가 복원되지 않습니다(저장 ${savedNumber} → 복원 ${restored || "빈값"}).`);
              } else {
                ok(t.name, "사전등록 복원", `재접속 시 ${restored} 복원`);
              }

              // ② 수정 저장이 되는가 — 같은 범위 안에서 번호를 하나 바꾼다
              const editTarget = pickInRange(rangeHint, 7) ?? savedNumber;
              if (editTarget !== savedNumber) {
                await page.locator("#examNumber").fill(editTarget);
                await page.waitForTimeout(400);
                const editRes = await attemptSave();
                if (!editRes) {
                  note(t.name, "사전등록 수정", "수정 저장 요청이 발생하지 않았습니다.");
                } else if (!editRes.ok()) {
                  let d = ""; try { d = (await editRes.text()).slice(0, 120); } catch {}
                  note(t.name, "사전등록 수정", `수정 저장 실패 ${editRes.status()} — ${d}`);
                } else {
                  await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
                  await page.waitForTimeout(2500);
                  const after = await page.locator("#examNumber").inputValue().catch(() => "");
                  if (after !== editTarget) note(t.name, "사전등록 수정", `수정한 번호가 반영되지 않았습니다(${editTarget} → ${after || "빈값"}).`);
                  else ok(t.name, "사전등록 수정", `${savedNumber} → ${editTarget} 수정 반영`);
                }
              }

              // ③ 삭제가 되는가
              const delBtn = page.getByRole("button", { name: /사전등록 (삭제|취소)/ }).first();
              if ((await delBtn.count()) === 0) {
                ok(t.name, "사전등록 삭제", "삭제 버튼을 제공하지 않는 화면 구성");
              } else {
                // 삭제는 window.confirm으로 확인을 받는다. 클릭 전에 수락 핸들러를 걸어야 한다.
                page.on("dialog", (d) => d.accept().catch(() => {}));
                await page.waitForTimeout(200);
                const [delRes] = await Promise.all([
                  page
                    .waitForResponse(
                      (r) => r.url().includes("/api/pre-registration") && r.request().method() === "DELETE",
                      { timeout: 30000 }
                    )
                    .catch(() => null),
                  delBtn.click(),
                ]);
                await page.waitForTimeout(2500);
                if (!delRes) note(t.name, "사전등록 삭제", "삭제 요청이 발생하지 않았습니다.");
                else if (!delRes.ok()) note(t.name, "사전등록 삭제", `삭제 실패 ${delRes.status()}`);
                else {
                  await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
                  await page.waitForTimeout(2500);
                  const left = await page.locator("#examNumber").inputValue().catch(() => "");
                  if (left) note(t.name, "사전등록 삭제", `삭제했는데 응시번호가 남아 있습니다(${left}).`);
                  else ok(t.name, "사전등록 삭제", "삭제 후 응시번호 비워짐");
                }
              }
            }
          }
        }
      }
    } else {
      await trigger.click();
      await page.waitForTimeout(2500);
      const dialog = page.locator("[role=dialog], .fixed").filter({ hasText: /사전등록|응시번호|수험번호/ }).first();
      if ((await dialog.count()) === 0) {
        note(t.name, "사전등록", "사전등록 버튼을 눌렀지만 모달이 열리지 않았습니다.");
      } else {
        const examNumber = page.locator("input").filter({ hasNot: page.locator("[type=checkbox]") });
        const inputCount = await examNumber.count();
        let filled = false;
        for (let i = 0; i < inputCount; i += 1) {
          const el = examNumber.nth(i);
          if (!(await el.isVisible().catch(() => false))) continue;
          const type = await el.getAttribute("type");
          if (type === "checkbox" || type === "radio") continue;
          await el.fill("12345678").catch(() => {});
          filled = true;
          break;
        }
        if (!filled) note(t.name, "사전등록", "모달은 열렸지만 수험번호 입력란이 없습니다.");
        else ok(t.name, "사전등록", "모달 열림 · 수험번호 입력 가능");
      }
    }
  } catch (err) {
    note(t.name, "사전등록", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "사전등록", state);

  // ── 4. 답안 입력 화면 진입 ─────────────────────────────────
  try {
    await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);
    const landed = new URL(page.url()).pathname;
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (landed.includes("/login")) {
      note(t.name, "답안 입력", "로그인 상태인데 로그인 화면으로 되돌아갔습니다.");
    } else if (/준비 중|이용할 수 없|비활성/.test(body)) {
      ok(t.name, "답안 입력", "기능이 닫힌 회차 상태 안내가 정상 표시됩니다.");
    } else {
      const controls = await page.locator("input, select, button").count();
      if (controls < 3) note(t.name, "답안 입력", `입력 컨트롤이 ${controls}개뿐입니다. 화면이 비어 있을 수 있습니다.`);
      else ok(t.name, "답안 입력", `컨트롤 ${controls}개 렌더`);
    }
  } catch (err) {
    note(t.name, "답안 입력", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "답안 입력", state);

  // ── 4-b. 답안 제출 ────────────────────────────────────────
  // 제출 없이 결과·예측을 열면 "제출 이력 없음"만 확인하게 된다. 실제 데이터로 검증한다.
  let submitted = false;
  try {
    await page.goto(`${t.base}/exam/input`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);

    // 시험 전 회차는 응시정보만 저장할 수 있고 OMR이 열리지 않는다. 제출 없음이 정상이다.
    const preExam = await page.evaluate(() =>
      /시험 전에는|시험 종료 후 다시 로그인/.test(document.body.innerText)
    );

    // 응시 정보(지역·성별·유형·수험번호)가 필요하면 채운다.
    for (const [sel, mode] of [["#gender", "MALE"], ["#examType", null], ["#region", null]]) {
      const el = page.locator(sel);
      if ((await el.count()) === 0) continue;
      const options = await el.locator("option").evaluateAll((nodes) =>
        nodes.map((n) => ({ value: n.value, label: n.textContent?.trim() ?? "" })).filter((o) => o.value)
      );
      if (options.length === 0) continue;
      await el.selectOption(mode ?? options[0].value).catch(() => {});
      await page.waitForTimeout(400);
    }
    const examNumber = page.locator("#examNumber");
    if ((await examNumber.count()) > 0 && (await examNumber.isVisible().catch(() => false))) {
      await examNumber.fill(examNumberValue).catch(() => {});
    }

    const quickToggle = page.getByRole("button", { name: /빠른입력/ }).first();
    if ((await quickToggle.count()) > 0) await quickToggle.click().catch(() => {});
    await page.waitForTimeout(800);

    // 과목 탭을 돌며 난이도를 고르고 문항을 채운다.
    const subjectTabs = page.locator("button").filter({ hasText: /\d+\s*\/\s*\d+/ });
    const tabCount = await subjectTabs.count();
    for (let i = 0; i < Math.max(tabCount, 1); i += 1) {
      if (tabCount > 0) await subjectTabs.nth(i).click().catch(() => {});
      await page.waitForTimeout(500);
      const normal = page.getByRole("button", { name: "보통", exact: true }).first();
      if ((await normal.count()) > 0) await normal.click().catch(() => {});
      const quick = page.locator("input[id*='-quick-']");
      const qCount = await quick.count();
      for (let q = 0; q < qCount; q += 1) {
        await quick.nth(q).fill(String((q % 4) + 1)).catch(() => {});
      }
    }
    await page.waitForTimeout(800);

    const submitBtn = page.getByRole("button", { name: /채점하기|제출|성적 확인/ }).last();
    if (preExam) {
      ok(t.name, "답안 제출", "시험 전 회차 — 응시정보만 저장 가능한 정상 상태");
    } else if ((await submitBtn.count()) === 0) {
      note(t.name, "답안 제출", "OMR이 열려 있는데 채점/제출 버튼을 찾지 못했습니다.");
    } else if (await submitBtn.isDisabled().catch(() => false)) {
      const filled = await page.locator("input[id*='-quick-']").count();
      note(t.name, "답안 제출", `문항 ${filled}개를 채웠는데 제출 버튼이 비활성입니다.`);
    } else {
      // 제출은 화면 전환을 일으킨다. evaluate로 먼저 읽으면 컨텍스트가 파괴되어 오탐이 난다.
      await Promise.all([
        page.waitForURL((u) => /\/exam\/(result|prediction)/.test(u.pathname), { timeout: 45000 }).catch(() => {}),
        submitBtn.click(),
      ]);
      await page.waitForTimeout(3000);
      const landed = new URL(page.url()).pathname;
      if (/\/exam\/result/.test(landed)) {
        submitted = true;
        ok(t.name, "답안 제출", `결과 화면으로 이동: ${landed}`);
      } else {
        const err = await readErrorText(page);
        note(t.name, "답안 제출", `제출 후 결과 화면으로 가지 않았습니다(현재 ${landed}). 오류: ${err || "(없음)"}`);
      }
    }
  } catch (err) {
    note(t.name, "답안 제출", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "답안 제출", state);

  // ── 5. 결과·예측 화면 ─────────────────────────────────────
  for (const [label, path] of [["성적 결과", "/exam/result"], ["합격 예측", "/exam/prediction"]]) {
    try {
      state.expect404 = !submitted;   // 제출 전이면 결과·예측 404가 정상이다
      await page.goto(t.base + path, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1800);
      const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
      if (/오류|실패했습니다|Error|문제가 발생/.test(body)) {
        note(t.name, label, `화면에 오류 문구가 있습니다: ${body.slice(0, 90)}`);
      } else if (submitted && /제출된 성적이 없|먼저 OMR/.test(body)) {
        note(t.name, label, "답안을 제출했는데도 '제출 이력 없음'으로 표시됩니다.");
      } else if (submitted && !/점|등수|순위|백분위|예측/.test(body)) {
        note(t.name, label, `제출 후인데 결과 수치가 보이지 않습니다: ${body.slice(0, 80)}`);
      } else {
        ok(t.name, label, submitted ? "제출 데이터로 렌더" : "제출 이력 없음 상태");
      }
    } catch (err) {
      note(t.name, label, `예외: ${String(err).split("\n")[0]}`);
    }
    await drainWatchers(t.name, label, state);
  }

  // ── 6. 계정 보안(비밀번호 변경) ────────────────────────────
  try {
    await page.goto(`${t.base}/account/security`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    const inputs = await page.locator("input[type=password]").count();
    if (inputs === 0) note(t.name, "계정 보안", "비밀번호 입력란이 없습니다.");
    else ok(t.name, "계정 보안", `비밀번호 입력란 ${inputs}개`);
  } catch (err) {
    note(t.name, "계정 보안", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "계정 보안", state);

  // ── 7. 비밀번호 찾기 ──────────────────────────────────────
  try {
    await ctx.clearCookies();
    await page.goto(`${t.base}/forgot-password`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    const before = readLatestResetCode();
    // 비밀번호 찾기는 통합 폼이라 아이디가 recoveryIdentity / recoveryEmail 이다.
    const identity = t.name === "police" ? account.username : account.phone;
    const filledIdentity = await fillIfPresent(page, "#recoveryIdentity", identity);
    const filledEmail = await fillIfPresent(page, "#recoveryEmail", account.email);
    if (!filledIdentity || !filledEmail) {
      note(t.name, "비밀번호 찾기", `입력란을 찾지 못했습니다(아이디 ${filledIdentity}, 이메일 ${filledEmail}).`);
    }
    const send = page.locator("form button[type=submit]").first();
    if ((await send.count()) === 0) {
      note(t.name, "비밀번호 찾기", "전송 버튼을 찾지 못했습니다.");
    } else {
      await send.click();
      await page.waitForTimeout(5000);
      const code = readLatestResetCode();
      if (!code) {
        const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
        note(t.name, "비밀번호 찾기", `인증코드 메일이 생성되지 않았습니다. 화면: ${body.replace(/\s+/g, " ").slice(0, 90)}`);
      } else if (code === before) {
        note(t.name, "비밀번호 찾기", "새 인증코드가 생성되지 않았습니다(이전 코드와 동일).");
      } else {
        ok(t.name, "비밀번호 찾기", "인증코드 발송 확인");
      }
    }
  } catch (err) {
    note(t.name, "비밀번호 찾기", `예외: ${String(err).split("\n")[0]}`);
  }
  await drainWatchers(t.name, "비밀번호 찾기", state);

  await ctx.close();
}

await browser.close();

console.log(`\n${"=".repeat(60)}\n요약\n${"=".repeat(60)}`);
console.log(`정상 ${passed.length}건 / 문제 ${findings.length}건`);
if (findings.length) {
  for (const f of findings) console.log(`  - ${f.tenant} · ${f.step}: ${f.detail}`);
}
