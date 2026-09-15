import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("point rule workspace preserves filters and safely submits drawer edits", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/police/admin/points/rules", pretendToBeVisual: true });
  const React = require("react") as typeof import("react");
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const rules = [
    { id: "late", category: "출결", name: "지각", points: -2, description: "시작 후 도착", isActive: true },
    { id: "help", category: "생활", name: "학습 도움", points: 3, description: "학습 참여", isActive: false },
  ];
  const writes: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  let rejectSave = false;
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, React, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    fetch: async (url: string, init?: RequestInit) => {
      if (url.endsWith("settings/templates")) {
        const current = { periods: [], rooms: [], examTypes: [], pointRules: rules };
        if (!init?.method && rejectSave) return new Response(JSON.stringify({error:"저장 실패 테스트"}),{status:400});
        if (!init?.method) return new Response(JSON.stringify({ current, today: "2026-09-15", earliestCalculationDate: "2026-09-15" }));
        const body = JSON.parse(String(init.body)); writes.push({url,method:init.method,body});
        if (body.action === "preview") return new Response(JSON.stringify({ revision:"review", after:body.value.payload, changes:[{section:"설정",name:"name",before:"이전",after:"변경"}] }));
        rules.splice(0,rules.length,...body.value.payload.pointRules);
        return new Response(JSON.stringify({status:"APPLIED"}));
      }
      const method = init?.method ?? "GET";
      if (method === "GET") return new Response(JSON.stringify(url.endsWith("point-categories")
        ? { categories: ["출결", "생활"], customizationEnabled: true } : { rules }));
      const body = JSON.parse(String(init?.body ?? "{}"));
      writes.push({ url, method, body });
      if (rejectSave) return new Response(JSON.stringify({ error: "저장 실패 테스트" }), { status: 400 });
      if (url.endsWith("point-categories")) return new Response(JSON.stringify({ categories: ["출결", body.nextName ?? body.name] }));
      return new Response(JSON.stringify({ rule: { ...rules[0], ...body } }));
    },
  };
  const descriptors = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
  const { Simulate } = require("react-dom/test-utils") as typeof import("react-dom/test-utils");
  const { PointRuleManager } = await import("../../components/points/PointRuleManager");
  const { act } = React;
  const root = createRoot(document.getElementById("root")!);
  const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); }); };
  const button = (name: string, parent: ParentNode = document) => {
    const element = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find((node) => (node.getAttribute("aria-label") ?? node.textContent?.trim()) === name);
    assert.ok(element, "button " + name); return element;
  };
  const click = async (element: HTMLElement) => { await act(async () => element.click()); await tick(); };
  const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => { element.value = value; Simulate.change(element); });
  };
  const drawer = () => document.querySelector<HTMLElement>(".admin-drawer")!;
  try {
    await act(async () => root.render(React.createElement(PointRuleManager, { divisionSlug: "police" })));
    await tick();

    await t.test("filters survive navigation and category count opens the matching rules", async () => {
      const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
      await change(search, "지각");
      assert.equal(document.querySelectorAll("#point-rule-settings-panel-rules tbody tr").length, 1);
      await click(button("카테고리"));
      await click(button("규칙 목록"));
      assert.equal(search.value, "지각");
      await click(button("카테고리"));
      await click(button("생활 규칙 1개 보기"));
      assert.equal(document.querySelector("#point-rule-settings-panel-rules tbody")?.textContent?.includes("학습 도움"), true);
      assert.equal(search.value, "");
      await change(document.querySelector<HTMLSelectElement>("#point-rule-settings-panel-rules select")!, "");
    });

    await t.test("edit opens populated fields and footer retains the form association", async () => {
      await click(button("지각 수정"));
      const input = drawer().querySelector<HTMLInputElement>('input[placeholder="예: 지각"]')!;
      assert.equal(input.value, "지각");
      assert.equal(drawer().querySelector<HTMLInputElement>('input[type="number"]')?.value, "-2");
      await change(input, "지각 기준 수정");
      const save = button("변경 저장", drawer());
      assert.equal(save.form, drawer().querySelector("form"));
      assert.equal(drawer().querySelector(".admin-dialog-body")?.contains(save), false);
      await click(save);
      await click(button("변경 미리보기"));
      await click(button("변경 적용"));
      assert.equal(document.querySelector(".admin-drawer"), null);
      assert.equal((writes.at(-1)!.body as any).value.payload.pointRules[0].name, "지각 기준 수정");
      assert.ok(document.querySelector("tbody")?.textContent?.includes("지각 기준 수정"));
    });

    await t.test("failed saves retain the draft and closing requires discard confirmation", async () => {
      await click(button("지각 기준 수정 수정"));
      const input = drawer().querySelector<HTMLInputElement>('input[placeholder="예: 지각"]')!;
      await change(input, "유지할 초안");
      rejectSave = true;
      await click(button("변경 저장", drawer()));
      assert.equal(input.value, "유지할 초안");
      assert.ok(drawer());
      await click(button("취소", drawer()));
      await click(button("계속 편집"));
      assert.equal(input.value, "유지할 초안");
      await click(button("취소", drawer()));
      await click(button("변경 폐기"));
      assert.equal(document.querySelector(".admin-drawer"), null);
      rejectSave = false;
    });

    await t.test("category rename updates its list and currently selected filter", async () => {
      await click(button("카테고리"));
      await click(button("생활 규칙 1개 보기"));
      await click(button("카테고리"));
      await click(button("생활 카테고리 수정"));
      await change(drawer().querySelector<HTMLInputElement>("input")!, "생활지도");
      await click(button("변경 저장", drawer()));
      assert.equal(document.querySelector(".admin-drawer"), null);
      await click(button("규칙 목록"));
      assert.equal(document.querySelector<HTMLSelectElement>("#point-rule-settings-panel-rules select")?.value, "생활지도");
      assert.ok(document.querySelector("#point-rule-settings-panel-rules tbody")?.textContent?.includes("생활지도"));
    });

    await t.test("delete does not send a mutation until confirmed", async () => {
      const before = writes.length;
      await click(button("학습 도움 비활성화"));
      assert.equal(writes.length, before);
      await click(button("취소", document.querySelector(".admin-dialog")!));
      assert.equal(writes.length, before);
      await click(button("학습 도움 비활성화"));
      await click(button("비활성화", document.querySelector(".admin-dialog")!));
      await click(button("변경 미리보기"));
      await click(button("변경 적용"));
      assert.equal((writes.at(-1)!.body as any).value.payload.pointRules.find((r:any)=>r.id==="help").isActive,false);
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Array.from(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
