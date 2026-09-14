import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { makeCheckDraft, parseCheckDraft, restoreCheckDraft, reconcileCheckCells } from "../lib/check-draft";

test("draft recovery rejects expired/invalid data and preserves newer server records", () => {
  const baseline = { a: { status: "", note: "" }, b: { status: "PRESENT", note: "" }, c: { status: "", note: "" } };
  const edited = { a: { status: "ABSENT", note: "사유" }, b: { status: "TARDY", note: "" }, c: { status: "PRESENT", note: "" } };
  const draft = makeCheckDraft(edited, baseline, 1000);
  assert.deepEqual(parseCheckDraft(JSON.stringify(draft), 2000), draft);
  assert.equal(parseCheckDraft(JSON.stringify(draft), 1000 + 86_400_001), null);
  assert.equal(parseCheckDraft('{"version":1,"changes":[]}', 2000), null);
  const recovered = restoreCheckDraft(draft, { ...baseline, b: { status: "EXCUSED", note: "새 기록" }, c: edited.c });
  assert.deepEqual(recovered, { patch: { a: edited.a }, conflicts: 1 });
  assert.deepEqual(reconcileCheckCells(edited, { ...edited, a: baseline.a }, baseline), { ...baseline, a: edited.a });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const require = createRequire(import.meta.url);
test("check forms: navigation, draft recovery and deferred saving", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/check", pretendToBeVisual: true });
  const React = require("react") as typeof import("react");
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    React, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  };
  const descriptors = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
  const { Simulate } = require("react-dom/test-utils") as typeof import("react-dom/test-utils");
  const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
  const { UnsavedChangesGuard } = await import("../components/ui/UnsavedChangesGuard");
  const { CheckDraftSafety, CheckDraftOwner } = await import("../components/ui/CheckDraftSafety");
  const { requestCheckNavigation, hasPendingCheckChanges } = await import("../lib/check-navigation");
  const { MobileCheckForm } = await import("../components/attendance/MobileCheckForm");
  const { AdminAttendanceBoard } = await import("../components/attendance/AdminAttendanceBoard");
  const { PhoneCheckForm } = await import("../components/phones/PhoneCheckForm");
  const { PhoneWorkspaceTabs } = await import("../components/phones/PhoneWorkspaceTabs");
  const h = React.createElement;
  const { act } = React;
  const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); }); };
  const button = (text: string, parent: ParentNode = document) => {
    const found = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find((node) => node.textContent?.trim() === text);
    assert.ok(found, `button ${text} exists`); return found;
  };
  const click = async (node: HTMLElement) => { await act(async () => { node.click(); }); };
  const change = async (node: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => { node.value = value; Simulate.change(node); });
  };
  const students = ["s1", "s2"].map((id, i) => ({ id, name: `학생${i + 1}`, studentNumber: `1000${i + 1}`, seatLabel: `${i + 1}`, seatDisplay: `${i + 1}`, studyRoomName: "자습실", studyTrack: null }));
  const periods = ["p1", "p2"].map((id, i) => ({ id, name: `${i + 1}교시`, label: null, startTime: "00:00", endTime: "23:59", isMandatory: true, isActive: true }));
  const attendanceProps = { divisionSlug: "police", initialDate: "2020-01-01", initialStudents: students, initialPeriods: periods, initialRecords: [] };
  const phoneSnapshot = (records: Array<{ studentId: string; status: "SUBMITTED" | "NOT_SUBMITTED" | "RENTED"; rentalNote?: string }> = []) => ({
    date: "2020-01-01", attendanceIntegrationEnabled: false, students,
    periods: periods.map((period) => ({ periodId: period.id, periodName: period.name, periodLabel: null, startTime: period.startTime, endTime: period.endTime,
      records: period.id === "p1" ? records : [], attendance: [], attendanceUnprocessedCount: 0, attendanceBlockedCount: 0 })),
  });
  const mount = () => {
    localStorage.clear(); sessionStorage.clear();
    window.history.replaceState({ __NA: true }, "", "/before");
    window.history.pushState({ __NA: true }, "", "/check");
    const pushes: string[] = [];
    const router = { push: (url: string) => pushes.push(url), replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const root = createRoot(document.getElementById("root")!);
    return {
      pushes,
      render: async (child: import("react").ReactNode, owner = "staff1") => { await act(async () => { root.render(h(AppRouterContext.Provider, { value: router }, h(CheckDraftOwner, { owner, children: child }))); }); },
      destroy: async () => { await act(async () => root.unmount()); await tick(); },
    };
  };
  try {
    await t.test("phone workspace keeps a dirty check panel visible when history is selected", async () => {
      const view = mount();
      try {
        await view.render(h(PhoneWorkspaceTabs, { divisionSlug: "police", pointsEnabled: false,
          check: h(UnsavedChangesGuard, { isDirty: true }) }));
        await click(button("이력 조회"));
        assert.equal(document.getElementById("phone-workspace-panel-check")?.hidden, false);
        assert.equal(document.getElementById("phone-workspace-history")?.getAttribute("aria-selected"), "false");
        await click(button("머무르기"));
        assert.equal(document.getElementById("phone-workspace-panel-check")?.hidden, false);
      } finally { await view.destroy(); }
    });
    await t.test("links, date actions, beforeunload and Back require an explicit discard; saving blocks it", async () => {
      const view = mount(); let discarded = 0; let moved = 0;
      const render = (dirty: boolean, saving = false) => view.render(h(React.Fragment, null,
        h(UnsavedChangesGuard, { isDirty: dirty, isSaving: saving, onDiscard: () => { discarded++; } }), h("a", { href: "/phones" }, "휴대폰")));
      try {
        await render(true);
        const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
        assert.equal(unload.defaultPrevented, true);
        await click(document.querySelector("a")!); assert.deepEqual(view.pushes, []);
        await click(button("머무르기")); assert.equal(discarded, 0);
        await act(async () => requestCheckNavigation(() => { moved++; }));
        await click(button("머무르기")); assert.equal(moved, 0);
        await render(true, true);
        await act(async () => requestCheckNavigation(() => { moved++; }));
        assert.equal(button("저장하지 않고 떠나기").disabled, true);
        await render(true, false); await click(button("머무르기"));
        await act(async () => window.history.back()); await tick(); await tick();
        assert.equal(window.location.pathname, "/check");
        assert.ok(button("머무르기"));
        await click(button("머무르기"));
        await act(async () => window.history.back()); await tick(); await tick();
        await click(button("저장하지 않고 떠나기")); await tick(); await tick();
        assert.equal(discarded, 1); assert.equal(window.location.pathname, "/before");
        assert.equal(moved, 0);
      } finally { await view.destroy(); }
    });

    await t.test("saving cleanly removes the history guard and permits navigation", async () => {
      const view = mount(); let moved = 0;
      try {
        await view.render(h(UnsavedChangesGuard, { isDirty: true }));
        await view.render(h(UnsavedChangesGuard, { isDirty: false })); await tick();
        assert.equal(window.history.state.studyHallCheckGuard, undefined);
        assert.equal(hasPendingCheckChanges(), false);
        await act(async () => requestCheckNavigation(() => { moved++; })); assert.equal(moved, 1);
        await act(async () => window.history.back()); await tick();
        assert.equal(window.location.pathname, "/before");
      } finally { await view.destroy(); }
    });

    await t.test("drafts survive remount, stay account-scoped and are not discarded by Escape", async () => {
      const view = mount(); const baseline = { s1: { status: "", note: "" } }; const edited = { s1: { status: "ABSENT", note: "메모" } };
      let restored: unknown;
      const render = (owner: string, values = baseline) => view.render(h(CheckDraftSafety, { scope: "test:date", values, baseline, onRestore: (patch) => { restored = patch; }, onDiscard() {} }), owner);
      try {
        await render("staff1", edited);
        assert.equal(localStorage.length, 1);
        await view.render(null); await tick();
        await render("staff2"); assert.equal(document.querySelector('[role="dialog"]'), null);
        await view.render(null); await render("staff1");
        assert.match(document.body.textContent!, /미저장 입력 복구/);
        await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        assert.ok(button("입력 복구")); assert.equal(localStorage.length, 1);
        await click(button("입력 복구")); assert.deepEqual(restored, edited);
      } finally { await view.destroy(); }
    });

    await t.test("mobile attendance keeps edits during save, prevents double save and guards period changes", async (t) => {
      const view = mount(); const requests: Array<{ body: { periodId: string; records: unknown[] }; result: ReturnType<typeof deferred<Response>> }> = [];
      t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { const result = deferred<Response>(); requests.push({ body: JSON.parse(String(options?.body)), result }); return result.promise; });
      try {
        await view.render(h(MobileCheckForm, { ...attendanceProps, initialPeriodId: "p1" }));
        const row = () => document.querySelector("tbody tr")!;
        await click(button("출석", row()));
        await click(button("2교시"));
        assert.ok(button("머무르기")); await click(button("머무르기"));
        await click(button("저장")); await click(button("저장"));
        assert.equal(requests.length, 1);
        await click(button("결석", row()));
        await act(async () => requests[0].result.resolve(Response.json({ students, records: [{ studentId: "s1", periodId: "p1", status: "PRESENT", reason: null }] })));
        assert.equal(button("결석", row()).getAttribute("aria-pressed"), "true");
        assert.equal(hasPendingCheckChanges(), true);
        await click(button("저장")); assert.equal(requests.length, 2);
        await act(async () => requests[1].result.reject(new Error("offline")));
        assert.equal(button("결석", row()).getAttribute("aria-pressed"), "true");
        assert.equal(hasPendingCheckChanges(), true);
      } finally { await view.destroy(); }
    });

    await t.test("period refresh guards the whole list and edits made while fetching", async (t) => {
      const view = mount();
      const refreshes: Array<ReturnType<typeof deferred<Response>>> = [];
      const nextPeriods = [{ ...periods[1], name: "2교시 변경", startTime: "06:10", endTime: "23:59" }];
      t.mock.method(globalThis, "fetch", async (url: unknown) => {
        if (String(url).includes("periodId=")) return Response.json({ students, records: [], periods: nextPeriods });
        const result = deferred<Response>(); refreshes.push(result); return result.promise;
      });
      try {
        await view.render(h(MobileCheckForm, { ...attendanceProps, initialPeriodId: "p1" }));
        const row = () => document.querySelector("tbody tr")!;
        await click(button("현재 교시 맞추기")); assert.equal(refreshes.length, 1);
        await click(button("결석", row()));
        await act(async () => refreshes[0].resolve(Response.json({ periods: nextPeriods })));
        assert.ok(button("머무르기"));
        assert.equal(button("1교시").getAttribute("aria-selected"), "true");
        assert.equal(button("결석", row()).getAttribute("aria-pressed"), "true");
        await click(button("머무르기"));
        await click(button("현재 교시 맞추기"));
        assert.equal(refreshes.length, 1, "dirty input must be reviewed before fetching");
        await click(button("저장하지 않고 떠나기")); await tick(); await tick();
        assert.equal(refreshes.length, 2);
        await act(async () => refreshes[1].resolve(Response.json({ periods: nextPeriods })));
        await tick();
        assert.equal(button("2교시 변경").getAttribute("aria-selected"), "true");
        assert.equal(Array.from(document.querySelectorAll('[role="tab"]')).some((node) => node.textContent === "1교시"), false);
        assert.equal(hasPendingCheckChanges(), false);
        await click(button("현재 교시 맞추기"));
        await act(async () => refreshes[2].resolve(Response.json({ periods: [] })));
        assert.equal(document.querySelector('[role="tablist"][aria-label="출석 확인 교시"]'), null);
      } finally { await view.destroy(); }
    });

    await t.test("period refresh ignores an older response after moving to another period", async (t) => {
      const view = mount(); const refresh = deferred<Response>();
      t.mock.method(globalThis, "fetch", async (url: unknown) => String(url).includes("periodId=")
        ? Response.json({ students, records: [], periods }) : refresh.promise);
      try {
        await view.render(h(MobileCheckForm, { ...attendanceProps, initialPeriodId: "p1" }));
        await click(button("현재 교시 맞추기"));
        await click(button("2교시")); await tick();
        await act(async () => refresh.resolve(Response.json({ periods: [periods[0]] })));
        assert.equal(button("2교시").getAttribute("aria-selected"), "true");
      } finally { await view.destroy(); }
    });

    await t.test("admin partial failure retries only failed periods and later edits", async (t) => {
      const view = mount(); const requests: Array<{ body: { periodId: string; records: Array<{ status: string }> }; result: ReturnType<typeof deferred<Response>> }> = [];
      t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { const result = deferred<Response>(); requests.push({ body: JSON.parse(String(options?.body)), result }); return result.promise; });
      try {
        await view.render(h(AdminAttendanceBoard, { ...attendanceProps, initialStats: { totals: {}, attendanceRate: 0 } }));
        const select = (period: string) => document.querySelector<HTMLSelectElement>(`select[aria-label="학생1 ${period}교시 출결 상태"]`)!;
        await change(select("1"), "PRESENT"); await change(select("2"), "ABSENT");
        await click(button("전체 저장")); assert.equal(requests.length, 1);
        await act(async () => requests[0].result.resolve(Response.json({})));
        assert.equal(requests.length, 2);
        await act(async () => requests[1].result.reject(new Error("offline")));
        await click(button("전체 저장")); assert.equal(requests[2].body.periodId, "p2");
        assert.equal(requests[2].body.records.length, 1);
        await change(select("1"), "TARDY");
        await act(async () => requests[2].result.reject(new Error("offline")));
        await click(button("전체 저장")); assert.equal(requests[3].body.periodId, "p1");
        assert.equal(requests[3].body.records[0].status, "TARDY");
        await act(async () => requests[3].result.reject(new Error("offline")));
        assert.equal(hasPendingCheckChanges(), true);
      } finally { await view.destroy(); }
    });

    await t.test("phone writes serialize, preserve rental edits, guard refresh and retry failed cells only", async (t) => {
      const view = mount(); const requests: Array<{ body: { records: Array<{ studentId: string; status: string; rentalNote?: string }> }; result: ReturnType<typeof deferred<Response>> }> = [];
      t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { const result = deferred<Response>(); requests.push({ body: JSON.parse(String(options?.body)), result }); return result.promise; });
      try {
        await view.render(h(PhoneCheckForm, { divisionSlug: "police", initialDate: "2020-01-01", initialActivePeriodId: "p1", initialSnapshot: phoneSnapshot() as never }));
        const row = (name: string) => Array.from(document.querySelectorAll("tbody tr")).find((node) => node.querySelector(".admin-table-link")?.textContent?.trim() === name)!;
        await click(button("대여", row("학생1")));
        await click(button("반납", row("학생2")));
        assert.equal(requests.length, 1, "second write must wait for first acknowledgement");
        const note = row("학생1").querySelector<HTMLInputElement>("input")!;
        await change(note, "수업 대여");
        await click(button("새로고침")); assert.ok(button("저장하지 않고 떠나기").disabled);
        await act(async () => requests[0].result.resolve(Response.json({ snapshot: phoneSnapshot([{ studentId: "s1", status: "RENTED" }]) })));
        assert.equal(requests.length, 2);
        await act(async () => requests[1].result.resolve(Response.json({ snapshot: phoneSnapshot([{ studentId: "s1", status: "RENTED" }, { studentId: "s2", status: "SUBMITTED" }]) })));
        await click(button("머무르기"));
        assert.equal(row("학생1").querySelector<HTMLInputElement>("input")?.value, "수업 대여");
        await click(button("저장"));
        assert.equal(requests[2].body.records.length, 1);
        assert.equal(requests[2].body.records[0].rentalNote, "수업 대여");
        await act(async () => requests[2].result.reject(new Error("offline")));
        assert.match(row("학생1").textContent!, /저장 실패/);
        assert.equal(hasPendingCheckChanges(), true);
        await click(button("새로고침")); await click(button("머무르기"));
        assert.equal(requests.length, 3);
        await click(button("저장"));
        await act(async () => requests[3].result.resolve(Response.json({ snapshot: phoneSnapshot([{ studentId: "s1", status: "RENTED", rentalNote: "수업 대여" }, { studentId: "s2", status: "SUBMITTED" }]) })));
        await tick(); assert.equal(hasPendingCheckChanges(), false);
      } finally { await view.destroy(); }
    });
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Array.from(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
