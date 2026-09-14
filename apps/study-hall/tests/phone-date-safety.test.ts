import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const require = createRequire(import.meta.url);

// Exercise the real form and navigation guard: a mocked guard would let the
// test bypass precisely the save/date boundary it is intended to protect.
test("phone date safety: lookup failures and delayed saves", async (t) => {
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
  const { CheckDraftOwner } = await import("../components/ui/CheckDraftSafety");
  const { PhoneCheckForm } = await import("../components/phones/PhoneCheckForm");
  const { hasPendingCheckChanges } = await import("../lib/check-navigation");
  const { act, createElement: h } = React;
  const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); }); };
  const button = (text: string) => {
    const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((node) => node.textContent?.trim() === text);
    assert.ok(found, `button ${text} exists`); return found;
  };
  const click = async (node: HTMLElement) => { await act(async () => { node.click(); }); };
  const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;
  const changeDate = async (value: string) => {
    await act(async () => { dateInput().value = value; Simulate.change(dateInput()); });
  };
  const snapshot = (date = "2020-01-01", name = "학생", status?: "SUBMITTED") => ({
    date, attendanceIntegrationEnabled: false,
    students: [{ id: "s1", name, studentNumber: "10001", seatLabel: "A-01", studyRoomName: "자습실", studyTrack: null }],
    periods: [{ periodId: "p1", periodName: "1교시", periodLabel: null, startTime: "09:00", endTime: "10:00",
      records: status ? [{ studentId: "s1", status, rentalNote: null }] : [],
      attendance: [], attendanceUnprocessedCount: 0, attendanceBlockedCount: 0 }],
  });
  type Request = { url: string; options?: RequestInit; result: ReturnType<typeof deferred<Response>> };
  const setup = async (context: typeof t) => {
    const requests: Request[] = [];
    context.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
      const result = deferred<Response>(); requests.push({ url: String(url), options, result }); return result.promise;
    });
    localStorage.clear(); sessionStorage.clear();
    window.history.replaceState({ __NA: true }, "", "/check");
    const root = createRoot(document.getElementById("root")!);
    const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    await act(async () => root.render(h(AppRouterContext.Provider, { value: router }, h(CheckDraftOwner, { owner: "date-qa", children:
      h(PhoneCheckForm, { divisionSlug: "police", initialDate: "2020-01-01", initialSnapshot: snapshot() as never, initialActivePeriodId: "p1" }),
    }))));
    return { requests, destroy: async () => { await act(async () => root.unmount()); await tick(); } };
  };

  try {
    for (const failure of ["network", "http", "body"] as const) {
      await t.test(`${failure} lookup failure keeps the loaded date and the next save on that date`, async (t) => {
        const view = await setup(t);
        try {
          await changeDate("2020-01-02");
          assert.match(view.requests[0].url, /date=2020-01-02/);
          assert.equal(dateInput().value, "2020-01-01", "display date stays bound to the loaded roster until lookup succeeds");
          await act(async () => {
            if (failure === "network") view.requests[0].result.reject(new Error("offline"));
            else if (failure === "http") view.requests[0].result.resolve(Response.json({ error: "unavailable" }, { status: 503 }));
            else view.requests[0].result.resolve(new Response("invalid JSON"));
          });
          assert.equal(dateInput().value, "2020-01-01");
          assert.match(document.querySelector("tbody")!.textContent!, /학생/);
          await click(button("반납"));
          assert.equal(view.requests.length, 2);
          assert.equal(JSON.parse(String(view.requests[1].options?.body)).date, "2020-01-01");
          await act(async () => view.requests[1].result.resolve(Response.json({ snapshot: snapshot("2020-01-01", "학생", "SUBMITTED") })));
          await tick();
          assert.equal(hasPendingCheckChanges(), false);
        } finally { await view.destroy(); }
      });
    }

    await t.test("a delayed POST body blocks date changes until acknowledgement, then loads the new date", async (t) => {
      const view = await setup(t);
      try {
        await click(button("반납"));
        let body!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller; } });
        await act(async () => view.requests[0].result.resolve(new Response(stream, { headers: { "Content-Type": "application/json" } })));
        await changeDate("2020-01-02");
        assert.equal(view.requests.length, 1, "no date GET can race the pending save");
        assert.equal(dateInput().value, "2020-01-01");
        assert.equal(button("저장하지 않고 떠나기").disabled, true);
        await act(async () => {
          body.enqueue(new TextEncoder().encode(JSON.stringify({ snapshot: snapshot("2020-01-01", "이전 날짜 학생", "SUBMITTED") })));
          body.close();
        });
        await tick();
        assert.equal(document.querySelector('[role="dialog"]'), null);
        await changeDate("2020-01-02");
        assert.equal(view.requests.length, 2);
        await act(async () => view.requests[1].result.resolve(Response.json({ snapshot: snapshot("2020-01-02", "새 날짜 학생") })));
        assert.equal(dateInput().value, "2020-01-02");
        assert.match(document.querySelector("tbody")!.textContent!, /새 날짜 학생/);
        assert.doesNotMatch(document.querySelector("tbody")!.textContent!, /이전 날짜 학생/);
        await click(button("반납"));
        assert.equal(JSON.parse(String(view.requests[2].options?.body)).date, "2020-01-02");
        await act(async () => view.requests[2].result.resolve(Response.json({ snapshot: snapshot("2020-01-02", "새 날짜 학생", "SUBMITTED") })));
      } finally { await view.destroy(); }
    });

    await t.test("a failed save retains its date and input until retry or explicit discard", async (t) => {
      const view = await setup(t);
      try {
        await click(button("반납"));
        await changeDate("2020-01-02");
        assert.equal(button("저장하지 않고 떠나기").disabled, true);
        await act(async () => view.requests[0].result.reject(new Error("offline")));
        await tick();
        assert.equal(hasPendingCheckChanges(), true);
        await click(button("머무르기"));
        assert.equal(dateInput().value, "2020-01-01");
        assert.equal(button("반납").getAttribute("aria-pressed"), "true");
        await changeDate("2020-01-02");
        assert.equal(view.requests.length, 1);
        await click(button("저장하지 않고 떠나기"));
        await tick();
        assert.equal(view.requests.length, 2);
        await act(async () => view.requests[1].result.resolve(Response.json({ snapshot: snapshot("2020-01-02", "새 날짜 학생") })));
        await tick();
        assert.equal(dateInput().value, "2020-01-02");
        assert.equal(hasPendingCheckChanges(), false);
        assert.doesNotMatch(document.querySelector("tbody")!.textContent!, /저장 실패/);
      } finally { await view.destroy(); }
    });
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Array.from(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
