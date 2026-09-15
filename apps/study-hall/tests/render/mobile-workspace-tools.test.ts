import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileWorkspaceHost, MobileWorkspaceScope, MobileWorkspaceTools } from "../../components/ui/MobileWorkspaceTools";
import { MobileDisclosure } from "../../components/ui/MobileDisclosure";
import { PointGrantManager } from "../../components/points/PointGrantManager";
import type { PointRecordItem } from "../../lib/services/point.service";

Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const require = createRequire(import.meta.url);

test("mobile tools heading stays hidden above the mobile breakpoint", () => {
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.admin-mobile-tools \.admin-mobile-tools-heading\s*\{\s*display: none;/);
});
const { JSDOM } = require("jsdom");

test("report export tools are not trapped inside a collapsible ancestor", () => {
  const source = ts.createSourceFile("ReportsDashboard.tsx", fs.readFileSync(new URL("../../components/reports/ReportsDashboard.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trapped: string[] = [];
  function visit(node: import("typescript").Node, inDisclosure = false) {
    const name = ts.isJsxElement(node) ? node.openingElement.tagName.getText(source) : "";
    if (name === "MobileWorkspaceTools" && inDisclosure) trapped.push(name);
    ts.forEachChild(node, (child: import("typescript").Node) => visit(child, inDisclosure || name === "MobileDisclosure"));
  }
  visit(source);
  assert.deepEqual(trapped, [], "A portaled trigger must not open a drawer inside closed details");
});

test("responsive tools retain one form and its values in server markup", () => {
  const html = renderToStaticMarkup(React.createElement(MobileWorkspaceTools, {
    title: "조회 조건",
    children: React.createElement("input", { type: "date", value: "2026-06-01", readOnly: true }),
  }));
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('input[type="date"]').length, 1);
  assert.equal(doc.querySelector("input").value, "2026-06-01");
  assert.equal(doc.querySelector(".admin-mobile-tools").dataset.open, "false");
  const trigger = doc.querySelector('[aria-haspopup="dialog"]');
  assert.ok(doc.getElementById(trigger.getAttribute("aria-controls")));
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
  dom.window.close();
});

test("inactive tabs do not leak tool triggers into the mobile header", () => {
  const html = renderToStaticMarkup(React.createElement(MobileWorkspaceTools, {
    title: "숨은 탭 도구", active: false, children: "필터 값 유지",
  }));
  assert.doesNotMatch(html, /aria-haspopup/);
  assert.match(html, /필터 값 유지/);
  const scoped = renderToStaticMarkup(React.createElement(MobileWorkspaceScope, {
    active: false, children: React.createElement(MobileWorkspaceScope, {
      active: true, children: React.createElement(MobileWorkspaceTools, { title: "중첩 도구", children: "보존한 값" }),
    }),
  }));
  assert.doesNotMatch(scoped, /aria-haspopup/);
  assert.match(scoped, /보존한 값/);
});

test("mobile point records expose one detail action and preserve desktop deletion", () => {
  const record: PointRecordItem = {
    id: "point-test", studentId: "student-test", studentName: "검증학생", studentNumber: "90001",
    ruleId: null, ruleName: "과거 기록", displayName: null, category: "attendance", categoryLabel: "출결",
    points: 2, notes: "상세에서 확인할 메모", recordedById: "admin-test", recordedByName: "관리자",
    createdAt: "2026-09-15T00:00:00.000Z", date: "2026-06-15", displayDateTime: "2026-06-15T00:00:00.000Z",
  };
  const html = renderToStaticMarkup(React.createElement(PointGrantManager, {
    divisionSlug: "police", students: [], rules: [], initialRecords: [record],
    initialDateFrom: "2026-06-01", initialDateTo: "2026-06-30",
  }));
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const row = doc.querySelector(".admin-list-row-stack");
  assert.equal(row.tagName, "BUTTON");
  assert.equal(row.querySelectorAll("button, a, input").length, 0);
  assert.match(row.textContent, /출결/);
  assert.match(row.textContent, /과거 기록/);
  assert.equal(doc.querySelectorAll('table button[title="기록 삭제"]').length, 1);
  assert.equal(doc.querySelector('input[type="date"]').value, "2026-06-01");
  dom.window.close();
});

test("responsive tools and disclosure preserve fields across closing and resizing", async () => {
  const dom = new JSDOM('<html><body><header id="host"></header><main id="root"></main></body></html>', { url: "http://localhost" });
  const listeners = new Set<() => void>();
  const query = { matches: true, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  dom.window.matchMedia = () => query;
  const bindings: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(bindings).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(bindings)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import("react-dom/client");
  const { act } = React;
  const host = dom.window.document.getElementById("host");
  const root = createRoot(dom.window.document.getElementById("root"));
  function Fields() {
    const [date, setDate] = React.useState("2026-09-15");
    return React.createElement(React.Fragment, null,
      React.createElement("input", { type: "date", value: date, readOnly: true }),
      React.createElement("button", { onClick: () => setDate("2026-06-15"), "data-test-date": true }, "날짜 변경"),
    );
  }
  try {
    await act(async () => { root.render(React.createElement(MobileWorkspaceHost.Provider, { value: host }, React.createElement(MobileWorkspaceTools, { title: "작업", children: React.createElement(Fields) }))); });
    const doc = dom.window.document;
    const trigger = host.querySelector("button");
    const input = doc.querySelector("input");
    trigger.focus();
    await act(async () => { trigger.click(); });
    assert.equal(doc.querySelector('[role="dialog"]').getAttribute("aria-modal"), "true");
    await act(async () => { doc.querySelector("[data-test-date]").click(); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.querySelector("input"), input);
    assert.equal(input.value, "2026-06-15");
    await act(async () => { query.matches = false; listeners.forEach((listener) => listener()); });
    assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
    assert.equal(doc.querySelector("input"), input);
    assert.equal(input.value, "2026-06-15");
    await act(async () => { root.render(React.createElement(MobileDisclosure, { title: "조회 조건", children: React.createElement("input", { defaultValue: "June" }) })); });
    const details = doc.querySelector("details");
    const field = doc.querySelector("input");
    assert.equal(details.open, true);
    await act(async () => { query.matches = true; listeners.forEach((listener) => listener()); });
    assert.equal(details.open, false);
    await act(async () => { details.querySelector("summary").click(); });
    assert.equal(details.open, true);
    field.value = "Changed June";
    await act(async () => { details.querySelector("summary").click(); });
    for (let cycle = 0; cycle < 3; cycle++) {
      await act(async () => { query.matches = false; listeners.forEach((listener) => listener()); });
      assert.equal(details.open, true);
      await act(async () => { query.matches = true; listeners.forEach((listener) => listener()); });
      assert.equal(details.open, false);
      assert.equal(doc.querySelector("input"), field);
      assert.equal(field.value, "Changed June");
    }
  } finally {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of Array.from(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
