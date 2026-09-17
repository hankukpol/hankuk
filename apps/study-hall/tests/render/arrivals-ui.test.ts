/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import type { ArrivalDayResult, ArrivalRecord, ArrivalRow } from "../../lib/arrivals";

const root = path.resolve(__dirname, "../..");
const localRequire = createRequire(path.join(root, "package.json"));
type Node = { type: unknown; props: Record<string, any> };
type Slot = { value?: any; deps?: unknown[]; cleanup?: void | (() => void) };
type Request = { url: string; method?: string; body?: string; signal?: AbortSignal; resolve: (response: any) => void; reject: (error: Error) => void };

// Real component handlers + the real request hook; controlled hook lifetimes and
// out-of-order HTTP replies. Layout/focus trapping are checked in the browser.
function mount(file: string, exportName: string, initialProps: Record<string, any>) {
  const slots: Slot[] = [];
  let cursor = 0, sequence = 0, result: any, props = initialProps;
  let live = true, lateWrites = 0, focusCount = 0;
  const effects: (() => void)[] = [];
  const requests: Request[] = [];
  const intervals = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  const storage = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const document = { visibilityState: "visible", addEventListener: (key: string, callback: () => void) => listeners.set(key, callback), removeEventListener: (key: string) => listeners.delete(key) };
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next: any) => { if (!live) lateWrites++; slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }];
    },
    useRef(initial: any) { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value; },
    useMemo(factory: () => any, deps: unknown[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useCallback(callback: any, deps: unknown[]) { return hooks.useMemo(() => callback, deps); },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  const schedule = (collection: Map<number, () => void>, callback: () => void) => { collection.set(++sequence, callback); return sequence; };
  const modules = new Map<string, any>();
  const opaque = new Proxy({}, { get: (_target, key) => String(key) });
  const common: Record<string, any> = {
    AbortController, Error, document, console,
    fetch: (url: string, options: any = {}) => new Promise((resolve, reject) => requests.push({ url, ...options, resolve, reject })),
    setInterval: (callback: () => void) => schedule(intervals, callback), clearInterval: (id: number) => intervals.delete(id),
    setTimeout: (callback: () => void) => schedule(timers, callback), clearTimeout: (id: number) => timers.delete(id),
    requestAnimationFrame: (callback: () => void) => schedule(frames, callback), cancelAnimationFrame: (id: number) => frames.delete(id),
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  };
  common.window = common;
  function load(relative: string): any {
    const filename = path.join(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} as any };
    modules.set(filename, module);
    const context = { ...common, module, exports: module.exports, require: (name: string): any => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { Fragment: "Fragment", jsx: (type: unknown, nodeProps: any) => ({ type, props: nodeProps }), jsxs: (type: unknown, nodeProps: any) => ({ type, props: nodeProps }) };
      if (name === "./arrival-client") return load("components/arrivals/arrival-client.ts");
      if (name === "./ArrivalConfigSummary") return load("components/arrivals/ArrivalConfigSummary.tsx");
      if (name === "@/lib/useDialogFocus") return { useDialogFocus: () => hooks.useRef(null) };
      if (name === "framer-motion") return { AnimatePresence: "AnimatePresence", motion: new Proxy({}, { get: (_target, key) => `motion.${String(key)}` }), useReducedMotion: () => true };
      if (name.startsWith("@/lib/")) return localRequire(path.join(root, name.slice(2)));
      if (name.startsWith("@/components/") || name.startsWith("./") || name === "lucide-react") return opaque;
      if (name === "next/link") return { __esModule: true, default: "Link" };
      throw new Error(`Unexpected import: ${name}`);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename });
    return module.exports;
  }
  const loaded = load(file);
  function nodes(predicate: (node: Node) => boolean) {
    const found: Node[] = [];
    function visit(value: any) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object" || !value.props) return;
      if (predicate(value)) found.push(value);
      Object.values(value.props).forEach(visit);
    }
    visit(result); return found;
  }
  function render(nextProps = props) {
    props = nextProps; cursor = 0;
    result = exportName === "useArrivalQuery" ? loaded[exportName](props.url, props.pollMs) : loaded[exportName](props);
    nodes(n => n.type === "input" && n.props.ref).forEach(node => { node.props.ref.current = { focus: () => focusCount++ }; });
    while (effects.length) effects.shift()!();
    return result;
  }
  render();
  return {
    render, nodes, requests, storage, intervals, timers, document, get result() { return result; },
    get lateWrites() { return lateWrites; }, get focusCount() { return focusCount; },
    poll() { intervals.forEach(callback => callback()); },
    focus() { const callbacks = Array.from(frames.values()); frames.clear(); callbacks.forEach(callback => callback()); },
    unmount() { live = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

type View = ReturnType<typeof mount>;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function respond(view: View, index: number, data: unknown, status = 200) {
  view.requests[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
  await settle(); view.render(); view.render();
}
const props = { divisionSlug: "police", divisionName: "검사 학원" };
const input = (view: View) => view.nodes(node => node.type === "input")[0];
function pressDigits(view: View, digits: string) {
  for (const digit of digits) { input(view).props.onChange({ target: { value: input(view).props.value + digit } }); view.render(); }
}
const kiosk = () => mount("components/arrivals/ArrivalKiosk.tsx", "ArrivalKiosk", props);

test("arrival polling: one request in flight, newest URL wins, hidden pages pause, unmount aborts", async () => {
  const view = mount("components/arrivals/arrival-client.ts", "useArrivalQuery", { url: "/day-a", pollMs: 5000 });
  view.poll(); view.poll(); assert.equal(view.requests.length, 1);
  view.render({ url: "/day-b", pollMs: 5000 });
  assert.equal(view.requests[0].signal?.aborted, true);
  await respond(view, 1, { date: "b" });
  await respond(view, 0, { date: "a" });
  assert.equal(view.result.data.date, "b");
  view.document.visibilityState = "hidden"; view.poll(); assert.equal(view.requests.length, 2);
  view.document.visibilityState = "visible"; view.poll(); assert.equal(view.requests.length, 3);
  view.unmount(); assert.equal(view.requests[2].signal?.aborted, true);
  view.requests[2].resolve({ ok: true, json: async () => ({ date: "late" }) }); await settle();
  assert.equal(view.lateWrites, 0);
});

test("kiosk uses native numeric input, preserves zeroes, blocks duplicate submission and resets for the next student", async () => {
  const view = kiosk();
  await respond(view, 0, { status: "ready", numberLength: 5, popupMs: 1200 });
  pressDigits(view, "00123");
  view.nodes(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(view.requests.length, 2);
  assert.deepEqual(JSON.parse(view.requests[1].body!), { studentNumber: "00123" });
  view.render(); assert.equal(view.nodes(node => node.type === "ActionCompleteModal")[0].props.open, false);
  await respond(view, 1, { ok: true, popupMs: 1200 });
  const modal = view.nodes(node => node.type === "ActionCompleteModal")[0];
  assert.equal(modal.props.open, true); assert.equal(modal.props.title, "출석 확인되었습니다.");
  assert.equal(modal.props.autoCloseMs, 1200);
  modal.props.onClose(); view.render(); view.focus();
  assert.equal(input(view).props.value, ""); assert.equal(view.focusCount, 0);
  assert.equal(input(view).props.readOnly, undefined);
  assert.equal(input(view).props.inputMode, "numeric");
  assert.equal(input(view).props.pattern, "[0-9]*");
  assert.equal(input(view).props.disabled, false);
  assert.equal(input(view).props.onPointerDown, undefined);
  assert.equal(view.nodes(node => node.type === "button" && /^\d$/.test(node.props["aria-label"] ?? "")).length, 0);
  pressDigits(view, "00456");
  assert.equal(view.requests.length, 3);
  assert.equal(view.storage.size, 0);
  view.unmount();
});

test("kiosk clears invalid numbers but keeps the draft after communication failure", async () => {
  const view = kiosk(); await respond(view, 0, { status: "ready", numberLength: 5, popupMs: 1200 });
  pressDigits(view, "88888");
  await respond(view, 1, { error: "수험번호를 확인해 주세요." }, 400);
  assert.equal(input(view).props.value, "");
  assert.equal(view.requests[2].url, "/api/police/arrival-kiosk");
  assert.equal(view.requests[2].method, undefined);
  await respond(view, 2, { status: "ready", numberLength: 5, popupMs: 1200 });
  pressDigits(view, "00123");
  view.requests[3].reject(new Error("연결 실패")); await settle(); view.render();
  assert.equal(input(view).props.value, "00123");
  assert.equal(view.nodes(node => node.type === "ActionCompleteModal")[0].props.open, false);
  view.unmount();
});

test("disabled kiosk still offers pairing and stores only the public registration code", async () => {
  const view = kiosk(); await respond(view, 0, { status: "disabled" });
  const button = view.nodes(node => node.type === "button" && node.props.children === "기기 등록코드 받기")[0];
  assert.ok(button); button.props.onClick(); button.props.onClick();
  assert.equal(view.requests.length, 2);
  await respond(view, 1, { code: "ABCDEF012345", expiresAt: "2026-09-20T00:00:00Z" });
  assert.equal(view.storage.get("arrival-pair-code:police"), "ABCDEF012345");
  assert.equal(view.storage.size, 1);
  view.unmount();
});

test("settings save is locked until the exact draft is previewed and never reports success on failure", async () => {
  const config = { enabled: false, effectiveDate: "2026-09-01", numberLength: 5, popupMs: 1200, deviceDays: 30 };
  let saved = 0;
  const view = mount("components/arrivals/ArrivalSettingsEditor.tsx", "ArrivalSettingsEditor", { divisionSlug: "police", settings: { revision: 2, current: config, devices: [], versions: [] }, onClose() {}, onSaved() { saved++; }, onReload: async () => null });
  const saveButton = () => view.nodes(node => node.type === "button" && node.props.children === "설정 저장")[0];
  assert.equal(saveButton().props.disabled, true);
  view.nodes(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(view.requests[0].url, "/api/police/arrival-settings/preview");
  const body = JSON.parse(view.requests[0].body!);
  await respond(view, 0, { revision: 2, before: config, after: body.config, eligibleCount: 2, matchingCount: 2, mismatchedCount: 0 });
  assert.equal(saveButton().props.disabled, false);
  saveButton().props.onClick(); saveButton().props.onClick();
  assert.equal(view.requests.length, 2); assert.equal(saved, 0);
  await respond(view, 1, { error: "충돌" }, 409); assert.equal(saved, 0);
  assert.equal(saveButton().props.disabled, true);
  view.unmount();
});

test("student calendar only calls the own-record endpoint", () => {
  const view = mount("components/arrivals/StudentArrivals.tsx", "StudentArrivals", props);
  assert.equal(view.requests.length, 1);
  assert.match(view.requests[0].url, /^\/api\/police\/student\/arrivals\?month=/);
  assert.doesNotMatch(view.requests[0].url, /studentId/);
  view.unmount();
});

test("detail polling preserves correction drafts and detects concurrent version changes", async () => {
  const record = { id: "record-a", studentId: "student-a", date: "2026-09-15", effectiveAt: "2026-09-15T00:00:00Z", version: 1, cancelledAt: null };
  const result = { month: "2026-09", today: "2026-09-15", records: [record], history: [], student: { id: "student-a", name: "학생", studentNumber: "00123" } };
  const view = mount("components/arrivals/ArrivalStudentDetail.tsx", "ArrivalStudentDetail", { divisionSlug: "police", selection: { studentId: "student-a", name: "학생", studentNumber: "00123", date: "2026-09-15" }, onClose() {}, onSaved() {} });
  await respond(view, 0, result);
  view.nodes(node => node.type === "button" && node.props.children === "시각 정정")[0].props.onClick(); view.render();
  view.nodes(node => node.type === "textarea")[0].props.onChange({ target: { value: "접수 시각 재확인" } }); view.render();
  view.poll(); await respond(view, 1, { ...result, records: [{ ...record, version: 2, effectiveAt: "2026-09-15T00:10:00Z" }] });
  assert.equal(view.nodes(node => node.type === "textarea")[0].props.value, "접수 시각 재확인");
  assert.equal(view.nodes(node => node.type === "input" && node.props.type === "time")[0].props.value, "09:00:00");
  assert.equal(view.nodes(node => node.type === "button" && node.props.children === "기록 저장")[0].props.disabled, true);
  view.unmount();
});

test("completion auto-close is opt-in, retains the deadline across renders, and cancels on close", () => {
  let closes = 0;
  const view = mount("components/ui/ActionCompleteModal.tsx", "ActionCompleteModal", { open: true, title: "완료", onClose() { closes++; } });
  assert.equal(view.timers.size, 0);
  view.render({ open: true, title: "완료", autoCloseMs: 1200, onClose() { closes++; } });
  assert.equal(view.timers.size, 1);
  const timerId = Array.from(view.timers.keys())[0];
  view.render({ open: true, title: "완료", autoCloseMs: 1200, onClose() { closes += 2; } });
  assert.equal(Array.from(view.timers.keys())[0], timerId);
  view.timers.get(timerId)!(); assert.equal(closes, 2);
  view.render({ open: false, title: "완료", autoCloseMs: 1200, onClose() {} });
  assert.equal(view.timers.size, 0);
  view.unmount();
});

test("a successful mutation response invalidates an older GET even if it completes later", async () => {
  const view = mount("components/arrivals/arrival-client.ts", "useArrivalQuery", { url: "/settings", pollMs: 0 });
  view.result.accept({ revision: 3, devices: ["approved-device"] }); view.render();
  await respond(view, 0, { revision: 2, devices: [] });
  assert.equal(view.result.data.revision, 3);
  assert.equal(view.result.data.devices[0], "approved-device");
  view.unmount();
});

test("shared month calendar labels administrator changes and cancellation", () => {
  const view = mount("components/arrivals/ArrivalCalendar.tsx", "ArrivalCalendar", { month: "2026-09", today: "2026-09-15", onMonthChange() {}, records: [
    { date: "2026-09-01", effectiveAt: "2026-09-01T00:15:00Z", source: "ADMIN_CORRECTED", cancelledAt: null },
    { date: "2026-09-02", effectiveAt: "2026-09-02T00:20:00Z", source: "ADMIN_ADDED", cancelledAt: null },
    { date: "2026-09-03", effectiveAt: "2026-09-03T00:25:00Z", source: "KIOSK", cancelledAt: "2026-09-03T01:00:00Z" },
  ] });
  const labels = view.nodes(node => node.type === "div" && node.props.className === "admin-arrival-day").map(node => node.props["aria-label"]);
  assert.ok(labels.includes("2026-09-01, 09:15, 관리자 정정"));
  assert.ok(labels.includes("2026-09-02, 09:20, 관리자 추가"));
  assert.ok(labels.includes("2026-09-03, 취소"));
  view.unmount();
});

test("missing arrivals include eligible students only while recorded withdrawn students remain accessible", async () => {
  const view = mount("components/arrivals/ArrivalsManager.tsx", "ArrivalsManager", props);
  const today = new URL(view.requests[0].url, "http://localhost").searchParams.get("date")!;
  const record = (id: string, cancelled: boolean): ArrivalRecord => ({
    id, divisionId: "division-police", studentId: id, date: today,
    firstReceivedAt: `${today}T00:00:00Z`, effectiveAt: `${today}T00:00:00Z`, source: "KIOSK",
    deviceId: "device-a", deviceName: "검사 기기", cancelledAt: cancelled ? `${today}T01:00:00Z` : null,
    version: cancelled ? 2 : 1, createdAt: `${today}T00:00:00Z`, updatedAt: `${today}T01:00:00Z`,
  });
  const rows: ArrivalRow[] = [
    { studentId: "eligible-empty", name: "재원 미기록", studentNumber: "00101", isEligible: true, record: null },
    { studentId: "eligible-cancelled", name: "휴원 취소", studentNumber: "00102", isEligible: true, record: record("eligible-cancelled", true) },
    { studentId: "withdrawn-cancelled", name: "퇴원 취소", studentNumber: "00103", isEligible: false, record: record("withdrawn-cancelled", true) },
    { studentId: "withdrawn-recorded", name: "퇴원 유효기록", studentNumber: "00104", isEligible: false, record: record("withdrawn-recorded", false) },
    { studentId: "eligible-recorded", name: "재원 유효기록", studentNumber: "00105", isEligible: true, record: record("eligible-recorded", false) },
  ];
  const data: ArrivalDayResult = { date: today, today, rows, recordedCount: 2, missingCount: 2, refreshedAt: `${today}T01:00:00Z` };
  await respond(view, 0, data);
  const visibleNames = () => view.nodes(node => node.type === "button" && node.props.className === "admin-table-link" && typeof node.props.children === "string").map(node => node.props.children);
  assert.deepEqual(visibleNames().sort(), ["재원 유효기록", "퇴원 유효기록"].sort());
  view.nodes(node => node.type === "button" && node.props.className === "admin-choice-button" && node.props.children[0] === "미기록 ")[0].props.onClick();
  view.render();
  assert.deepEqual(visibleNames().sort(), ["재원 미기록", "휴원 취소"].sort());
  assert.equal(visibleNames().length, data.missingCount);
  // The filter must not delete the cancelled row retained by the API for history.
  assert.equal(data.rows.length, 5);
  assert.equal(data.rows.find(row => row.studentId === "withdrawn-cancelled")?.record?.version, 2);
  view.unmount();
});
